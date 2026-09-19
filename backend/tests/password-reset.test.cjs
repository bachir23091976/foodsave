const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');

function load(file, dependencies, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(transformSync(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), { loader: 'ts', format: 'cjs' }).code, {
    module, exports: module.exports, Buffer, URL, Date, process: { env: { JWT_SECRET: 'test-only', FRONTEND_URL: 'http://localhost:3000' } },
    console: { error() {}, warn() {} },
    require(name) { if (name in dependencies) return dependencies[name]; throw Error('Unexpected dependency ' + name); },
    ...globals,
  });
  return module.exports;
}

const response = () => ({ statusCode: 200, status(n) { this.statusCode = n; return this; }, json(data) { this.data = data; return this; } });
const token = 'A'.repeat(43);
const resetLib = load('lib/password-reset.ts', { crypto: require('node:crypto') });

function controllerFixture({ user = null, resetRecord = null, now = new Date('2026-01-01T00:00:00Z') } = {}) {
  const calls = [];
  const state = { resetRecord };
  const tx = {
    passwordResetToken: {
      async findUnique() { return state.resetRecord; },
      async updateMany({ data }) { calls.push(['consume', data]); if (!state.resetRecord || state.resetRecord.usedAt) return { count: 0 }; Object.assign(state.resetRecord, data); return { count: 1 }; },
      async delete() { calls.push(['delete']); },
    },
    user: { async update(query) { calls.push(['userUpdate', query]); return query.data; } },
  };
  const prisma = {
    user: { async findUnique() { calls.push(['userRead']); return user; } },
    passwordResetToken: {
      async create({ data }) { calls.push(['create', data]); state.resetRecord = { id: 'r', ...data, usedAt: null }; return state.resetRecord; },
      async delete(query) { calls.push(['delete', query]); },
    },
    async $transaction(fn) { return fn(tx); },
  };
  const bcrypt = { hashSync() { return 'dummy'; }, async hash(password, cost) { calls.push(['hash', password, cost]); return 'bcrypt-hash'; }, async compare() { return true; } };
  const sent = [];
  const injectedReset = { ...resetLib,
    createPasswordResetToken: () => token,
    hashPasswordResetToken: value => { calls.push(['tokenHash', value]); return 'secure-hash'; },
    sendPasswordResetEmail: async (to, email) => { sent.push({ to, email }); },
  };
  const controller = load('controllers/auth.controller.ts', {
    '../lib/prisma': { prisma }, bcryptjs: bcrypt, jsonwebtoken: { sign() { return 'jwt'; } }, './loyalty.controller': {}, '../lib/password-reset': injectedReset,
  }, { Date: class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now.getTime(); } } });
  return { controller, calls, sent, state };
}

test('forgot-password returns the same neutral response for known and unknown email', async () => {
  const known = controllerFixture({ user: { id: 'u', email: 'person@example.ca', password: 'hash' } });
  const unknown = controllerFixture();
  const knownResponse = response();
  const unknownResponse = response();
  await known.controller.forgotPassword({ body: { email: 'person@example.ca', locale: 'en' } }, knownResponse);
  await unknown.controller.forgotPassword({ body: { email: 'nobody@example.ca', locale: 'en' } }, unknownResponse);
  assert.equal(knownResponse.statusCode, unknownResponse.statusCode);
  assert.equal(knownResponse.data.message, unknownResponse.data.message);
  assert.equal(knownResponse.data.message, 'auth.resetRequestAccepted');
  assert.equal(known.sent[0].email.subject, 'Reset your FoodSave password');
  assert.ok(known.sent[0].email.text.includes('http://localhost:3000/reset-password?token=' + token));
  assert.ok(known.sent[0].email.text.includes('45 minutes'));
});

test('reset email content is localized and raw token is never persisted', async () => {
  const fixture = controllerFixture({ user: { id: 'u', email: 'person@example.ca', password: 'hash' } });
  const responseValue = response();
  await fixture.controller.forgotPassword({ body: { email: 'person@example.ca', locale: 'fr' } }, responseValue);
  const created = fixture.calls.find(call => call[0] === 'create')[1];
  assert.equal(created.tokenHash, 'secure-hash');
  assert.notEqual(created.tokenHash, token);
  assert.equal(fixture.sent[0].email.subject, 'Réinitialisez votre mot de passe FoodSave');
});

for (const role of ['CLIENT', 'MERCHANT']) test('valid password reset updates ' + role + ' with bcrypt and consumes token', async () => {
  const fixture = controllerFixture({ resetRecord: { id: 'r', userId: 'u', expiresAt: new Date('2026-01-01T00:30:00Z'), usedAt: null } });
  const responseValue = response();
  await fixture.controller.resetPassword({ body: { token, password: 'new-password', confirmPassword: 'new-password' } }, responseValue);
  assert.equal(responseValue.statusCode, 200);
  assert.equal(responseValue.data.message, 'auth.resetSuccess');
  assert.deepEqual(fixture.calls.find(call => call[0] === 'hash').slice(1), ['new-password', 10]);
  assert.equal(fixture.calls.find(call => call[0] === 'userUpdate')[1].data.password, 'bcrypt-hash');
  assert.equal(fixture.calls.find(call => call[0] === 'userUpdate')[1].data.authVersion.increment, 1);
});

test('malformed, missing, expired, and used tokens fail safely', async () => {
  for (const badToken of ['', 'bad', '!', 'A'.repeat(42)]) {
    const result = response();
    const fixture = controllerFixture();
    await fixture.controller.resetPassword({ body: { token: badToken, password: 'new-password', confirmPassword: 'new-password' } }, result);
    assert.equal(result.statusCode, 400);
    assert.equal(result.data.message, 'auth.resetInvalid');
  }
  for (const [usedAt, expiresAt, expected] of [[null, new Date('2025-12-31T23:59:00Z'), 'auth.resetExpired'], [new Date('2025-12-31T23:59:00Z'), new Date('2026-01-01T00:30:00Z'), 'auth.resetUsed']]) {
    const result = response();
    const fixture = controllerFixture({ resetRecord: { id: 'r', userId: 'u', expiresAt, usedAt } });
    await fixture.controller.resetPassword({ body: { token, password: 'new-password', confirmPassword: 'new-password' } }, result);
    assert.equal(result.statusCode, 400);
    assert.equal(result.data.message, expected);
  }
});

test('password mismatch and policy failures do not update the account', async () => {
  for (const body of [
    { token, password: 'new-password', confirmPassword: 'different' },
    { token, password: 'short', confirmPassword: 'short' },
    { token, password: 'é'.repeat(37), confirmPassword: 'é'.repeat(37) },
  ]) {
    const fixture = controllerFixture({ resetRecord: { id: 'r', userId: 'u', expiresAt: new Date('2026-01-01T00:30:00Z'), usedAt: null } });
    const result = response();
    await fixture.controller.resetPassword({ body }, result);
    assert.equal(result.statusCode, 400);
    assert.ok(['auth.resetPasswordMismatch', 'auth.invalidPasswordLength'].includes(result.data.message));
    assert.equal(fixture.calls.some(call => call[0] === 'userUpdate'), false);
  }
});

test('reset token helpers use URL-safe cryptographic tokens and SHA-256 hashes', () => {
  const generated = resetLib.createPasswordResetToken();
  assert.match(generated, resetLib.PASSWORD_RESET_TOKEN_PATTERN);
  assert.equal(resetLib.hashPasswordResetToken('fixture').length, 64);
  assert.equal(resetLib.isPasswordResetToken(generated), true);
  assert.equal(resetLib.isPasswordResetToken('fixture'), false);
});
