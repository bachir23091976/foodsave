const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const ACCOUNT = 'acct_1UHv0i7iwGIU8Zhu';
const PERSON = 'person_1UHv2V7iwGIU8Zhug6vlaWXr';
const hosted = 'https://verify.stripe.com/start/fixture';

function setup({ key = 'sk_test_fixture', role = 'ADMIN', authenticated = true, failAt, mismatch, status = false, url = hosted, live = false, ready = false } = {}) {
  const calls = [];
  const routes = [];
  const snapshot = { id: ACCOUNT, type: 'express', country: 'CA', charges_enabled: true,
    payouts_enabled: ready, capabilities: { transfers: 'active' },
    requirements: { currently_due: ready ? [] : ['individual.verification.proof_of_liveness'], past_due: [],
      pending_verification: [], disabled_reason: 'requirements.past_due',
      errors: [{ code: 'verification_failed_keyed_identity', requirement: 'individual.verification.document', reason: 'PRIVATE_PII' }],
      alternatives: [{ original_fields_due: ['individual.verification.proof_of_liveness'], alternative_fields_due: ['individual.verification.document'] }] }, email: 'PRIVATE_PII' };
  function record(kind) {
    calls.push(kind);
    if (failAt === kind) throw new Error('PRIVATE_SECRET Authorization DATABASE_URL PRIVATE_PII');
  }
  const stripe = { accounts: {
    async retrieve(id, params, options) {
      assert.equal(id, ACCOUNT);
      assert.equal(options.maxNetworkRetries, 0); record('account-read');
      return { ...snapshot, ...(mismatch === 'account' ? { id: 'wrong' } : {}) };
    },
    async retrievePerson(account, person, params, options) {
      assert.equal(options.maxNetworkRetries, 0);
      assert.equal(account, ACCOUNT); assert.equal(person, PERSON); record('person-read');
      return { id: PERSON, account: mismatch === 'person' ? 'wrong' : ACCOUNT, first_name: 'PRIVATE_PII', requirements: snapshot.requirements, verification: { status: 'unverified' } };
    },
  }, identity: { verificationSessions: { async create(payload, options) {
    assert.equal(JSON.stringify(payload), JSON.stringify({ type: 'document', related_person: { account: ACCOUNT, person: PERSON },
      options: { document: { require_matching_selfie: true } }, return_url: 'https://myfoodsave.ca/admin/stripe-maintenance' }));
    assert.equal(options.idempotencyKey, 'foodsave_test_identity_8Zhu_laWXr_v1');
    assert.equal(options.maxNetworkRetries, 0);
    record('create'); return { url, livemode: live, client_secret: 'PRIVATE_SECRET', verified_outputs: { first_name: 'PRIVATE_PII' } };
  } } } };
  const prisma = { user: { async findUnique() { return { authVersion: 0 }; } } };
  function load(file, dependencies) {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'),
      { loader: 'ts', format: 'cjs' }).code, {
      module, exports: module.exports, URL, process: { env: { STRIPE_SECRET_KEY: key, JWT_SECRET: 'fixture' } },
      console: { error() { assert.fail('No provider/credential logging'); } },
      require(name) { assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name]; },
    });
    return module.exports;
  }
  const auth = load('middleware/auth.middleware.ts', {
    jsonwebtoken: { verify() { return { userId: 'admin-fixture', role, authVersion: 0 }; } }, '../lib/prisma': { prisma },
  });
  const controller = load('controllers/stripe-maintenance.controller.ts', { '../lib/stripe': { stripe },
    '../lib/stripe-account-readiness': require('./stripe-readiness-fixture.cjs') });
  const router = { get(route, ...handlers) { routes.push({ route, handlers }); }, post(route, ...handlers) { routes.push({ route, handlers }); } };
  load('routes/admin.routes.ts', { express: { Router: () => router },
    '../controllers/admin.controller': {}, '../middleware/auth.middleware': auth,
    '../controllers/stripe-maintenance.controller': controller });
  assert.ok(!routes.some(r => r.route === '/maintenance/stripe-test-person-document'));
  const route = routes.find(r => r.route === (status ? '/maintenance/stripe-test-identity-status' : '/maintenance/stripe-test-identity-session'));
  assert.ok(route); assert.equal(route.handlers.length, 3);
  const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  return { calls, res, async run() {
    const req = { headers: authenticated ? { authorization: 'Bearer fixture' } : {},
      body: { account: 'attacker', person: 'attacker', return_url: 'https://evil.invalid', role: 'ADMIN' },
      query: { account: 'attacker', person: 'attacker', file: 'attacker' },
      params: { account: 'attacker', person: 'attacker', file: 'attacker' } };
    for (const handler of route.handlers) {
      let next = false; await handler(req, res, () => { next = true; }); if (!next) break;
    }
    assert.doesNotMatch(JSON.stringify(res.body), /PRIVATE|Authorization|DATABASE_URL|sk_test|acct_|person_|file_/);
  } };
}

