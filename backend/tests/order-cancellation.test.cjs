const assert = require("node:assert/strict");
const { test } = require("node:test");
const { loadController } = require("./order-confirmation.test.cjs");

function harness(outcome) {
  const state = { status: "CONFIRMED", reason: null, refunds: 0, stock: 0, stockAttempts: 0, lookups: 0 };
  const offer = { title: "test", pickupStart: new Date(Date.now() + 86400000), merchant: { ownerId: "merchant" } };
  const row = () => ({ id: "order", userId: "customer", offerId: "offer", stripeSessionId: "cs_test", pickupCode: "pickup", status: state.status, offer });
  const prisma = {
    merchant: { findUnique: async () => ({ id: "merchant" }) },
    order: {
      findFirst: async () => row(), findUnique: async () => row(),
      updateMany: async ({ where, data }) => {
        assert.notEqual(data.status, "CONFIRMED", "never restore fulfillment");
        if (where.status !== state.status) return { count: 0 };
        state.status = data.status;
        if (data.cancellationReason) state.reason = data.cancellationReason;
        return { count: 1 };
      },
    },
    offer: { update: async ({ data }) => {
      state.stockAttempts++;
      assert.equal(outcome === "succeeded" || outcome === "stock-error", true);
      assert.equal(data.quantity.increment, 1);
      if (outcome === "stock-error") throw Error("stock unavailable");
      state.stock++;
    } },
  };
  prisma.$queryRaw = async () => [];
  const context = new (require("node:async_hooks").AsyncLocalStorage)();
  let tail = Promise.resolve();
  prisma.$transaction = async fn => {
    let release; const previous = tail; tail = new Promise(r => release = r); await previous;
    const saved = structuredClone(state);
    try { return await context.run(true, () => fn(prisma)); } catch (e) { Object.assign(state, saved); throw e; } finally { release(); }
  };
  const updateOrder = prisma.order.updateMany;
  prisma.order.updateMany = args => context.getStore() ? updateOrder(args) : prisma.$transaction(() => updateOrder(args));
  prisma.customerCancellationRefund = {
    create: async ({data}) => { state.record = { refundId: null, paymentIntentId: null, reconciliationOwnerToken: null, inventoryRestored: false, creationDispatched: false, ...data }; return state.record; },
    findUnique: async () => state.record && ({ ...state.record, order: row() }),
    update: async ({data}) => { Object.assign(state.record, data); return { ...state.record }; },
  };
  prisma.offer.updateMany = async args => { await prisma.offer.update(args); return {count:1}; };
  const stripe = {
    checkout: { sessions: { retrieve: async () => {
      state.lookups++;
      if (outcome === "lookup-error") throw Error("lookup network failure");
      return { id: "cs_test", payment_status: "paid", metadata: {userId:"customer",offerId:"offer"}, amount_total:500, currency:"cad", payment_intent: outcome === "missing-payment" ? null : "pi_test" };
    } } },
    paymentIntents: { retrieve: async () => ({ id:"pi_test",status:"succeeded",amount_received:500,currency:"cad" }) },
    refunds: { list: async function* () {}, create: async (data, options) => {
      state.refunds++;
      assert.equal(state.status, "CANCELLED");
      assert.equal(data.payment_intent, "pi_test");
      assert.equal(data.reverse_transfer, true);
      assert.equal(data.refund_application_fee, true);
      assert.ok(["customer_cancel_order", "merchant_cancel_order"].includes(options.idempotencyKey));
      if (outcome === "timeout") throw Error("response lost after provider accepted refund");
      return { id: "re_test", payment_intent:"pi_test",amount:500,currency:"cad", status: outcome === "stock-error" ? "succeeded" : outcome };
    } },
  };
  const controller = loadController(prisma, stripe);
  async function cancel(actor) {
    state.winner ??= actor;
    const res = response();
    await controller[actor === "customer" ? "cancelOrder" : "cancelOrderByMerchant"](
      { userId: actor, body: { orderId: "order", reason: "Unavailable goods" } }, res);
    return res;
  }
  return { state, cancel, controller };
}
function response() {
  return { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}

for (const actor of ["customer", "merchant"]) {
  for (const outcome of ["succeeded", "pending", "requires_action", "failed", "canceled", "unrecognized", undefined, "timeout", "lookup-error", "missing-payment", "stock-error"]) {
    test(`${actor}: ${outcome ?? "absent status"} preserves cancellation and safe replay`, async () => {
      const h = harness(outcome);
      const res = await h.cancel(actor);
      assert.equal(h.state.status, "CANCELLED");
      assert.ok(h.state.reason);
      const reason = h.state.reason;
      assert.equal(h.state.stock, outcome === "succeeded" ? 1 : 0);
      assert.equal(h.state.stockAttempts, outcome === "succeeded" || (actor === "merchant" && outcome === "stock-error") ? 1 : 0);
      const expectedCalls = ["lookup-error", "missing-payment"].includes(outcome) ? 0 : 1;
      assert.equal(h.state.refunds, expectedCalls);
      if (outcome === "succeeded") assert.equal(res.code, 200);
      else if (["pending", "requires_action"].includes(outcome)) assert.match(res.body.message, /incomplet/);
      else if (["failed", "canceled"].includes(outcome)) assert.match(res.body.message, /investigation/);
      else if (outcome === "stock-error" && actor === "merchant") assert.match(res.body.message, /stock/);
      else assert.match(res.body.message, /incertain/);
      await h.cancel(actor);
      await h.cancel(actor === "customer" ? "merchant" : "customer");
      assert.equal(h.state.refunds, expectedCalls);
      assert.equal(h.state.lookups, 1);
      assert.equal(h.state.reason, reason);
      assert.equal(h.state.stock, outcome === "succeeded" ? 1 : 0);
      const pickup = response();
      await h.controller.validatePickup({ userId: "merchant", body: { pickupCode: "pickup" } }, pickup);
      assert.equal(pickup.code, 400);
      assert.equal(h.state.status, "CANCELLED");
    });
  }
}

test("concurrent customer and merchant cancellation permit only one refund", async () => {
  const h = harness("succeeded");
  await Promise.all([h.cancel("customer"), h.cancel("merchant")]);
  assert.equal(h.state.refunds, 1);
  assert.equal(h.state.stock, 1);
  assert.equal(h.state.status, "CANCELLED");
});
