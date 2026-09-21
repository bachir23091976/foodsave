const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const { stripeAccountReadiness } = require('./stripe-readiness-fixture.cjs');
const ready = { capabilities: { transfers: 'active' }, charges_enabled: true, payouts_enabled: true, requirements: { currently_due: [] } };
const variants = [
  ['READY', {}, true],
  ['payouts disabled', { payouts_enabled: false }, false],
  ['charges disabled', { charges_enabled: false }, false],
  ['transfers inactive', { capabilities: { transfers: 'inactive' } }, false],
  ['requirements due', { requirements: { currently_due: ['individual.verification.proof_of_liveness'] } }, false],
  ['unknown requirements', { requirements: null }, false],
  ['missing due list', { requirements: {} }, false],
];
const compiled = transformSync(fs.readFileSync(path.join(__dirname, '../src/controllers/order.controller.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
function harness({ account = ready, fail, missingId = false } = {}) {
  const calls = []; let payload;
  const storedId = missingId ? null : 'acct_fixture';
  const stripe = {
    accounts: { async retrieve(id) { assert.equal(id, storedId); calls.push('account'); if (fail && fail !== 'checkout') throw { code: fail, message: 'PRIVATE Stripe details' }; return account; } },
    checkout: { sessions: { async create(p) { calls.push('checkout'); if (fail === 'checkout') throw Error('PRIVATE Stripe details'); payload = JSON.parse(JSON.stringify(p)); return { url: 'https://checkout.stripe.com/fixture' }; } } },
  };
  const prisma = { offer: { async findUnique() { calls.push('offer'); return { id: 'offer', title: 'Pain', quantity: 1, pickupEnd: new Date(Date.now() + 3600000), discountedPrice: 5, merchant: { stripeAccountId: storedId } }; } } };
  const deps = { '../lib/prisma': { prisma }, '../lib/stripe': { stripe }, '../lib/stripe-account-readiness': { stripeAccountReadiness }, '@prisma/client': { Prisma: { TransactionIsolationLevel: { ReadCommitted: 'ReadCommitted' } } } };
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, Date, process: { env: { FRONTEND_URL: 'https://frontend.invalid' } }, console: { error() { assert.fail('Raw error logging'); } }, require(name) { return deps[name] || {}; } });
  const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { this.body = JSON.parse(JSON.stringify(body)); return this; } };
  return { calls, res, payload: () => payload, async run() { await module.exports.createOrder({ userId: 'customer', body: { offerId: 'offer', stripeAccountId: 'acct_attacker', ready: true } }, res); } };
}
for (const [name, overrides, expected] of variants) {
  test('shared readiness policy: ' + name, () => assert.equal(stripeAccountReadiness({ ...ready, ...overrides }).status === 'READY', expected));
  test('Checkout applies shared policy: ' + name, async () => {
    const h = harness({ account: { ...ready, ...overrides } }); await h.run();
    assert.equal(h.res.statusCode, expected ? 200 : 409);
    assert.deepEqual(h.calls, expected ? ['offer', 'account', 'checkout'] : ['offer', 'account']);
  });
}
for (const fail of ['account_invalid', 'resource_missing', 'permission_denied', 'authentication_error', 'ETIMEDOUT', 'network_error', 'provider_error', 'checkout']) test('Checkout fails closed and sanitized: ' + fail, async () => {
  const h = harness({ fail }); await h.run(); assert.equal(h.res.statusCode, 500);
  assert.deepEqual(Object.keys(h.res.body), ['message']); assert.ok(!JSON.stringify(h.res.body).includes('PRIVATE'));
  assert.deepEqual(h.calls, fail === 'checkout' ? ['offer','account','checkout'] : ['offer','account']);
});
test('Checkout without connected account performs no provider operation', async () => { const h = harness({ missingId: true }); await h.run(); assert.equal(h.res.statusCode, 400); assert.deepEqual(h.calls, ['offer']); });
test('READY Checkout preserves complete payment payload and economics', async () => {
  const h = harness(); await h.run();
  assert.deepEqual(h.payload(), {
    payment_method_types: ['card'], mode: 'payment',
    line_items: [{ price_data: { currency: 'cad', product_data: { name: 'Pain' }, unit_amount: 500 }, quantity: 1 }],
    payment_intent_data: { application_fee_amount: 75, transfer_data: { destination: 'acct_fixture' } },
    metadata: { offerId: 'offer', userId: 'customer' },
    success_url: 'https://frontend.invalid/order-success?session_id={CHECKOUT_SESSION_ID}', cancel_url: 'https://frontend.invalid/offers',
  });
});
