const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');

const existingId = 'acct_existing_fixture';
const privateMessage = 'PRIVATE provider details: account, credentials, token';
function setup({ storedId = existingId, error, failAt = 'retrieve', account = {}, race = false } = {}) {
  let stored = storedId;
  const calls = [];
  const createdKeys = new Set();
  const prisma = { merchant: {
    async findUnique() { calls.push('read'); return { id: 'merchant-fixture', stripeAccountId: stored }; },
    async updateMany(q) {
      calls.push('write');
      assert.equal(q.where.id, 'merchant-fixture');
      assert.equal(q.where.stripeAccountId, null);
      assert.deepEqual(Object.keys(q.data), ['stripeAccountId']);
      assert.equal(q.data.stripeAccountId, 'acct_new_fixture');
      if (race) { stored = existingId; return { count: 0 }; }
      if (stored !== null) return { count: 0 };
      stored = q.data.stripeAccountId;
      return { count: 1 };
    },
  } };
  const stripe = {
    accounts: {
      async retrieve(id) { calls.push('retrieve'); assert.equal(id, existingId); if (error && failAt === 'retrieve') throw error; return { id, charges_enabled: true, payouts_enabled: true, capabilities: { transfers: 'active' }, requirements: { currently_due: [] }, ...account }; },
      async create(payload, options) {
        assert.equal(options.idempotencyKey, 'foodsave_connect_merchant-fixture');
        createdKeys.add(options.idempotencyKey);
        calls.push('create');
        assert.equal(storedId, null, 'never create when an account was stored');
        assert.equal(payload.type, 'express'); assert.equal(payload.country, 'CA');
        assert.equal(payload.capabilities.card_payments.requested, true); assert.equal(payload.capabilities.transfers.requested, true);
        if (error && failAt === 'create') throw error;
        return { id: 'acct_new_fixture' };
      },
    },
    accountLinks: { async create(payload) {
      calls.push('link');
      assert.equal(payload.account, stored);
      assert.equal(payload.type, 'account_onboarding');
      assert.equal(payload.refresh_url, 'https://frontend.invalid/merchant/stripe-refresh');
      assert.equal(payload.return_url, 'https://frontend.invalid/merchant/stripe-success');
      if (error && failAt === 'link') throw error;
      return { url: 'https://connect.stripe.com/fixture' };
    } },
  };
  const module = { exports: {} };
  vm.runInNewContext(transformSync(fs.readFileSync(path.join(__dirname, '../src/controllers/merchant.controller.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code, {
    module, exports: module.exports,
    process: { env: { FRONTEND_URL: 'https://frontend.invalid' } },
    console: { error() { assert.fail('Raw provider errors must not be logged'); } },
    require(name) {
      if (name === '../lib/prisma') return { prisma };
      if (name === '../lib/stripe') return { stripe };
      if (name === '../lib/stripe-account-readiness') return require('./stripe-readiness-fixture.cjs');
      throw Error('Unexpected dependency ' + name);
    },
  });
  const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { this.body = JSON.parse(JSON.stringify(body)); return this; } };
  return { calls, res, createdKeys, stored: () => stored, async run(handler) { await module.exports[handler]({ userId: 'merchant-owner', body: {} }, res); return res; } };
}

const errors = [
  ['account_invalid', { type: 'StripePermissionError', code: 'account_invalid' }],
  ['resource_missing', { type: 'StripeInvalidRequestError', code: 'resource_missing' }],
  ['permission', { type: 'StripePermissionError', code: 'permission_denied' }],
  ['authentication', { type: 'StripeAuthenticationError', statusCode: 401 }],
  ['network', { type: 'StripeConnectionError' }],
  ['timeout', { code: 'ETIMEDOUT' }],
  ['provider', { type: 'StripeAPIError', statusCode: 503 }],
];
for (const handler of ['connectStripe', 'getStripeStatus']) {
  for (const [name, detail] of errors) test(`${handler}: ${name} preserves stored ID without writes, replacement, links or disclosure`, async () => {
    const h = setup({ error: { ...detail, message: privateMessage, raw: { secret: privateMessage } } });
    await h.run(handler);
    assert.equal(h.stored(), existingId);
    assert.equal(h.res.statusCode, 500);
    assert.deepEqual(h.calls, ['read', 'retrieve']);
    assert.deepEqual(Object.keys(h.res.body), ['message']);
    const output = JSON.stringify(h.res.body);
    assert.ok(!output.includes(privateMessage)); assert.ok(!output.includes(existingId));
  });
}
test('existing account onboarding reuses account and only creates its link', async () => {
  const h = setup(); await h.run('connectStripe');
  assert.equal(h.res.statusCode, 200); assert.equal(h.res.body.url, 'https://connect.stripe.com/fixture');
  assert.deepEqual(h.calls, ['read', 'retrieve', 'link']); assert.equal(h.stored(), existingId);
});
test('account link failure preserves existing ID and returns no raw error', async () => {
  const h = setup({ error: { message: privateMessage }, failAt: 'link' }); await h.run('connectStripe');
  assert.equal(h.res.statusCode, 500); assert.equal(h.stored(), existingId);
  assert.deepEqual(h.calls, ['read', 'retrieve', 'link']); assert.ok(!JSON.stringify(h.res.body).includes(privateMessage));
});
test('no stored account retains normal new-account onboarding', async () => {
  const h = setup({ storedId: null }); await h.run('connectStripe');
  assert.equal(h.res.statusCode, 200); assert.equal(h.stored(), 'acct_new_fixture');
  assert.deepEqual(h.calls, ['read', 'create', 'write', 'link']);
});
test('concurrent first-time onboarding uses the same provider idempotency key and preserves the winning association', async () => {
  const h = setup({ storedId: null });
  await Promise.all([h.run('connectStripe'), h.run('connectStripe')]);
  assert.equal(h.createdKeys.size, 1);
  assert.equal(h.calls.filter(c => c === 'create').length, 2);
  assert.equal(h.stored(), 'acct_new_fixture');
  assert.equal(h.res.statusCode, 200);
});
test('conditional initial assignment never overwrites a concurrent stored account', async () => {
  const h = setup({ storedId: null, race: true }); await h.run('connectStripe');
  assert.equal(h.stored(), existingId); assert.equal(h.res.statusCode, 200);
  assert.deepEqual(h.calls, ['read', 'create', 'write', 'read', 'link']);
});
test('new-account creation failure does not write or create an AccountLink', async () => {
  const h = setup({ storedId: null, failAt: 'create', error: { message: privateMessage } }); await h.run('connectStripe');
  assert.equal(h.res.statusCode, 500); assert.equal(h.stored(), null);
  assert.deepEqual(h.calls, ['read', 'create']); assert.ok(!JSON.stringify(h.res.body).includes(privateMessage));
});
test('status without stored account is NOT_CONNECTED with no writes or Stripe calls', async () => {
  const h = setup({ storedId: null }); await h.run('getStripeStatus');
  assert.deepEqual(h.res.body, { status: 'NOT_CONNECTED', transfersActive: false, chargesEnabled: false, payoutsEnabled: false, currentlyDue: [] });
  assert.deepEqual(h.calls, ['read']);
});
for (const [name, account, expected] of [
  ['ready', {}, 'READY'],
  ['transfers inactive', { capabilities: { transfers: 'inactive' } }, 'ONBOARDING_INCOMPLETE'],
  ['charges disabled', { charges_enabled: false }, 'ONBOARDING_INCOMPLETE'],
  ['payouts disabled', { payouts_enabled: false }, 'ONBOARDING_INCOMPLETE'],
  ['requirement due', { requirements: { currently_due: ['individual.verification.proof_of_liveness'] } }, 'ONBOARDING_INCOMPLETE'],
]) test(`status retains READY policy: ${name}, without writes`, async () => {
  const h = setup({ account }); await h.run('getStripeStatus');
  assert.equal(h.res.statusCode, 200); assert.equal(h.res.body.status, expected);
  assert.equal(h.stored(), existingId); assert.deepEqual(h.calls, ['read', 'retrieve']);
});
