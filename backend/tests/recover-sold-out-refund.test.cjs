const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { transformSync } = require("esbuild");
const { randomUUID } = require("node:crypto");
const { AsyncLocalStorage } = require("node:async_hooks");

function loadCoordination() {
  const filename = path.join(__dirname, "../src/lib/sold-out-recovery-coordination.ts");
  const module = { exports: {} };
  vm.runInNewContext(transformSync(fs.readFileSync(filename, "utf8"), { loader: "ts", format: "cjs", target: "es2020" }).code,
    { module, exports: module.exports, require(name) { assert.equal(name, "node:crypto"); return { randomUUID }; } }, { filename });
  return module.exports;
}

function loadRecovery() {
  const filename = path.join(__dirname, "../src/scripts/recover-sold-out-refund.ts");
  const compiled = transformSync(fs.readFileSync(filename, "utf8"), { loader: "ts", format: "cjs", target: "es2020" }).code;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, URL, process: { env: {} },
    require(name) {
      if (name === "../lib/sold-out-recovery-coordination") return loadCoordination();
      if (name === "@prisma/client") return { Prisma: { TransactionIsolationLevel: { ReadCommitted: "ReadCommitted" } }, PrismaClient: class { constructor() { throw Error("Unexpected real client"); } } };
      if (name === "stripe") return class { constructor() { throw Error("Unexpected Stripe SDK"); } };
      throw Error(`Unexpected dependency ${name}`);
    }, console }, { filename });
  return module.exports;
}
const api = loadRecovery();
function completion(overrides = {}) {
  return { completedAt: new Date(Date.now() - 60000).toISOString(), method: "BANK_TRANSFER",
    evidenceReference: "bank-account:transfer-123", paymentIntentId: "pi_sold", amountMinor: "1000", currency: "CAD",
    reason: "Verified bank transfer to the original customer", evidenceVerified: true, recipientVerified: true, ...overrides };
}
function harness(status = "FAILED") {
  const transactions = new AsyncLocalStorage();
  const state = { order: null, manual: null, writes: 0, reads: 0, inside: false,
    row: { stripeSessionId: "sold", paymentIntentId: "pi_sold", refundId: null, refundStatus: status,
      recoveryOwnerToken: null, refundFirstAttemptAt: new Date(Date.now() - 25 * 3600000), updatedAt: new Date(1000) },
    payment: { id: "pi_sold", status: "succeeded", amount_received: 1000, currency: "cad" }, refunds: [], afterRead: null };
  let tail = Promise.resolve();
  const db = {
    async $transaction(fn) {
      const previous = tail; let release; tail = new Promise(r => release = r); await previous;
      state.inside = true;
      try { return await transactions.run(true, () => fn({
        $queryRaw: async (sql, ...values) => {
          assert.deepEqual(values, ["sold"]);
          if (sql.join("").includes("pg_advisory_xact_lock")) return [{ locked: 1 }];
          return state.row ? [{ ...state.row, manuallySettled: !!state.manual }] : [];
        },
        $executeRaw: async (sql, ...values) => {
          if (sql.join("").includes('"refundStatus" = CAST')) {
            const [status, id, error] = values;
            state.row.refundStatus = status;
            if (id) state.row.refundId = id;
            state.row.lastError = error; return 1;
          }
          if (sql.join("").includes('SET "recoveryOwnerToken" = NULL')) {
            const [id, token] = values; assert.equal(id, "sold");
            if (state.row.recoveryOwnerToken !== token) return 0;
            state.row.recoveryOwnerToken = null; return 1;
          }
          const [token, id] = values; assert.equal(id, "sold");
          if (state.row.recoveryOwnerToken) return 0;
          state.row.recoveryOwnerToken = token; return 1;
        },
        order: { findUnique: async () => state.order },
        soldOutResolution: { findUnique: async () => state.row && ({ ...state.row, manualSettlement: state.manual }),
          update: async ({ data }) => { state.writes++; Object.assign(state.row, data); return state.row; } },
        soldOutManualSettlement: { create: async ({ data }) => {
          assert.equal(state.manual, null); state.writes++; state.manual = data; return data;
        } },
      })); } finally { state.inside = false; release(); }
    },
    soldOutResolution: { findMany: async ({ where }) => {
      assert.equal(where.refundStatus.not, "SUCCEEDED"); assert.equal(where.manualSettlement.is, null);
      return [state.row];
    } },
  };
  const provider = {
    paymentIntents: { retrieve: async () => { assert.equal(transactions.getStore(), undefined); state.reads++; return state.payment; } },
    refunds: {
      retrieve: async id => { assert.equal(transactions.getStore(), undefined); return state.refunds.find(r => r.id === id); },
      async *list() { assert.equal(transactions.getStore(), undefined); yield* state.refunds; if (state.afterRead) state.afterRead(); },
      create() { assert.fail("Financial action forbidden"); }, cancel() { assert.fail("Financial action forbidden"); },
    },
  };
  return { state, db, provider, recovery: api.createRecovery(db, provider) };
}
if (require.main === module) {
  function deferred() { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; }
  function automatic(h) {
    return require("./order-confirmation.test.cjs").loadController(h.db, h.provider);
  }
  const paid = { id: "sold", payment_status: "paid", payment_intent: "pi_sold", metadata: { userId: "customer", offerId: "offer" } };
  test("in-flight automatic recovery blocks manual recording then failed completion permits settlement and terminal replay", async () => {
    const h = harness("UNKNOWN"), entered = deferred(), release = deferred();
    h.state.row.refundFirstAttemptAt = new Date();
    let calls = 0;
    h.provider.refunds.create = async () => {
      calls++; assert.ok(h.state.row.recoveryOwnerToken); entered.resolve(); await release.promise;
      const refund = { id: "re_sold", payment_intent: "pi_sold", status: "failed", amount: 1000, currency: "cad" };
      h.state.refunds = [refund]; return refund;
    };
    const controller = automatic(h), running = controller.testConfirmPaidSession(paid);
    try {
      await entered.promise;
      await assert.rejects(h.recovery.recordSettlement("sold", completion(), "operator"), /ownership/);
      assert.equal(h.state.manual, null);
    } finally { release.resolve(); await running; }
    assert.equal(h.state.row.recoveryOwnerToken, null);
    await h.recovery.recordSettlement("sold", completion(), "operator");
    const replay = await controller.testConfirmPaidSession(paid);
    assert.equal(replay.retryWebhook, false); assert.equal(calls, 1);
  });
  test("manual reconciliation ownership prevents automatic provider contact", async () => {
    const h = harness("UNKNOWN"), entered = deferred(), release = deferred();
    h.state.row.refundFirstAttemptAt = new Date();
    h.provider.paymentIntents.retrieve = async () => { entered.resolve(); await release.promise; return h.state.payment; };
    const running = h.recovery.reconcile("sold");
    try {
      await entered.promise;
      const result = await automatic(h).testConfirmPaidSession(paid);
      assert.equal(result.retryWebhook, true); // provider.create would fail if reached
      assert.ok(h.state.row.recoveryOwnerToken);
    } finally { release.resolve(); await running; }
    assert.equal(h.state.row.recoveryOwnerToken, null);
  });
  test("automatic timeout retains ownership and blocks manual evidence reads", async () => {
    const h = harness("UNKNOWN"); h.state.row.refundFirstAttemptAt = new Date();
    h.provider.refunds.create = async () => { throw Error("provider timeout"); };
    await assert.rejects(automatic(h).testConfirmPaidSession(paid), /provider timeout/);
    const token = h.state.row.recoveryOwnerToken; assert.ok(token);
    await assert.rejects(h.recovery.recordSettlement("sold", completion(), "operator"), /ownership/);
    assert.equal(h.state.reads, 0); assert.equal(h.state.row.recoveryOwnerToken, token);
  });
  test("uncertain ownership commit authorizes no provider contact", async () => {
    const h = harness(), transact = h.db.$transaction;
    h.db.$transaction = async fn => { await transact(fn); throw Error("commit acknowledgement lost"); };
    await assert.rejects(h.recovery.reconcile("sold"), /acknowledgement/);
    assert.ok(h.state.row.recoveryOwnerToken); assert.equal(h.state.reads, 0);
  });
  test("abandoned owner survives a new recovery instance without takeover", async () => {
    const h = harness(), coord = loadCoordination();
    await h.db.$transaction(tx => coord.acquireRecovery(tx, "sold", "abandoned-owner"));
    const fresh = api.createRecovery(h.db, h.provider);
    await assert.rejects(fresh.reconcile("sold"), /ownership/);
    assert.equal(h.state.row.recoveryOwnerToken, "abandoned-owner"); assert.equal(h.state.reads, 0);
  });
  test("existing Order wins even with abandoned ownership", async () => {
    const h = harness(); h.state.row.recoveryOwnerToken = "abandoned-owner"; h.state.order = { id: "existing", pickupCode: "code" };
    const result = await automatic(h).testConfirmPaidSession(paid);
    assert.equal(result.status, 200); assert.equal(result.body.order.id, "existing");
    await assert.rejects(h.recovery.reconcile("sold"), /Existing Order/);
    assert.equal(h.state.row.recoveryOwnerToken, "abandoned-owner"); assert.equal(h.state.reads, 0);
  });
  for (const status of ["NOT_REQUESTED", "UNKNOWN", "PENDING", "REQUIRES_ACTION", "FAILED", "CANCELED", "NEEDS_REVIEW"]) {
    test(`${status} reconciles verified success without financial actions`, async () => {
      const h = harness(status);
      h.state.refunds = [{ id: "re_sold", payment_intent: "pi_sold", status: "succeeded", amount: 1000, currency: "cad" }];
      await h.recovery.reconcile("sold"); assert.equal(h.state.row.refundStatus, "SUCCEEDED");
    });
  }
  for (const status of ["pending", "requires_action", "failed", "canceled"]) {
    test(`provider ${status} is persisted without replacement`, async () => {
      const h = harness(); h.state.refunds = [{ id: "re_sold", payment_intent: "pi_sold", status, amount: 1000, currency: "cad" }];
      await h.recovery.reconcile("sold"); assert.equal(h.state.row.refundStatus, status.toUpperCase());
    });
  }
  test("stale UNKNOWN without evidence requires review", async () => {
    const h = harness("UNKNOWN"); await h.recovery.reconcile("sold"); assert.equal(h.state.row.refundStatus, "NEEDS_REVIEW");
  });
  test("recent UNKNOWN and NOT_REQUESTED do not create or reset a refund", async () => {
    for (const status of ["UNKNOWN", "NOT_REQUESTED"]) {
      const h = harness(status); h.state.row.refundFirstAttemptAt = new Date();
      await h.recovery.reconcile("sold"); assert.equal(h.state.writes, 0);
    }
  });
  for (const terminal of ["order", "success", "manual"]) {
    test(`${terminal} refuses both operations before provider reads`, async () => {
      const h = harness();
      if (terminal === "order") h.state.order = { id: "order" };
      if (terminal === "success") h.state.row.refundStatus = "SUCCEEDED";
      if (terminal === "manual") h.state.manual = {};
      await assert.rejects(h.recovery.reconcile("sold"));
      await assert.rejects(h.recovery.recordSettlement("sold", completion(), "operator"));
      assert.equal(h.state.reads, 0); assert.equal(h.state.writes, 0);
    });
  }
  test("manual completion is insert-only, integer, and rejects repetition", async () => {
    const h = harness(); const before = { ...h.state.row };
    await h.recovery.recordSettlement("sold", completion(), "operator");
    assert.equal(h.state.manual.amountMinor, 1000n); assert.deepEqual(h.state.row, before);
    await assert.rejects(h.recovery.recordSettlement("sold", completion(), "operator"));
    assert.equal(h.state.writes, 1);
  });
  test("concurrent completion permits one insertion", async () => {
    const h = harness();
    const results = await Promise.allSettled([1, 2].map(() => h.recovery.recordSettlement("sold", completion(), "operator")));
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1); assert.equal(h.state.writes, 1);
  });
  for (const field of ["order", "manual", "payment", "status", "time"]) {
    test(`changed ${field} after provider read prevents persistence`, async () => {
      const h = harness();
      h.state.afterRead = () => {
        if (field === "order") h.state.order = {};
        if (field === "manual") h.state.manual = {};
        if (field === "payment") h.state.row.paymentIntentId = "pi_other";
        if (field === "status") h.state.row.refundStatus = "SUCCEEDED";
        if (field === "time") h.state.row.updatedAt = new Date(2000);
      };
      await assert.rejects(h.recovery.recordSettlement("sold", completion(), "operator")); assert.equal(h.state.writes, 0);
    });
  }
  test("ambiguous or mismatched provider evidence is rejected", async () => {
    const good = { id: "re_sold", payment_intent: "pi_sold", status: "failed", amount: 1000, currency: "cad" };
    for (const refunds of [[{ ...good, amount: 500 }], [{ ...good, currency: "usd" }], [{ ...good, payment_intent: "pi_other" }], [good, { ...good, id: "re_other" }]]) {
      const h = harness(); h.state.refunds = refunds;
      await assert.rejects(h.recovery.recordSettlement("sold", completion(), "operator")); assert.equal(h.state.writes, 0);
    }
  });
  test("pending and succeeded provider refunds prohibit manual completion", async () => {
    for (const status of ["pending", "requires_action", "succeeded", null]) {
      const h = harness(); h.state.refunds = [{ id: "re_sold", payment_intent: "pi_sold", status, amount: 1000, currency: "cad" }];
      await assert.rejects(h.recovery.recordSettlement("sold", completion(), "operator")); assert.equal(h.state.writes, 0);
    }
  });
  test("invalid evidence and absent attestations fail closed", async () => {
    for (const change of [{ amountMinor: 1000 }, { amountMinor: "1.5" }, { amountMinor: "0" }, { currency: "cad" },
      { reason: " " }, { method: "OTHER", reason: "other" }, { evidenceReference: " " }, { evidenceVerified: false },
      { recipientVerified: false }, { completedAt: "invalid" }, { completedAt: "2999-01-01T00:00:00Z" }, { extra: true }]) {
      assert.throws(() => api.parseSettlement(completion(change), "operator"));
    }
    assert.throws(() => api.parseSettlement(completion(), ""));
    assert.throws(() => api.parseSettlement(completion({ method: "OTHER" }), "operator"), /Invalid method/);
  });
  for (const [field, value] of [["amountMinor", "999"], ["currency", "USD"], ["paymentIntentId", "pi_other"]]) {
    test(`definite ${field} mismatch releases only this owner and corrected evidence succeeds`, async () => {
      const h = harness(), owners = [], before = { ...h.state.row };
      h.state.afterRead = () => {
        assert.ok(h.state.row.recoveryOwnerToken, "ownership acquired before completed provider reads");
        owners.push(h.state.row.recoveryOwnerToken);
      };
      await assert.rejects(h.recovery.recordSettlement("sold", completion({ [field]: value }), "operator"), /Settlement amount\/currency\/payment mismatch/);
      assert.equal(h.state.reads, 1); assert.equal(owners.length, 1);
      assert.equal(h.state.manual, null); assert.equal(h.state.writes, 0);
      assert.deepEqual(h.state.row, before, "only ownership acquired/released; financial fields unchanged");
      await h.recovery.recordSettlement("sold", completion(), "operator");
      assert.equal(h.state.manual.amountMinor, 1000n); assert.equal(h.state.writes, 1);
      assert.equal(h.state.row.recoveryOwnerToken, null);
      assert.notEqual(owners[0], owners[1], "corrected attempt acquires a new token without takeover");
    });
  }
  test("definite mismatch cannot release a different current owner", async () => {
    const h = harness(); h.state.afterRead = () => { h.state.row.recoveryOwnerToken = "different-owner"; };
    await assert.rejects(h.recovery.recordSettlement("sold", completion({ amountMinor: "999" }), "operator"), /ownership mismatch/);
    assert.equal(h.state.row.recoveryOwnerToken, "different-owner"); assert.equal(h.state.manual, null);
  });
  test("existing Order or changed state stops definite-rejection release", async () => {
    for (const kind of ["order", "terminal", "identifiers"]) {
      const h = harness(); h.state.afterRead = () => {
        if (kind === "order") h.state.order = { id: "existing" };
        if (kind === "terminal") h.state.manual = { evidenceReference: "existing" };
        if (kind === "identifiers") h.state.row.paymentIntentId = "pi_changed";
      };
      await assert.rejects(h.recovery.recordSettlement("sold", completion({ amountMinor: "999" }), "operator"));
      assert.ok(h.state.row.recoveryOwnerToken); assert.equal(h.state.writes, 0);
    }
  });
  test("provider uncertainty with incorrect operator evidence still retains ownership", async () => {
    const h = harness(); h.state.afterRead = () => { throw Error("provider timeout"); };
    await assert.rejects(h.recovery.recordSettlement("sold", completion({ amountMinor: "999" }), "operator"), /provider timeout/);
    assert.ok(h.state.row.recoveryOwnerToken); assert.equal(h.state.manual, null);
  });
  test("pending or unknown provider outcome cannot use definite-input release", async () => {
    for (const status of ["pending", "requires_action", null]) {
      const h = harness(); h.state.refunds = [{ id: "re_sold", payment_intent: "pi_sold", status, amount: 1000, currency: "cad" }];
      await assert.rejects(h.recovery.recordSettlement("sold", completion({ amountMinor: "999" }), "operator"), /Refund may still complete/);
      assert.ok(h.state.row.recoveryOwnerToken); assert.equal(h.state.manual, null);
    }
  });
  test("uncertain final persistence does not invoke rejection cleanup", async () => {
    const h = harness(), transact = h.db.$transaction; let transactions = 0;
    h.db.$transaction = async fn => {
      if (++transactions === 2) throw Error("connection lost before final result established");
      return transact(fn);
    };
    await assert.rejects(h.recovery.recordSettlement("sold", completion(), "operator"), /connection lost/);
    assert.ok(h.state.row.recoveryOwnerToken); assert.equal(h.state.manual, null); assert.equal(transactions, 2);
  });
  test("provider uncertainty never records completion", async () => {
    const h = harness(); h.state.afterRead = () => { throw Error("timeout"); };
    await assert.rejects(h.recovery.recordSettlement("sold", completion(), "operator"), /timeout/); assert.equal(h.state.writes, 0);
    assert.ok(h.state.row.recoveryOwnerToken);
    await assert.rejects(h.recovery.reconcile("sold"), /ownership/);
  });
  test("only the two documented settlement methods are accepted", () => {
    for (const method of ["BANK_TRANSFER", "PAYMENT_PROVIDER"]) {
      assert.equal(api.parseSettlement(completion({ method }), "operator").method, method);
    }
    assert.throws(() => api.parseSettlement(completion({ method: "OTHER" }), "operator"), /Invalid method/);
  });
  test("stale token cannot release another owner's durable claim", async () => {
    const h = harness(), coord = loadCoordination();
    await h.db.$transaction(tx => coord.acquireRecovery(tx, "sold", "owner"));
    await assert.rejects(h.db.$transaction(tx => coord.releaseRecovery(tx, "sold", "stale")), /release refused/);
    assert.equal(h.state.row.recoveryOwnerToken, "owner");
  });
  test("manual recording blocked before evidence when automatic ownership exists", async () => {
    const h = harness(); h.state.row.recoveryOwnerToken = "automatic-owner";
    await assert.rejects(h.recovery.recordSettlement("sold", completion(), "operator"), /ownership/);
    assert.equal(h.state.reads, 0); assert.equal(h.state.manual, null);
  });
  test("list is read only", async () => { const h = harness(); await h.recovery.list(); assert.equal(h.state.reads, 0); assert.equal(h.state.writes, 0); });
  test("CLI rejects malformed commands and DATABASE_URL fallback", async () => {
    await assert.rejects(api.runCli(["reset", "sold"], {}), /Usage/);
    await assert.rejects(api.runCli(["list", "extra"], {}), /Usage/);
    await assert.rejects(api.runCli(["list"], { DATABASE_URL: "unused" }), /no fallback/);
  });
}
module.exports = { loadRecovery, loadCoordination, completion, recoveryHarness: harness };