for (const status of [false, true]) test(`unauthenticated request status=${status} rejected before Stripe`, async () => {
  const h = setup({ authenticated: false, status }); await h.run(); assert.equal(h.res.statusCode, 401); assert.deepEqual(h.calls, []);
});
for (const status of [false, true]) for (const role of ['CLIENT', 'MERCHANT', undefined]) test(`non-admin ${role} status=${status} rejected`, async () => {
  const h = setup({ role: role || 'UNKNOWN', status }); await h.run(); assert.equal(h.res.statusCode, 403); assert.deepEqual(h.calls, []);
});
for (const status of [false, true]) for (const key of ['sk_live_fixture', 'rk_live_fixture', '', 'unknown', 'rk_test_fixture', 'sk_test_']) {
  test(`non-approved credential format ${key.split('_').slice(0, 2).join('_')} status=${status} fails closed`, async () => {
    const h = setup({ key, status }); await h.run(); assert.equal(h.res.statusCode, 403); assert.deepEqual(h.calls, []);
  });
}
test('ADMIN creates only fixed linked session; input cannot override payload; no DB mutations', async () => {
  const h = setup(); await h.run(); assert.equal(h.res.statusCode, 200);
  assert.deepEqual(h.calls, ['account-read', 'person-read', 'create']);
  assert.equal(JSON.stringify(h.res.body), JSON.stringify({ success: true, url: hosted }));
  assert.equal(h.res.headers['Cache-Control'], 'no-store');
});
for (const mismatch of ['account', 'person']) test(`${mismatch} mismatch prevents mutation`, async () => {
  const h = setup({ mismatch }); await h.run(); assert.equal(h.res.statusCode, 502); assert.ok(!h.calls.includes('create'));
});
for (const failAt of ['account-read', 'person-read', 'create']) test(`${failAt} failure is sanitized without retry`, async () => {
  const h = setup({ failAt }); await h.run(); assert.equal(h.res.statusCode, 502);
  assert.ok(h.calls.filter(c => c === 'create').length <= 1);
  assert.equal(h.res.body.code, 'IDENTITY_CREATION_UNCONFIRMED');
});
for (const url of ['http://verify.stripe.com/start/a', 'https://verify.stripe.com.evil.invalid/a', 'https://evil.invalid', 'https://user@verify.stripe.com/a', 'https://verify.stripe.com:444/a', null, 'invalid']) test(`unsafe URL rejected: ${url}`, async () => {
  const h = setup({ url }); await h.run(); assert.equal(h.res.statusCode, 502); assert.equal(h.res.body.url, undefined);
});
test('unexpected live session is never returned', async () => {
  const h = setup({ live: true }); await h.run(); assert.equal(h.res.statusCode, 502);
});
for (const ready of [false, true]) test(`status reads only; shared readiness ${ready}; safe errors and alternatives`, async () => {
  const h = setup({ status: true, ready }); await h.run(); assert.equal(h.res.statusCode, 200);
  assert.deepEqual(h.calls, ['account-read', 'person-read']);
  assert.equal(h.res.body.account.status, ready ? 'READY' : 'ONBOARDING_INCOMPLETE');
  assert.equal(h.res.body.account.errors[0].reason, undefined);
  assert.equal(h.res.body.account.alternatives.length, 1); assert.equal(h.res.body.stripeMode, 'test');
  assert.equal(h.res.body.person, undefined);
});
test('status failure stays read-only and sanitized', async () => {
  const h = setup({ status: true, failAt: 'person-read' }); await h.run();
  assert.equal(h.res.statusCode, 502); assert.deepEqual(h.calls, ['account-read', 'person-read']);
});
test('obsolete mutation implementation and file reference removed', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/controllers/stripe-maintenance.controller.ts'), 'utf8');
  assert.doesNotMatch(source, /updatePerson|verification\.document\.front|file_1UI/);
});
