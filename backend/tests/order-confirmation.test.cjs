const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { transformSync } = require("esbuild"); // Already installed through tsx.
const QRCode = require("qrcode");
const { loadCoordination } = require("./recover-sold-out-refund.test.cjs");

const controllerPath = path.join(__dirname, "../src/controllers/order.controller.ts");
// Expose the private routine only inside this isolated test module. Production
// exports and API contracts stay unchanged; no real Prisma/Stripe clients load.
const compiled = transformSync(
  fs.readFileSync(controllerPath, "utf8") +
    "\nexport { confirmPaidSession as testConfirmPaidSession, persistRefundState, lockCheckout };",
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

function loadController(prisma, stripe) {
  const dependencies = {
    qrcode: QRCode,
    "@prisma/client": { Prisma: { TransactionIsolationLevel: { ReadCommitted: "ReadCommitted" } } },
    "../lib/prisma": { prisma }, "../lib/stripe": { stripe },
    "../lib/sold-out-recovery-coordination": loadCoordination(),
    "./notification.controller": { createNotification: async () => {} },
    "./loyalty.controller": { checkAndCreateReward: async () => {} },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: module.exports, module,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    process: { env: { STRIPE_WEBHOOK_SECRET: "test-only" } },
    console: { error() {} },
  }, { filename: controllerPath });
  return module.exports;
}

