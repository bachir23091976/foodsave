const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const ACCOUNT = 'acct_1UHv0i7iwGIU8Zhu';
const PERSON = 'person_1UHv2V7iwGIU8Zhug6vlaWXr';
const FILE = 'file_1UI5rNBFFa4Liz3NiOOa2F3D';

function setup({ key = 'sk_test_fixture', role = 'ADMIN', authenticated = true, failAt, mismatch } = {}) {
  const calls = [];
  const routes = [];
  const snapshot = { id: ACCOUNT, type: 'express', country: 'CA', charges_enabled: true,
    payouts_enabled: false, capabilities: { transfers: 'active' },
    requirements: { currently_due: ['individual.verification.proof_of_liveness'], past_due: [],
      pending_verification: [], disabled_reason: 'requirements.past_due' }, email: 'PRIVATE_PII' };
  function record(kind) {
    calls.push(kind);
    if (failAt === kind) throw new Error('PRIVATE_SECRET Authorization DATABASE_URL PRIVATE_PII');
  }
  const stripe = { accounts: {
    async retrieve(id) {
      assert.equal(id, ACCOUNT);
      record(calls.includes('update') ? 'post-read' : 'account-read');
      return { ...snapshot, ...(mismatch === 'account' ? { id: 'wrong' } : {}) };
    },
    async retrievePerson(account, person) {
      assert.equal(account, ACCOUNT); assert.equal(person, PERSON); record('person-read');
      return { id: PERSON, account: mismatch === 'person' ? 'wrong' : ACCOUNT, first_name: 'PRIVATE_PII' };
    },
    async updatePerson(account, person, payload, options) {
      assert.equal(account, ACCOUNT); assert.equal(person, PERSON);
      assert.equal(JSON.stringify(payload), JSON.stringify({ verification: { document: { front: FILE } } }));
      assert.equal(options.idempotencyKey, 'foodsave_test_person_document_1UI5rNBFFa4Liz3NiOOa2F3D');
      record('update'); return { id: PERSON, first_name: 'PRIVATE_PII' };
    },
  } };
  const prisma = { user: { async findUnique() { return { authVersion: 0 }; } } };
  function load(file, dependencies) {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'),
      { loader: 'ts', format: 'cjs' }).code, {
      module, exports: module.exports, process: { env: { STRIPE_SECRET_KEY: key, JWT_SECRET: 'fixture' } },
      console: { error() { assert.fail('No provider/credential logging'); } },
      require(name) { assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name]; },
    });
    return module.exports;
  }
  const auth = load('middleware/auth.middleware.ts', {
    jsonwebtoken: { verify() { return { userId: 'admin-fixture', role, authVersion: 0 }; } }, '../lib/prisma': { prisma },
  });
  const controller = load('controllers/stripe-maintenance.controller.ts', { '../lib/stripe': { stripe } });
  const router = { get() {}, post(route, ...handlers) { routes.push({ route, handlers }); } };
  load('routes/admin.routes.ts', { express: { Router: () => router },
    '../controllers/admin.controller': {}, '../middleware/auth.middleware': auth,
    '../controllers/stripe-maintenance.controller': controller });
  const route = routes.find(r => r.route === '/maintenance/stripe-test-person-document');
  assert.ok(route); assert.equal(route.handlers.length, 3);
  const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  return { calls, res, async run() {
    const req = { headers: authenticated ? { authorization: 'Bearer fixture' } : {},
      body: { account: 'attacker', person: 'attacker', file: 'attacker', role: 'ADMIN' },
      query: { account: 'attacker', person: 'attacker', file: 'attacker' },
      params: { account: 'attacker', person: 'attacker', file: 'attacker' } };
    for (const handler of route.handlers) {
      let next = false; await handler(req, res, () => { next = true; }); if (!next) break;
    }
    assert.doesNotMatch(JSON.stringify(res.body), /PRIVATE|Authorization|DATABASE_URL|sk_test|acct_|person_|file_/);
  } };
}

test('unauthenticated request is rejected by existing authentication before Stripe', async () => {
  const h = setup({ authenticated: false }); await h.run(); assert.equal(h.res.statusCode, 401); assert.deepEqual(h.calls, []);
});
for (const role of ['CLIENT', 'MERCHANT', undefined]) test(`non-admin ${role} is rejected`, async () => {
  const h = setup({ role: role || 'UNKNOWN' }); await h.run(); assert.equal(h.res.statusCode, 403); assert.deepEqual(h.calls, []);
});
for (const key of ['sk_live_fixture', 'rk_live_fixture', '', 'unknown', 'rk_test_fixture', 'sk_test_']) {
  test(`non-approved credential format ${key.split('_').slice(0, 2).join('_')} fails closed`, async () => {
    const h = setup({ key }); await h.run(); assert.equal(h.res.statusCode, 403); assert.deepEqual(h.calls, []);
  });
}
test('ADMIN makes only fixed-target reads and one exact update; input cannot override IDs; no DB mutations', async () => {
  const h = setup(); await h.run(); assert.equal(h.res.statusCode, 200);
  assert.deepEqual(h.calls, ['account-read', 'person-read', 'update', 'post-read']);
  assert.equal(h.res.body.success, true); assert.equal(h.res.body.payoutsEnabled, false);
  assert.equal(h.res.body.transfers, 'active'); assert.equal(h.res.headers['Cache-Control'], 'no-store');
});
for (const mismatch of ['account', 'person']) test(`${mismatch} mismatch prevents mutation`, async () => {
  const h = setup({ mismatch }); await h.run(); assert.equal(h.res.statusCode, 409); assert.ok(!h.calls.includes('update'));
});
for (const failAt of ['account-read', 'person-read', 'update', 'post-read']) test(`${failAt} failure is sanitized without retry`, async () => {
  const h = setup({ failAt }); await h.run(); assert.equal(h.res.statusCode, 502);
  assert.equal(h.res.body.updateSucceeded, failAt === 'post-read');
  assert.ok(h.calls.filter(c => c === 'update').length <= 1);
  assert.equal(h.res.body.code, failAt === 'post-read' ? 'POST_UPDATE_VERIFICATION_UNAVAILABLE' : 'MAINTENANCE_OUTCOME_UNCONFIRMED');
});
