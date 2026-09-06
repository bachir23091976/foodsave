const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { transformSync } = require("esbuild"); // Already installed through tsx.
const QRCode = require("qrcode");

const controllerPath = path.join(__dirname, "../src/controllers/order.controller.ts");
// Expose the private routine only inside this isolated test module. Production
// exports and API contracts stay unchanged; no real Prisma/Stripe clients load.
const compiled = transformSync(
  fs.readFileSync(controllerPath, "utf8") +
    "\nexport { confirmPaidSession as testConfirmPaidSession };",
  { loader: "ts", format: "cjs", target: "es2020" }
).code;

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function paidSession(id) {
  return {
    id,
    payment_status: "paid",
    metadata: { userId: "customer", offerId: "offer" },
    payment_intent: `pi_${id}`,
  };
}

function harness({ recoveryError } = {}) {
  const state = { quantity: 1, decrements: 0, orders: [], refunds: [], rollbacks: 0, recoveryReads: 0 };
  const initialReadsReady = deferred();
  let initialReads = 0;
  let transactionTail = Promise.resolve();

  const prisma = {
    order: {
      async findUnique({ where }) {
        // Force both initial reads to miss before either transaction starts.
        // No sleeps: this reproduces the exact interleaving behind the bug.
        if (initialReads < 2) {
          initialReads += 1;
          if (initialReads === 2) initialReadsReady.resolve();
          await initialReadsReady.promise;
          return null;
        }
        state.recoveryReads += 1;
        assert.equal(state.rollbacks, 1, "recovery lookup must follow rollback");
        if (recoveryError) throw recoveryError;
        return state.orders.find((order) => order.stripeSessionId === where.stripeSessionId) || null;
      },
    },
    offer: {
      async findUnique() {
        return { id: "offer", title: "Surplus", discountedPrice: 10, merchant: { ownerId: "merchant" } };
      },
    },
    async $transaction(callback) {
      // Model serialized updates of the last offer row and transaction rollback.
      // This is a deterministic test double, not a PostgreSQL integration test.
      const previous = transactionTail;
      const finished = deferred();
      transactionTail = finished.promise;
      await previous;
      const snapshot = { quantity: state.quantity, decrements: state.decrements, orders: [...state.orders] };
      try {
        return await callback({
          offer: {
            async updateMany(args) {
              assert.deepEqual(JSON.parse(JSON.stringify(args)), {
                where: { id: "offer", quantity: { gt: 0 } },
                data: { quantity: { decrement: 1 } },
              });
              if (state.quantity === 0) return { count: 0 };
              state.quantity -= 1;
              state.decrements += 1;
              return { count: 1 };
            },
          },
          order: {
            async create({ data }) {
              const order = { ...data, id: "order-winner", pickupCode: "existing-pickup-code" };
              state.orders.push(order);
              return order;
            },
          },
        });
      } catch (error) {
        Object.assign(state, snapshot);
        state.rollbacks += 1;
        throw error;
      } finally {
        finished.resolve();
      }
    },
  };

  const stripe = {
    checkout: { sessions: { retrieve: async (id) => paidSession(id) } },
    webhooks: { constructEvent: (body) => ({ type: "checkout.session.completed", data: { object: body } }) },
    refunds: {
      async create(params, options) {
        state.refunds.push(JSON.parse(JSON.stringify({ params, options })));
        return { id: "refund", status: "succeeded" };
      },
    },
  };
  const dependencies = {
    qrcode: QRCode,
    "../lib/prisma": { prisma },
    "../lib/stripe": { stripe },
    "./notification.controller": { createNotification: async () => {} },
    "./loyalty.controller": { checkAndCreateReward: async () => {} },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: module.exports,
    module,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    process: { env: { STRIPE_WEBHOOK_SECRET: "test-only" } },
    console: { error() {} },
  }, { filename: controllerPath });
  return { state, ...module.exports };
}

function response() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

for (const firstCaller of ["webhook", "browser"]) {
  test(`same session, last unit: ${firstCaller} wins; both confirmations return the existing order`, async () => {
    const { state, testConfirmPaidSession } = harness();
    const session = paidSession("same");
    const callers = firstCaller === "webhook" ? [undefined, "customer"] : ["customer", undefined];
    const results = await Promise.all(callers.map((userId) => testConfirmPaidSession(session, userId)));

    assert.equal(state.orders.length, 1);
    assert.equal(state.quantity, 0);
    assert.equal(state.decrements, 1);
    assert.equal(state.recoveryReads, 1);
    assert.equal(state.refunds.length, 0);
    assert.deepEqual(results.map((result) => result.status), [201, 200]);
    assert.equal(results[1].body.message, "Commande deja confirmee");
    for (const result of results) {
      assert.equal(result.body.order, state.orders[0]);
      assert.equal(result.body.order.pickupCode, "existing-pickup-code");
      assert.equal(result.body.qrCodeImage, await QRCode.toDataURL("existing-pickup-code"));
    }
  });
}

test("real webhook and browser handlers preserve their response contracts in the race", async () => {
  const { state, stripeWebhook, confirmOrder } = harness();
  const webhookResponse = response();
  const browserResponse = response();
  await Promise.all([
    stripeWebhook({ headers: { "stripe-signature": "test-signature" }, body: paidSession("same") }, webhookResponse),
    confirmOrder({ userId: "customer", body: { sessionId: "same" } }, browserResponse),
  ]);
  assert.equal(webhookResponse.statusCode, 200);
  assert.equal(webhookResponse.body.received, true); // Webhook intentionally returns no order.
  assert.equal(browserResponse.statusCode, 200);
  assert.equal(browserResponse.body.order, state.orders[0]);
  assert.equal(browserResponse.body.qrCodeImage, await QRCode.toDataURL(state.orders[0].pickupCode));
  assert.equal(state.orders.length, 1);
  assert.equal(state.decrements, 1);
  assert.equal(state.refunds.length, 0);
});

test("a different paid session losing the last unit still receives the existing sold-out refund", async () => {
  const { state, testConfirmPaidSession } = harness();
  const [winner, loser] = await Promise.all([
    testConfirmPaidSession(paidSession("winner")),
    testConfirmPaidSession(paidSession("loser"), "customer"),
  ]);
  assert.equal(winner.status, 201);
  assert.equal(loser.status, 409);
  assert.match(loser.body.message, /rembourse automatiquement/);
  assert.equal(state.orders.length, 1);
  assert.equal(state.orders[0].stripeSessionId, "winner");
  assert.equal(state.orders.some((order) => order.stripeSessionId === "loser"), false);
  assert.equal(state.decrements, 1);
  assert.equal(state.quantity, 0);
  assert.equal(state.recoveryReads, 1);
  assert.deepEqual(state.refunds, [{
    params: { payment_intent: "pi_loser", reverse_transfer: true, refund_application_fee: true },
    options: { idempotencyKey: "refund_sold_out_loser" },
  }]);
});

test("recovery lookup failure propagates the original error without issuing a refund", async () => {
  const recoveryError = new Error("Recovery database unavailable");
  const { state, testConfirmPaidSession } = harness({ recoveryError });
  const [winner, loser] = await Promise.allSettled([
    testConfirmPaidSession(paidSession("winner")),
    testConfirmPaidSession(paidSession("loser"), "customer"),
  ]);
  assert.equal(winner.status, "fulfilled");
  assert.equal(loser.status, "rejected");
  assert.equal(loser.reason, recoveryError);
  assert.equal(state.recoveryReads, 1);
  assert.equal(state.refunds.length, 0);
  assert.equal(state.orders.length, 1);
  assert.equal(state.decrements, 1);
});