function harness({ recoveryError, quantity = 1 } = {}) {
  const state = { quantity, decrements: 0, orders: [], refunds: [], resolutions: new Map(),
    rollbacks: 0, recoveryReads: 0, commits: 0, calls: [], failCommit: 0, failAfterCommit: 0,
    failStateWrite: false, listed: [], refundOutcome: "succeeded", stripeError: null, retrieveCalls: 0 };
  let tail = Promise.resolve();
  const prisma = {
    async $transaction(callback, options) {
      assert.equal(options.isolationLevel, "ReadCommitted");
      const previous = tail;
      const done = deferred();
      tail = done.promise;
      await previous;
      const snapshot = { quantity: state.quantity, decrements: state.decrements,
        orders: [...state.orders], resolutions: new Map([...state.resolutions].map(([k, v]) => [k, { ...v }])) };
      let locked = false;
      let orderChecked = false;
      try {
        const result = await callback({
          async $queryRaw(strings, ...values) {
            const sql = strings.join("?");
            if (sql.includes("pg_advisory_xact_lock")) {
              assert.match(sql, /hashtextextended/);
              assert.match(sql, /foodsave:checkout:/);
              assert.equal(values.length, 1);
              locked = true;
              return [{ locked: 1 }];
            }
            assert.ok(locked && orderChecked, "order must be checked before resolution under lock");
            state.recoveryReads++;
            const row = state.resolutions.get(values[0]);
            return row ? [{ ...row }] : [];
          },
          async $executeRaw(strings, ...values) {
            assert.ok(locked && orderChecked);
            const sql = strings.join("?");
            if (sql.includes('SET "recoveryOwnerToken" = NULL')) {
              const [sessionId, token] = values;
              const row = state.resolutions.get(sessionId);
              if (row.recoveryOwnerToken !== token) return 0;
              row.recoveryOwnerToken = null; return 1;
            }
            if (sql.includes('SET "recoveryOwnerToken" = ?')) {
              const [token, sessionId] = values;
              const row = state.resolutions.get(sessionId);
              if (row.recoveryOwnerToken) return 0;
              row.recoveryOwnerToken = token; return 1;
            }
            if (sql.includes("INSERT INTO")) {
              const [sessionId, paymentIntentId] = values;
              assert.equal(state.resolutions.has(sessionId), false);
              state.resolutions.set(sessionId, { stripeSessionId: sessionId, paymentIntentId,
                refundId: null, refundStatus: "NOT_REQUESTED", refundFirstAttemptAt: null });
              return 1;
            }
            if (sql.includes('"refundFirstAttemptAt" = CURRENT_TIMESTAMP')) {
              const row = state.resolutions.get(values[0]);
              if (row.refundStatus !== "NOT_REQUESTED" || row.refundFirstAttemptAt || row.refundId) return 0;
              row.refundStatus = "UNKNOWN";
              row.refundFirstAttemptAt = new Date();
              return 1;
            }
            if (state.failStateWrite) throw new Error("state write failed");
            assert.match(sql, /"refundStatus" <> 'SUCCEEDED'/);
            assert.match(sql, /COALESCE/);
            const [status, id, error, sessionId] = values;
            const row = state.resolutions.get(sessionId);
            if (row.refundStatus === "SUCCEEDED" || (id && row.refundId && id !== row.refundId)) return 0;
            row.refundStatus = status;
            if (id) row.refundId = id;
            row.lastError = error;
            return 1;
          },
          order: {
            async findUnique({ where }) {
              assert.ok(locked);
              orderChecked = true;
              if (recoveryError && state.resolutions.has(where.stripeSessionId) && where.stripeSessionId === "loser") throw recoveryError;
              return state.orders.find(o => o.stripeSessionId === where.stripeSessionId) || null;
            },
            async create({ data }) {
              assert.equal(state.resolutions.has(data.stripeSessionId), false);
              const order = { ...data, id: `order-${state.orders.length}`, pickupCode: "existing-pickup-code" };
              state.orders.push(order);
              return order;
            },
          },
          offer: {
            async findUnique() { return { id: "offer", title: "Surplus", discountedPrice: 10, merchant: { ownerId: "merchant" } }; },
            async updateMany(args) {
              assert.deepEqual(JSON.parse(JSON.stringify(args)), {
                where: { id: "offer", quantity: { gt: 0 } }, data: { quantity: { decrement: 1 } },
              });
              if (state.quantity === 0) return { count: 0 };
              state.quantity--; state.decrements++;
              return { count: 1 };
            },
          },
        });
        if (state.failCommit === state.commits + 1) throw new Error("commit failed");
        state.commits++;
        if (state.failAfterCommit === state.commits) {
          const error = new Error("commit acknowledgement lost");
          error.committed = true;
          throw error;
        }
        return result;
      } catch (error) {
        if (!error.committed) Object.assign(state, snapshot);
        state.rollbacks++;
        throw error;
      } finally { done.resolve(); }
    },
  };
  const stripe = {
    checkout: { sessions: { retrieve: async id => paidSession(id) } },
    webhooks: { constructEvent: body => ({ type: "checkout.session.completed", data: { object: body } }) },
    paymentIntents: { retrieve: async () => ({ amount_received: 1000 }) },
    refunds: {
      async create(params, options) {
        const row = [...state.resolutions.values()].find(r => r.paymentIntentId === params.payment_intent);
        assert.ok(row, "durable decision must precede refund");
        assert.ok(row.refundFirstAttemptAt, "durable claim must precede refund");
        assert.ok(state.commits >= 2);
        state.refunds.push(JSON.parse(JSON.stringify({ params, options })));
        if (state.stripeError) throw state.stripeError;
        return { id: `re_${row.stripeSessionId}`, payment_intent: params.payment_intent,
          status: state.refundOutcome, amount: 1000 };
      },
      async retrieve(id) {
        state.retrieveCalls++;
        const row = [...state.resolutions.values()].find(r => r.refundId === id);
        return { id, payment_intent: row.paymentIntentId, status: state.refundOutcome, amount: 1000 };
      },
      async *list() { yield* state.listed; },
    },
  };
  return { state, prisma, stripe, ...loadController(prisma, stripe) };
}

function response() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

