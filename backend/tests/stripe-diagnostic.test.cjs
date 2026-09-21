const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { transformSync } = require('esbuild');

function load(file, deps, env) {
  const module = { exports: {} };
  vm.runInNewContext(transformSync(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), { loader: 'ts', format: 'cjs' }).code, {
    module, exports: module.exports, process: { env },
    console: { error() { throw Error('Unexpected logging'); }, log() { throw Error('Unexpected logging'); } },
    require(name) { if (name in deps) return deps[name]; throw Error('Unexpected dependency ' + name); },
  });
  return module.exports;
}
const accountId = 'acct_connected1234';
const personId = 'person_sensitive5678';
const sensitive = 'PRIVATE DATA NEVER RETURN';
const reqs = { disabled_reason: 'requirements.past_due', currently_due: ['individual.verification.proof_of_liveness', personId + '.verification.document'], eventually_due: [], past_due: ['individual.verification.proof_of_liveness'], pending_verification: [], errors: [{ requirement: personId + '.verification.document', code: 'verification_failed', reason: sensitive }] };
const account = { id: accountId, type: 'express', country: 'CA', charges_enabled: true, payouts_enabled: false, capabilities: { card_payments: 'active', transfers: 'active' }, requirements: reqs, future_requirements: reqs, individual: { id: personId, first_name: sensitive }, email: sensitive, external_accounts: sensitive };
const person = { id: personId, first_name: sensitive, dob: sensitive, address: sensitive, verification: { status: 'unverified', document: sensitive }, relationship: { director: false, executive: false, owner: true, representative: true, title: sensitive }, requirements: reqs };

function setup({ role = 'ADMIN', claim = role, token = true, key = 'sk_test_fixture', jwt = 'local-test-jwt', fail, missing = false } = {}) {
  const calls = [];
  const env = { JWT_SECRET: jwt, STRIPE_SECRET_KEY: key };
  const prisma = {
    user: { async findUnique(q) { calls.push('user-read'); return q.select.authVersion ? { authVersion: 0 } : { role }; } },
    merchant: { async findMany(q) { calls.push('merchant-read'); assert.equal(q.take, 2); assert.equal(q.select.stripeAccountId, true); assert.equal(Object.keys(q.select).length, 1); assert.equal(q.where.owner.role, 'MERCHANT'); return missing ? [] : [{ stripeAccountId: accountId }]; } },
  };
  function Stripe(k, options) {
    calls.push('stripe-construct'); assert.equal(k, key); assert.equal(options.maxNetworkRetries, 0);
    this.accounts = {
      async retrieve(id) {
        calls.push(id ? 'account-get' : 'platform-get');
        if (fail === (id ? 'account' : 'platform')) throw { statusCode: 403, type: 'StripePermissionError', code: 'account_invalid', message: sensitive, raw: { apiKey: key } };
        if (id) { assert.equal(id, accountId); return account; }
        return { id: 'acct_platform9999', type: 'standard', country: 'CA', email: sensitive };
      },
      async *listPersons(id) { calls.push('persons-get'); assert.equal(id, accountId); if (fail === 'person') throw { statusCode: 403, type: 'StripePermissionError', code: 'permission_denied', message: sensitive }; yield person; },
    };
  }
  const controller = load('controllers/stripe-diagnostic.controller.ts', { crypto, stripe: Stripe, '../lib/prisma': { prisma } }, env);
  const auth = load('middleware/auth.middleware.ts', { jsonwebtoken: { verify() { return { userId: 'admin', role: claim, authVersion: 0 }; } }, '../lib/prisma': { prisma } }, env);
  const routes = [];
  const router = { get(p, ...handlers) { routes.push({ p, handlers }); }, post() {} };
  load('routes/admin.routes.ts', { express: { Router: () => router }, '../controllers/admin.controller': {}, '../controllers/stripe-diagnostic.controller': controller, '../middleware/auth.middleware': auth }, env);
  const route = routes.find(r => r.p === '/diagnostics/stripe-test');
  assert.ok(route);
  const res = { statusCode: 200, headers: {}, setHeader(k,v) { this.headers[k] = v; }, status(n) { this.statusCode = n; return this; }, json(body) { this.body = JSON.parse(JSON.stringify(body)); return this; } };
  return { calls, res, async run() {
    const req = { headers: token ? { authorization: 'Bearer private-auth-token' } : {}, query: { accountId: 'acct_attacker' } };
    async function next(i) { if (i === route.handlers.length) return; let pending; await route.handlers[i](req, res, () => { pending = next(i + 1); }); await pending; }
    await next(0); return res;
  } };
}

