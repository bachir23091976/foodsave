const assert = require("node:assert/strict");
const { test } = require("node:test");
const { randomUUID } = require("node:crypto");
const { loadController, deferred } = require("./order-confirmation.test.cjs");
const { loadRecovery, loadCoordination, completion } = require("./recover-sold-out-refund.test.cjs");

// Never load dotenv or fall back to DATABASE_URL. The dedicated, already migrated
// test database must be local and explicitly named foodsave_test_<suffix>.
// These tests create/delete only their uniquely identified fixtures, not schemas.
const testUrl = process.env.FOODSAVE_TEST_DATABASE_URL;
if (!testUrl) {
  test("isolated PostgreSQL concurrency suite", {
    skip: "FOODSAVE_TEST_DATABASE_URL is absent; normal DATABASE_URL will never be used",
  }, () => {});
} else {
  const parsed = new URL(testUrl);
  assert.ok(["postgres:", "postgresql:"].includes(parsed.protocol));
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname), "test database must be local");
  assert.match(parsed.pathname, /^\/foodsave_test_[a-z0-9_]+$/i);
  if (process.env.DATABASE_URL) {
    const normal = new URL(process.env.DATABASE_URL);
    assert.notEqual(`${parsed.port || "5432"}${parsed.pathname}`,
      `${normal.port || "5432"}${normal.pathname}`, "test database must differ from normal database");
  }
  const { PrismaClient } = require("@prisma/client");
  test("isolated PostgreSQL decisions and recovery", { timeout: 30000 }, async (t) => {
    const db = new PrismaClient({ datasources: { db: { url: testUrl } } });
    const observer = new PrismaClient({ datasources: { db: { url: testUrl } } });
    const prefix = `phasea_${randomUUID()}`;
    const sessions = [];
    let customer;
    let merchant;
    try {
      // Fail before fixture writes if the additive migration was not prepared.
      await db.$queryRaw`SELECT "stripeSessionId" FROM "SoldOutResolution" LIMIT 0`;
      customer = await db.user.create({ data: { email: `${prefix}@example.invalid`,
        password: "test-only", firstName: "Test", lastName: "Only", role: "MERCHANT" } });
      merchant = await db.merchant.create({ data: { ownerId: customer.id, name: prefix,
        address: "test", city: "test", province: "test", postalCode: "test" } });
      async function offer(quantity) {
        return db.offer.create({ data: { title: prefix, originalPrice: 20, discountedPrice: 10,
          quantity, pickupStart: new Date(), pickupEnd: new Date(Date.now() + 3600000), merchantId: merchant.id } });
      }
      function session(offerId) {
        const id = `${prefix}_${sessions.length}`;
        sessions.push(id);
        return { id, payment_status: "paid", metadata: { userId: customer.id, offerId }, payment_intent: `pi_${id}` };
      }
      const refunds = new Map();
      const stripe = {
        refunds: {
          async create(params, options) {
            const sessionId = options.idempotencyKey.slice("refund_sold_out_".length);
            // A separate connection must see the committed decision AND claim.
            const rows = await db.$queryRaw`SELECT * FROM "SoldOutResolution" WHERE "stripeSessionId" = ${sessionId}`;
            assert.equal(rows.length, 1);
            assert.ok(rows[0].refundFirstAttemptAt);
            if (!refunds.has(sessionId)) refunds.set(sessionId, {
              id: `re_${sessionId}`, payment_intent: params.payment_intent, status: "succeeded", amount: 1000,
            });
            return refunds.get(sessionId);
          },
          async retrieve(id) { return [...refunds.values()].find(r => r.id === id); },
          async *list({ payment_intent }) {
            yield* [...refunds.values()].filter(r => r.payment_intent === payment_intent);
          },
        },
        paymentIntents: { retrieve: async () => ({ amount_received: 1000 }) },
      };
      const controller = loadController(db, stripe);

      async function beforeDeadline(promise) {
        let timer;
        try {
          return await Promise.race([promise, new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error("Lock synchronization deadline exceeded")), 6000);
          })]);
        } finally { clearTimeout(timer); }
      }

      async function observeBlocked(sessionId, ownerPid, waiterPid) {
        assert.notEqual(ownerPid, waiterPid);
        // A separate client/transaction guarantees an independent observer connection.
        await observer.$transaction(async tx => {
          const [{ pid }] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
          assert.notEqual(pid, ownerPid);
          assert.notEqual(pid, waiterPid);
          await tx.$executeRaw`SET LOCAL statement_timeout = '1000ms'`;
          const deadline = performance.now() + 4000;
          while (performance.now() < deadline) {
            const [{ blocked }] = await tx.$queryRaw`
              WITH wanted AS (
                SELECT pg_catalog.hashtextextended(
                  'foodsave:checkout:' || CAST(${sessionId} AS text), CAST(0 AS bigint)
                ) AS key
              )
              SELECT EXISTS (
                SELECT 1 FROM pg_catalog.pg_locks a
                JOIN pg_catalog.pg_locks b
                  ON b.database = a.database AND b.classid = a.classid
                  AND b.objid = a.objid AND b.objsubid = a.objsubid
                CROSS JOIN wanted
                WHERE a.locktype = 'advisory' AND b.locktype = 'advisory'
                  AND a.pid = ${ownerPid} AND b.pid = ${waiterPid}
                  AND a.granted AND NOT b.granted
                  AND a.mode = 'ExclusiveLock' AND b.mode = 'ExclusiveLock'
                  AND a.objsubid = 1
                  AND a.classid::bigint = ((wanted.key >> 32) & 4294967295::bigint)
                  AND a.objid::bigint = (wanted.key & 4294967295::bigint)
                  AND a.pid = ANY(pg_catalog.pg_blocking_pids(b.pid))
              ) AS blocked
            `;
            if (blocked) return;
            // Yield between observations; elapsed time is never evidence of blocking.
            await new Promise(resolve => setImmediate(resolve));
          }
          throw new Error("PostgreSQL did not report the expected advisory-lock waiter");
        }, { timeout: 6000, maxWait: 2000 });
      }

      async function lockedPair(paid, rollback = false) {
        const firstLocked = deferred(), secondAttempt = deferred(), releaseFirst = deferred();
        let ownerPid, waiterPid, entries = 0;
        const rollbackError = new Error("intentional rollback");
        const instrumented = {
          $transaction: (callback, options) => db.$transaction(tx => callback(new Proxy(tx, {
            get(target, name) {
              if (name === "$queryRaw") return async (strings, ...values) => {
                if (!strings.join("").includes("pg_advisory_xact_lock")) return target.$queryRaw(strings, ...values);
                const entry = ++entries;
                const [{ pid }] = await target.$queryRaw`SELECT pg_backend_pid() AS pid`;
                if (entry === 1) ownerPid = pid;
                if (entry === 2) waiterPid = pid;
                // Attach a rejection handler immediately, including during synchronization.
                const attempt = Promise.resolve(target.$queryRaw(strings, ...values));
                attempt.catch(() => {});
                if (entry === 2) secondAttempt.resolve();
                const result = await attempt;
                if (entry === 1) {
                  if (rollback) {
                    await target.$executeRaw`INSERT INTO "SoldOutResolution" ("stripeSessionId", "updatedAt") VALUES (${paid.id}, CURRENT_TIMESTAMP)`;
                  }
                  firstLocked.resolve();
                  await releaseFirst.promise;
                  if (rollback) throw rollbackError;
                }
                return result;
              };
              return target[name];
            },
          })), { ...options, timeout: 15000, maxWait: 2000 }),
        };
        const c = loadController(instrumented, stripe);
        const first = c.testConfirmPaidSession(paid);
        first.catch(() => {});
        let second, observation;
        const premature = promise => promise.then(
          () => { throw new Error("Transaction completed before lock observation"); }
        );
        try {
          await beforeDeadline(Promise.race([firstLocked.promise, premature(first)]));
          second = c.testConfirmPaidSession(paid, customer.id);
          second.catch(() => {});
          await beforeDeadline(Promise.race([secondAttempt.promise, premature(first), premature(second)]));
          observation = observeBlocked(paid.id, ownerPid, waiterPid);
          await Promise.race([observation, premature(first), premature(second)]);
          releaseFirst.resolve();
          if (rollback) {
            await assert.rejects(first, error => error === rollbackError);
            return [await second];
          }
          return await Promise.all([first, second]);
        } finally {
          // Failure releases A too; drain both requests before any fixture cleanup.
          releaseFirst.resolve();
          await Promise.allSettled([first, ...(second ? [second] : []), ...(observation ? [observation] : [])]);
        }
      }

      await t.test("same-session waiter sees the committed order after advisory lock", async () => {
        const item = await offer(1);
        const paid = session(item.id);
        const results = await lockedPair(paid);
        assert.deepEqual(results.map(r => r.status), [201, 200]);
        assert.equal(results[0].body.order.id, results[1].body.order.id);
        assert.equal(results[0].body.qrCodeImage, results[1].body.qrCodeImage);
        assert.equal(await db.order.count({ where: { offerId: item.id } }), 1);
        assert.equal((await db.offer.findUnique({ where: { id: item.id } })).quantity, 0);
        assert.equal(refunds.has(paid.id), false);
      });

      await t.test("different sessions competing for last unit produce order OR resolution", async () => {
        const item = await offer(1);
        const a = session(item.id), b = session(item.id);
        const results = await Promise.all([controller.testConfirmPaidSession(a), controller.testConfirmPaidSession(b)]);
        assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
        assert.equal(await db.order.count({ where: { offerId: item.id } }), 1);
        const rows = await db.$queryRaw`SELECT * FROM "SoldOutResolution" WHERE "stripeSessionId" IN (${a.id}, ${b.id})`;
        assert.equal(rows.length, 1);
        assert.equal(await db.order.count({ where: { stripeSessionId: rows[0].stripeSessionId } }), 0);
      });

      await t.test("restock while refund is in flight cannot produce a contradictory order", async () => {
        const item = await offer(0);
        const paid = session(item.id);
        const entered = deferred(), release = deferred();
        const delayedStripe = { ...stripe, refunds: { ...stripe.refunds, create: async (...args) => {
          entered.resolve(); await release.promise; return stripe.refunds.create(...args);
        } } };
        const first = loadController(db, delayedStripe).testConfirmPaidSession(paid);
        first.catch(() => {});
        try {
          await beforeDeadline(Promise.race([entered.promise, first.then(() => {
            throw new Error("Confirmation completed before refund synchronization");
          })]));
          await db.offer.update({ where: { id: item.id }, data: { quantity: 1 } });
          const replay = await controller.testConfirmPaidSession(paid, customer.id);
          release.resolve();
          assert.equal((await first).status, 409);
          assert.equal(replay.status, 409);
          assert.equal(await db.order.count({ where: { offerId: item.id } }), 0);
          assert.equal((await db.offer.findUnique({ where: { id: item.id } })).quantity, 1);
        } finally {
          release.resolve();
          await Promise.allSettled([first]);
        }
      });

      await t.test("rollback releases advisory lock and discards the uncommitted resolution", async () => {
        const item = await offer(1), paid = session(item.id);
        const [result] = await lockedPair(paid, true);
        assert.equal(result.status, 201);
        const rows = await db.$queryRaw`SELECT * FROM "SoldOutResolution" WHERE "stripeSessionId" = ${paid.id}`;
        assert.equal(rows.length, 0);
        assert.equal(await db.order.count({ where: { offerId: item.id } }), 1);
        assert.equal((await db.offer.findUnique({ where: { id: item.id } })).quantity, 0);
        assert.equal(refunds.has(paid.id), false);
      });

      await t.test("different sessions with sufficient stock create independent orders", async () => {
        const item = await offer(2);
        const a = session(item.id), b = session(item.id);
        const results = await Promise.all([controller.testConfirmPaidSession(a), controller.testConfirmPaidSession(b)]);
        assert.deepEqual(results.map(r => r.status), [201, 201]);
        assert.notEqual(results[0].body.order.id, results[1].body.order.id);
        assert.equal(await db.order.count({ where: { offerId: item.id } }), 2);
        const rows = await db.$queryRaw`SELECT * FROM "SoldOutResolution" WHERE "stripeSessionId" IN (${a.id}, ${b.id})`;
        assert.equal(rows.length, 0);
      });

      await t.test("SoldOutResolution enforces primary key, refund uniqueness, enum and required fields", async () => {
        const a = session("constraint-only"), b = session("constraint-only");
        const refundId = `re_${a.id}`;
        await db.$executeRaw`INSERT INTO "SoldOutResolution" ("stripeSessionId", "updatedAt") VALUES (${a.id}, CURRENT_TIMESTAMP), (${b.id}, CURRENT_TIMESTAMP)`;
        const rows = await db.$queryRaw`SELECT * FROM "SoldOutResolution" WHERE "stripeSessionId" IN (${a.id}, ${b.id})`;
        assert.equal(rows.length, 2, "distinct sessions and multiple NULL refund IDs are allowed");
        assert.ok(rows.every(row => row.refundStatus === "NOT_REQUESTED" && row.refundId === null));
        const sqlState = code => error => error.code === "P2010" && error.meta?.code === code;
        await assert.rejects(db.$executeRaw`INSERT INTO "SoldOutResolution" ("stripeSessionId", "updatedAt") VALUES (${a.id}, CURRENT_TIMESTAMP)`, sqlState("23505"));
        await db.$executeRaw`UPDATE "SoldOutResolution" SET "refundId" = ${refundId} WHERE "stripeSessionId" = ${a.id}`;
        await assert.rejects(db.$executeRaw`UPDATE "SoldOutResolution" SET "refundId" = ${refundId} WHERE "stripeSessionId" = ${b.id}`, sqlState("23505"));
        await assert.rejects(db.$executeRaw`UPDATE "SoldOutResolution" SET "refundStatus" = 'INVALID' WHERE "stripeSessionId" = ${a.id}`, sqlState("22P02"));
        await assert.rejects(db.$executeRaw`UPDATE "SoldOutResolution" SET "updatedAt" = NULL WHERE "stripeSessionId" = ${a.id}`, sqlState("23502"));
        await assert.rejects(db.$executeRaw`UPDATE "SoldOutResolution" SET "stripeSessionId" = NULL WHERE "stripeSessionId" = ${a.id}`, sqlState("23502"));
      });

      await t.test("independent clients serialize in-flight automatic recovery and manual settlement", async () => {
        const item = await offer(1), paid = session(item.id);
        await db.$executeRaw`INSERT INTO "SoldOutResolution" ("stripeSessionId", "paymentIntentId", "refundStatus", "refundFirstAttemptAt", "updatedAt") VALUES (${paid.id}, ${paid.payment_intent}, 'UNKNOWN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;
        const entered = deferred(), release = deferred(), evidence = [];
        let creates = 0;
        const provider = { paymentIntents: { retrieve: async () => ({ id: paid.payment_intent, status: "succeeded", amount_received: 1000, currency: "cad" }) },
          refunds: {
            async create() {
              creates++;
              const visible = await observer.soldOutResolution.findUnique({ where: { stripeSessionId: paid.id } });
              assert.ok(visible.recoveryOwnerToken, "ownership must already be committed on another connection");
              entered.resolve(); await release.promise;
              const result = { id: `re_${paid.id}`, payment_intent: paid.payment_intent, status: "failed", amount: 1000, currency: "cad" };
              evidence.push(result); return result;
            },
            async *list() { yield* evidence; }, retrieve: async id => evidence.find(r => r.id === id),
          } };
        const auto = loadController(db, provider), manual = loadRecovery().createRecovery(observer, provider);
        const input = completion({ paymentIntentId: paid.payment_intent, evidenceReference: `bank:${paid.id}` });
        const running = auto.testConfirmPaidSession(paid); running.catch(() => {});
        try {
          await beforeDeadline(Promise.race([entered.promise, running.then(() => { throw Error("automatic finished prematurely"); })]));
          await assert.rejects(manual.recordSettlement(paid.id, input, "operator"), /ownership/);
          assert.equal(await observer.soldOutManualSettlement.count({ where: { stripeSessionId: paid.id } }), 0);
        } finally { release.resolve(); await running; }
        await manual.recordSettlement(paid.id, input, "operator");
        const replay = await auto.testConfirmPaidSession(paid);
        assert.equal(replay.retryWebhook, false); assert.equal(creates, 1);
        assert.equal(await db.order.count({ where: { stripeSessionId: paid.id } }), 0);
        assert.equal((await db.offer.findUnique({ where: { id: item.id } })).quantity, 1);
      });

      await t.test("independent manual owner prevents automatic provider contact", async () => {
        const item = await offer(1), paid = session(item.id);
        await db.$executeRaw`INSERT INTO "SoldOutResolution" ("stripeSessionId", "paymentIntentId", "refundStatus", "refundFirstAttemptAt", "updatedAt") VALUES (${paid.id}, ${paid.payment_intent}, 'UNKNOWN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;
        const entered = deferred(), release = deferred(); let creates = 0;
        const provider = { paymentIntents: { retrieve: async () => { entered.resolve(); await release.promise; return { id: paid.payment_intent, status: "succeeded", amount_received: 1000, currency: "cad" }; } },
          refunds: { async *list() {}, retrieve: async () => { throw Error("unexpected retrieve"); }, create: async () => { creates++; throw Error("forbidden create"); } } };
        const manual = loadRecovery().createRecovery(observer, provider);
        const running = manual.reconcile(paid.id); running.catch(() => {});
        try {
          await beforeDeadline(Promise.race([entered.promise, running.then(() => { throw Error("manual finished prematurely"); })]));
          const replay = await loadController(db, provider).testConfirmPaidSession(paid);
          assert.equal(replay.retryWebhook, true); assert.equal(creates, 0);
        } finally { release.resolve(); await running; }
      });

      await t.test("ownership survives client disconnect and stale token cannot release it", async () => {
        const paid = session("ownership-only"), coord = loadCoordination();
        await db.$executeRaw`INSERT INTO "SoldOutResolution" ("stripeSessionId", "paymentIntentId", "refundStatus", "updatedAt") VALUES (${paid.id}, ${paid.payment_intent}, 'FAILED', CURRENT_TIMESTAMP)`;
        const owner = new PrismaClient({ datasources: { db: { url: testUrl } } });
        try {
          await owner.$transaction(async tx => {
            await coord.lockCheckout(tx, paid.id);
            assert.equal(await tx.order.findUnique({ where: { stripeSessionId: paid.id } }), null);
            await coord.acquireRecovery(tx, paid.id, "abandoned-owner");
          });
        } finally { await owner.$disconnect(); }
        const neverProvider = { paymentIntents: { retrieve: async () => { throw Error("provider must not be called"); } }, refunds: {} };
        await assert.rejects(loadRecovery().createRecovery(observer, neverProvider).recordSettlement(paid.id,
          completion({ paymentIntentId: paid.payment_intent, evidenceReference: `bank:${paid.id}` }), "operator"), /ownership/);
        await assert.rejects(observer.$transaction(async tx => {
          await coord.lockCheckout(tx, paid.id);
          await coord.releaseRecovery(tx, paid.id, "stale-owner");
        }), /release refused/);
        assert.equal((await db.soldOutResolution.findUnique({ where: { stripeSessionId: paid.id } })).recoveryOwnerToken, "abandoned-owner");
      });

      await t.test("definite operator mismatch releases committed ownership and corrected retry succeeds across clients", async () => {
        for (const [field, value] of [["amountMinor", "999"], ["currency", "USD"], ["paymentIntentId", "pi_wrong"]]) {
          const paid = session("correction-only"), owners = [];
          await db.$executeRaw`INSERT INTO "SoldOutResolution" ("stripeSessionId", "paymentIntentId", "refundStatus", "updatedAt") VALUES (${paid.id}, ${paid.payment_intent}, 'FAILED', CURRENT_TIMESTAMP)`;
          const before = await db.soldOutResolution.findUnique({ where: { stripeSessionId: paid.id } });
          const provider = { paymentIntents: { retrieve: async () => {
            const row = await observer.soldOutResolution.findUnique({ where: { stripeSessionId: paid.id } });
            assert.ok(row.recoveryOwnerToken, "another connection sees ownership before provider evidence");
            owners.push(row.recoveryOwnerToken);
            return { id: paid.payment_intent, status: "succeeded", amount_received: 1000, currency: "cad" };
          } }, refunds: { async *list() {}, retrieve: async () => { throw Error("unexpected retrieve"); },
            create: async () => { throw Error("forbidden financial action"); }, cancel: async () => { throw Error("forbidden financial action"); } } };
          const recovery = loadRecovery().createRecovery(db, provider);
          const correct = completion({ paymentIntentId: paid.payment_intent, evidenceReference: `bank:${paid.id}` });
          await assert.rejects(recovery.recordSettlement(paid.id, { ...correct, [field]: value }, "operator"), /Settlement amount\/currency\/payment mismatch/);
          assert.equal(await observer.soldOutManualSettlement.count({ where: { stripeSessionId: paid.id } }), 0);
          assert.deepEqual(await observer.soldOutResolution.findUnique({ where: { stripeSessionId: paid.id } }), before);
          await loadRecovery().createRecovery(observer, provider).recordSettlement(paid.id, correct, "operator");
          assert.equal(await db.soldOutManualSettlement.count({ where: { stripeSessionId: paid.id } }), 1);
          assert.equal((await db.soldOutResolution.findUnique({ where: { stripeSessionId: paid.id } })).recoveryOwnerToken, null);
          assert.equal(owners.length, 2); assert.notEqual(owners[0], owners[1]);
        }
      });

      await t.test("manual settlement is atomic, terminal and preserves Stripe fields", async () => {
        const item = await offer(1), paid = session(item.id);
        await db.$executeRaw`INSERT INTO "SoldOutResolution" ("stripeSessionId", "paymentIntentId", "refundStatus", "updatedAt") VALUES (${paid.id}, ${paid.payment_intent}, 'FAILED', CURRENT_TIMESTAMP)`;
        const provider = { paymentIntents: { retrieve: async () => ({ id: paid.payment_intent, status: "succeeded", amount_received: 1000, currency: "cad" }) },
          refunds: { async *list() {}, retrieve: async () => { throw Error("Unexpected retrieve"); } } };
        const recovery = loadRecovery().createRecovery(db, provider);
        const input = completion({ paymentIntentId: paid.payment_intent, evidenceReference: `bank:${paid.id}` });
        const results = await Promise.allSettled([1, 2].map(() => recovery.recordSettlement(paid.id, input, "integration-operator")));
        assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
        assert.equal(await db.soldOutManualSettlement.count({ where: { stripeSessionId: paid.id } }), 1);
        const replay = await controller.testConfirmPaidSession(paid);
        assert.equal(replay.status, 409); assert.equal(replay.retryWebhook, false);
        assert.equal(await db.order.count({ where: { stripeSessionId: paid.id } }), 0);
        assert.equal((await db.offer.findUnique({ where: { id: item.id } })).quantity, 1);
        await controller.persistRefundState(paid.id, paid.payment_intent, "UNKNOWN");
        const row = await db.soldOutResolution.findUnique({ where: { stripeSessionId: paid.id } });
        assert.equal(row.refundStatus, "FAILED"); assert.equal(row.refundId, null);
        assert.equal(refunds.has(paid.id), false);
      });

      await t.test("manual settlement database constraints reject invalid and reused evidence", async () => {
        const a = session("constraints"), b = session("constraints");
        for (const paid of [a, b]) await db.$executeRaw`INSERT INTO "SoldOutResolution" ("stripeSessionId", "updatedAt") VALUES (${paid.id}, CURRENT_TIMESTAMP)`;
        const data = { stripeSessionId: a.id, operatorId: "operator", completedAt: new Date(Date.now() - 60000), method: "BANK_TRANSFER",
          evidenceReference: `bank:${a.id}`, paymentIntentId: a.payment_intent, amountMinor: 1000n, currency: "CAD", reason: "Verified transfer to original customer" };
        await assert.rejects(db.$executeRaw`INSERT INTO "SoldOutManualSettlement" ("stripeSessionId", "operatorId", "completedAt", "method", "evidenceReference", "paymentIntentId", "amountMinor", "currency", "reason") VALUES (${a.id}, 'operator', CURRENT_TIMESTAMP, 'OTHER', 'bank:invalid', ${a.payment_intent}, 1000, 'CAD', 'Verified settlement evidence')`, e => e.code === "P2010" && e.meta?.code === "22P02");
        for (const change of [{ amountMinor: 0n }, { currency: "cad" }, { currency: "CA" }, { operatorId: "\t" },
          { evidenceReference: " " }, { paymentIntentId: " " }, { reason: "\n" }, { completedAt: new Date(Date.now() + 3600000) }]) {
          await assert.rejects(db.soldOutManualSettlement.create({ data: { ...data, ...change } }));
        }
        await assert.rejects(db.soldOutManualSettlement.create({ data: { ...data, stripeSessionId: `${prefix}_missing` } }));
        await db.soldOutManualSettlement.create({ data });
        await assert.rejects(db.soldOutManualSettlement.create({ data: { ...data, evidenceReference: `bank:second_${a.id}` } }), e => e.code === "P2002");
        await assert.rejects(db.soldOutManualSettlement.create({ data: { ...data, stripeSessionId: b.id } }), e => e.code === "P2002");
        await assert.rejects(db.soldOutResolution.delete({ where: { stripeSessionId: a.id } }), e => e.code === "P2003");
      });

      await t.test("database conditional writes never downgrade SUCCEEDED", async () => {
        const item = await offer(0), paid = session(item.id);
        await controller.testConfirmPaidSession(paid);
        await Promise.all(["PENDING", "UNKNOWN", "FAILED", "CANCELED", "NEEDS_REVIEW"].map(status =>
          controller.persistRefundState(paid.id, paid.payment_intent, status)));
        const rows = await db.$queryRaw`SELECT * FROM "SoldOutResolution" WHERE "stripeSessionId" = ${paid.id}`;
        assert.equal(rows[0].refundStatus, "SUCCEEDED");
      });
    } finally {
      try {
        // Remove only fixtures owned by this invocation; never truncate tables.
        for (const id of sessions) {
          // Test-only cleanup of invocation-owned fixtures, never a recovery capability.
          await db.soldOutManualSettlement.deleteMany({ where: { stripeSessionId: id } });
          await db.$executeRaw`DELETE FROM "SoldOutResolution" WHERE "stripeSessionId" = ${id}`;
        }
        if (customer) await db.order.deleteMany({ where: { userId: customer.id } });
        if (merchant) {
          await db.offer.deleteMany({ where: { merchantId: merchant.id } });
          await db.merchant.delete({ where: { id: merchant.id } });
        }
        if (customer) await db.user.delete({ where: { id: customer.id } });
      } finally {
        await Promise.allSettled([db.$disconnect(), observer.$disconnect()]);
      }
    }
  });
}