if (require.main === module) {
for (const firstCaller of ["webhook", "browser"]) {
  test(`same session, last unit: ${firstCaller} wins; both confirmations return the existing order`, async () => {
    const { state, testConfirmPaidSession } = harness();
    const session = paidSession("same");
    const callers = firstCaller === "webhook" ? [undefined, "customer"] : ["customer", undefined];
    const results = await Promise.all(callers.map((userId) => testConfirmPaidSession(session, userId)));

    assert.equal(state.orders.length, 1);
    assert.equal(state.quantity, 0);
    assert.equal(state.decrements, 1);
    assert.ok(state.recoveryReads >= 1);
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
  assert.equal(loser.body.message, "Cette offre n’est plus disponible. Votre paiement a été remboursé automatiquement.");
  assert.equal(state.orders.length, 1);
  assert.equal(state.orders[0].stripeSessionId, "winner");
  assert.equal(state.orders.some((order) => order.stripeSessionId === "loser"), false);
  assert.equal(state.decrements, 1);
  assert.equal(state.quantity, 0);
  assert.ok(state.recoveryReads >= 1);
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
  assert.ok(state.resolutions.has("loser"), "recovery lookup fails after durable sold-out decision");
  assert.ok(state.recoveryReads >= 1);
  assert.equal(state.refunds.length, 0);
  assert.equal(state.orders.length, 1);
  assert.equal(state.decrements, 1);
});

function seedResolution(state, status, extra = {}) {
  const row = { stripeSessionId: "sold", paymentIntentId: "pi_sold", refundId: null,
    refundStatus: status, refundFirstAttemptAt: new Date(), ...extra };
  state.resolutions.set("sold", row);
  return row;
}

for (const via of ["browser", "webhook"]) {
  test(`refund success then restock: ${via} replay never creates an order`, async () => {
    const h = harness({ quantity: 0 });
    assert.equal((await h.testConfirmPaidSession(paidSession("sold"))).status, 409);
    assert.equal(h.state.resolutions.get("sold").refundStatus, "SUCCEEDED");
    h.state.quantity = 1;
    const res = response();
    if (via === "browser") await h.confirmOrder({ userId: "customer", body: { sessionId: "sold" } }, res);
    else await h.stripeWebhook({ headers: { "stripe-signature": "test" }, body: paidSession("sold") }, res);
    assert.equal(res.statusCode, via === "browser" ? 409 : 200);
    assert.equal(h.state.orders.length, 0);
    assert.equal(h.state.quantity, 1);
    assert.equal(h.state.refunds.length, 1);
  });
}

for (const status of ["UNKNOWN", "PENDING", "REQUIRES_ACTION", "FAILED", "CANCELED", "NEEDS_REVIEW"]) {
  test(`${status} permanently blocks fulfilment after restock`, async () => {
    const h = harness();
    seedResolution(h.state, status, { refundId: ["PENDING", "REQUIRES_ACTION"].includes(status) ? "re_sold" : null });
    h.state.refundOutcome = status.toLowerCase();
    const result = await h.testConfirmPaidSession(paidSession("sold"));
    assert.equal(result.status, 409);
    assert.equal(h.state.orders.length, 0);
    assert.equal(h.state.decrements, 0);
    assert.equal(h.state.quantity, 1);
  });
}

for (const failure of ["decision", "claim", "uncertain-decision", "uncertain-claim"]) {
  test(`${failure} commit failure authorizes zero refund calls`, async () => {
    const h = harness({ quantity: 0 });
    const number = failure.endsWith("claim") ? 2 : 1;
    if (failure.startsWith("uncertain")) h.state.failAfterCommit = number;
    else h.state.failCommit = number;
    await assert.rejects(h.testConfirmPaidSession(paidSession("sold")), /commit/);
    assert.equal(h.state.refunds.length, 0);
    assert.equal(h.state.orders.length, 0);
    if (failure === "decision") assert.equal(h.state.resolutions.size, 0);
  });
}

test("concurrent sold-out confirmations create one resolution and preserve refund parameters", async () => {
  const h = harness({ quantity: 0 });
  const results = await Promise.all([
    h.testConfirmPaidSession(paidSession("sold")), h.testConfirmPaidSession(paidSession("sold"), "customer"),
  ]);
  assert.equal(h.state.resolutions.size, 1);
  assert.equal(h.state.orders.length, 0);
  assert.ok(results.every(r => r.status === 409));
  assert.ok(h.state.refunds.length >= 1);
  for (const call of h.state.refunds) assert.deepEqual(call, {
    params: { payment_intent: "pi_sold", reverse_transfer: true, refund_application_fee: true },
    options: { idempotencyKey: "refund_sold_out_sold" },
  });
});

test("known refund is retrieved instead of recreated", async () => {
  const h = harness();
  seedResolution(h.state, "PENDING", { refundId: "re_sold" });
  await h.testConfirmPaidSession(paidSession("sold"));
  assert.equal(h.state.retrieveCalls, 1);
  assert.equal(h.state.refunds.length, 0);
  assert.equal(h.state.resolutions.get("sold").refundStatus, "SUCCEEDED");
});

test("old uncertain attempt with no Stripe refund stops for review", async () => {
  const h = harness();
  seedResolution(h.state, "UNKNOWN", { refundFirstAttemptAt: new Date(Date.now() - 24 * 3600000) });
  await h.testConfirmPaidSession(paidSession("sold"));
  assert.equal(h.state.resolutions.get("sold").refundStatus, "NEEDS_REVIEW");
  assert.equal(h.state.refunds.length, 0);
});

test("Stripe acceptance followed by failed persistence retains ownership without recreation", async () => {
  const h = harness({ quantity: 0 });
  h.state.failStateWrite = true;
  await assert.rejects(h.testConfirmPaidSession(paidSession("sold")), /state write/);
  assert.equal(h.state.resolutions.get("sold").refundStatus, "UNKNOWN");
  h.state.failStateWrite = false;
  h.state.listed = [{ id: "re_sold", payment_intent: "pi_sold", status: "succeeded", amount: 1000 }];
  h.state.quantity = 1;
  await h.testConfirmPaidSession(paidSession("sold"));
  assert.equal(h.state.refunds.length, 1);
  assert.equal(h.state.orders.length, 0);
  assert.equal(h.state.resolutions.get("sold").refundStatus, "UNKNOWN");
  assert.ok(h.state.resolutions.get("sold").recoveryOwnerToken);
});

test("network uncertainty remains durable and webhook requests retry", async () => {
  const h = harness({ quantity: 0 });
  h.state.stripeError = new Error("network uncertainty");
  const res = response();
  await h.stripeWebhook({ headers: { "stripe-signature": "test" }, body: paidSession("sold") }, res);
  assert.equal(res.statusCode, 500);
  assert.equal(h.state.resolutions.get("sold").refundStatus, "UNKNOWN");
  h.state.quantity = 1;
  const replay = await h.testConfirmPaidSession(paidSession("sold"));
  assert.equal(replay.retryWebhook, true);
  assert.equal(h.state.refunds.length, 1);
  assert.ok(h.state.resolutions.get("sold").recoveryOwnerToken);
  assert.equal(h.state.orders.length, 0);
});

test("pending refund has truthful browser message and retryable webhook response", async () => {
  const h = harness({ quantity: 0 });
  h.state.refundOutcome = "pending";
  const result = await h.testConfirmPaidSession(paidSession("sold"));
  assert.equal(result.status, 409);
  assert.doesNotMatch(result.body.message, /remboursé automatiquement/);
  const res = response();
  await h.stripeWebhook({ headers: { "stripe-signature": "test" }, body: paidSession("sold") }, res);
  assert.equal(res.statusCode, 500);
});

test("ownership excludes concurrent writers and completed success cannot be downgraded", async () => {
  const h = harness();
  seedResolution(h.state, "PENDING", { refundId: "re_sold" });
  const entered = deferred();
  const release = deferred();
  h.stripe.refunds.retrieve = async () => {
    entered.resolve(); await release.promise;
    return { id: "re_sold", payment_intent: "pi_sold", status: "pending" };
  };
  const slow = h.testConfirmPaidSession(paidSession("sold"));
  await entered.promise;
  await assert.rejects(h.persistRefundState("sold", "pi_sold", "SUCCEEDED", "re_sold"), /ownership/);
  release.resolve();
  await slow;
  await h.persistRefundState("sold", "pi_sold", "SUCCEEDED", "re_sold");
  const result = await h.testConfirmPaidSession(paidSession("sold"));
  assert.equal(result.body.message, "Cette offre n’est plus disponible. Votre paiement a été remboursé automatiquement.");
  for (const status of ["PENDING", "UNKNOWN", "FAILED", "CANCELED", "NEEDS_REVIEW"]) {
    await h.persistRefundState("sold", "pi_sold", status);
    assert.equal(h.state.resolutions.get("sold").refundStatus, "SUCCEEDED");
  }
});

test("conflicting refund ID is not overwritten", async () => {
  const h = harness();
  seedResolution(h.state, "PENDING", { refundId: "re_original" });
  await h.persistRefundState("sold", "pi_sold", "SUCCEEDED", "re_other");
  assert.equal(h.state.resolutions.get("sold").refundId, "re_original");
  assert.equal(h.state.resolutions.get("sold").refundStatus, "NEEDS_REVIEW");
});

test("refund for wrong PaymentIntent is rejected", async () => {
  const h = harness();
  seedResolution(h.state, "PENDING", { refundId: "re_sold" });
  h.stripe.refunds.retrieve = async () => ({ id: "re_sold", payment_intent: "pi_wrong", status: "succeeded" });
  await h.testConfirmPaidSession(paidSession("sold"));
  assert.equal(h.state.resolutions.get("sold").refundStatus, "NEEDS_REVIEW");
  assert.ok(h.state.resolutions.get("sold").recoveryOwnerToken, "unverifiable provider outcome retains ownership");
  assert.equal(h.state.refunds.length, 0);
});

test("existing order wins even if historical resolution also exists", async () => {
  const h = harness();
  const original = await h.testConfirmPaidSession(paidSession("sold"));
  seedResolution(h.state, "UNKNOWN");
  const duplicate = await h.testConfirmPaidSession(paidSession("sold"));
  assert.equal(duplicate.body.order, original.body.order);
  assert.equal(duplicate.body.qrCodeImage, original.body.qrCodeImage);
  assert.equal(h.state.refunds.length, 0);
});

test("manual settlement is terminal without changing Stripe refund fields", async () => {
  const h = harness();
  const row = seedResolution(h.state, "FAILED", { refundId: "re_failed", manuallySettled: true });
  const before = { ...row };
  const result = await h.testConfirmPaidSession(paidSession("sold"));
  assert.equal(result.status, 409);
  assert.match(result.body.message, /effectue et verifie/);
  assert.equal(result.retryWebhook, false);
  await h.persistRefundState("sold", "pi_sold", "UNKNOWN");
  assert.deepEqual(row, before);
  assert.equal(h.state.orders.length, 0);
  assert.equal(h.state.refunds.length, 0);
  assert.equal(h.state.retrieveCalls, 0);
});

test("existing order wins over manual settlement too", async () => {
  const h = harness();
  const first = await h.testConfirmPaidSession(paidSession("sold"));
  seedResolution(h.state, "FAILED", { manuallySettled: true });
  const replay = await h.testConfirmPaidSession(paidSession("sold"));
  assert.equal(replay.body.order, first.body.order);
  assert.equal(h.state.refunds.length, 0);
});

test("different sessions with sufficient stock remain independent purchases", async () => {
  const h = harness({ quantity: 2 });
  await Promise.all([h.testConfirmPaidSession(paidSession("one")), h.testConfirmPaidSession(paidSession("two"))]);
  assert.equal(h.state.orders.length, 2);
  assert.equal(h.state.decrements, 2);
  assert.equal(h.state.resolutions.size, 0);
});
}
module.exports = { loadController, paidSession, response, deferred };