for (const role of ['CLIENT', 'MERCHANT']) test(role + ' rejected before Stripe or merchant access', async () => {
  const h = setup({ role }); await h.run(); assert.equal(h.res.statusCode, 403); assert.ok(h.calls.every(c => c === 'user-read'));
});
test('unauthenticated rejected', async () => { const h = setup({ token: false }); await h.run(); assert.equal(h.res.statusCode, 401); assert.deepEqual(h.calls, []); });
test('stale ADMIN JWT rejected by current database role', async () => { const h = setup({ role: 'CLIENT', claim: 'ADMIN' }); await h.run(); assert.equal(h.res.statusCode, 403); assert.ok(!h.calls.includes('stripe-construct')); });
for (const jwt of ['', 'changez-moi-en-production']) test('unsafe JWT configuration refuses diagnostic ' + jwt.length, async () => { const h = setup({ jwt }); await h.run(); assert.equal(h.res.statusCode, 503); assert.deepEqual(h.calls, []); });
for (const key of ['', 'sk_live_fixture', 'rk_live_fixture', 'pk_test_fixture']) test('non-secret fixture key gate ' + key, async () => { const h = setup({ key }); await h.run(); assert.equal(h.res.statusCode, 409); assert.ok(!h.calls.includes('stripe-construct')); assert.ok(!h.calls.includes('merchant-read')); });
for (const key of ['sk_test_fixture', 'rk_test_fixture']) test('ADMIN TEST diagnostic uses only reads and redacts output ' + key, async () => {
  const h = setup({ key }); const res = await h.run(); assert.equal(res.statusCode, 200); assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(res.body.platform.id, 'acct_...9999'); assert.equal(res.body.platform.fingerprint, crypto.createHash('sha256').update('acct_platform9999').digest('hex').slice(0, 16));
  assert.equal(res.body.account.id, 'acct_...1234'); assert.equal(res.body.persons[0].id, 'person_...5678'); assert.equal(res.body.persons[0].isAccountIndividual, true);
  assert.equal(res.body.account.requirements.currentlyDue[1], 'person_...5678.verification.document');
  const output = JSON.stringify(res.body);
  for (const forbidden of [sensitive, key, accountId, personId, 'acct_platform9999', 'private-auth-token', 'reason', 'email', 'document":', 'first_name', 'dob', 'address', 'external_accounts']) assert.ok(!output.includes(forbidden), forbidden);
  assert.deepEqual(h.calls, ['user-read','user-read','merchant-read','stripe-construct','platform-get','account-get','persons-get']);
});
test('missing target makes zero Stripe calls', async () => { const h = setup({ missing: true }); await h.run(); assert.equal(h.res.statusCode, 404); assert.ok(!h.calls.includes('stripe-construct')); });
for (const fail of ['platform', 'account', 'person']) test(fail + ' failure is sanitized and never writes or reconnects', async () => {
  const h = setup({ fail }); const res = await h.run();
  assert.ok(!JSON.stringify(res.body).includes(sensitive));
  if (fail === 'platform') { assert.equal(res.statusCode, 502); assert.ok(!h.calls.includes('account-get')); }
  if (fail === 'account') { assert.equal(res.body.connectedAccountAccessible, false); assert.deepEqual(res.body.error, { statusCode: 403, type: 'StripePermissionError', code: 'account_invalid' }); assert.ok(!h.calls.includes('persons-get')); }
  if (fail === 'person') assert.equal(res.body.personsAccessible, false);
});
