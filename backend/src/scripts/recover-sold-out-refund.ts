/** Operator-only recovery. No dotenv, application bootstrap, or financial API methods.
 * Usage: recover-sold-out-refund list|reconcile SESSION|record-settlement SESSION
 * Explicit process variables: FOODSAVE_RECOVERY_DATABASE_URL, FOODSAVE_RECOVERY_STRIPE_KEY.
 * record-settlement reads one JSON evidence object from stdin (never credentials).
 * Requires FOODSAVE_RECOVERY_OPERATOR_ID. Durable ownership, not a drain flag,
 * serializes recovery. During rollout stop/drain older workers that do not use
 * ownership. Never make an external manual payment while recovery is uncertain.
 * Evidence must be independently checked against the completed transfer and its
 * recipient; this command cannot verify a bank receipt from a reference string.
 */
import { Prisma, PrismaClient, SoldOutRefundStatus } from "@prisma/client";
import Stripe from "stripe";
import { lockCheckout, recoveryToken, acquireRecovery, assertRecoveryOwner, releaseRecovery } from "../lib/sold-out-recovery-coordination";

type Provider = {
  paymentIntents: Pick<Stripe["paymentIntents"], "retrieve">;
  refunds: Pick<Stripe["refunds"], "retrieve" | "list">;
};
type Settlement = {
  operatorId: string; completedAt: Date; method: "BANK_TRANSFER" | "PAYMENT_PROVIDER";
  evidenceReference: string; paymentIntentId: string; amountMinor: bigint; currency: string; reason: string;
};
function requireThat(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function nonblank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function minor(value: number): bigint {
  requireThat(Number.isSafeInteger(value) && value >= 0, "Unsafe provider amount");
  return BigInt(value);
}
function paymentId(value: Stripe.Refund["payment_intent"]): string | undefined {
  return typeof value === "string" ? value : value?.id;
}
export function parseSettlement(input: unknown, operatorId: string): Settlement {
  requireThat(input && typeof input === "object" && !Array.isArray(input), "Evidence object required");
  const e = input as Record<string, unknown>;
  const keys = ["completedAt", "method", "evidenceReference", "paymentIntentId", "amountMinor", "currency", "reason", "evidenceVerified", "recipientVerified"];
  requireThat(Object.keys(e).every(k => keys.includes(k)), "Unknown evidence field");
  requireThat(e.evidenceVerified === true && e.recipientVerified === true,
    "Verified completion and recipient evidence are required");
  requireThat(nonblank(operatorId), "Operator identity required");
  requireThat(["BANK_TRANSFER", "PAYMENT_PROVIDER"].includes(String(e.method)), "Invalid method");
  requireThat(nonblank(e.evidenceReference) && /^[^\s:]+:[^\s]+$/.test(e.evidenceReference), "Namespaced individual settlement reference required");
  requireThat(nonblank(e.paymentIntentId), "PaymentIntent required");
  requireThat(nonblank(e.reason) && e.reason.trim().length >= 20, "Documented settlement reason (at least 20 characters) required");
  requireThat(typeof e.amountMinor === "string" && /^[1-9][0-9]*$/.test(e.amountMinor), "Positive integer amount string required");
  const amountMinor = BigInt(e.amountMinor);
  requireThat(amountMinor <= BigInt("9223372036854775807"), "Amount exceeds database range");
  requireThat(typeof e.currency === "string" && /^[A-Z]{3}$/.test(e.currency), "Uppercase currency required");
  requireThat(typeof e.completedAt === "string" && /^\d{4}-\d{2}-\d{2}T.*Z$/.test(e.completedAt), "UTC completion timestamp required");
  const completedAt = new Date(e.completedAt);
  requireThat(Number.isFinite(completedAt.getTime()) && completedAt.getTime() <= Date.now(), "Invalid completion time");
  return { operatorId: operatorId.trim(), completedAt, method: e.method as Settlement["method"],
    evidenceReference: e.evidenceReference, paymentIntentId: e.paymentIntentId.trim(), amountMinor,
    currency: e.currency, reason: e.reason.trim() };
}

export function createRecovery(db: PrismaClient, provider: Provider) {
  async function locked<T>(sessionId: string, action: (tx: Prisma.TransactionClient) => Promise<T>) {
    requireThat(nonblank(sessionId), "One explicit session required");
    return db.$transaction(async tx => {
      await lockCheckout(tx, sessionId);
      return action(tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }
  async function snapshot(tx: Prisma.TransactionClient, sessionId: string, token: string | null = null) {
    requireThat(!await tx.order.findUnique({ where: { stripeSessionId: sessionId } }), "Existing Order wins; recovery stopped");
    const r = await tx.soldOutResolution.findUnique({ where: { stripeSessionId: sessionId }, include: { manualSettlement: true } });
    requireThat(r, "Resolution missing; never create/reset a decision");
    requireThat(r.refundStatus !== "SUCCEEDED" && !r.manualSettlement, "Already terminal");
    assertRecoveryOwner(r.recoveryOwnerToken, token);
    requireThat(r.paymentIntentId, "Missing PaymentIntent; manual investigation required");
    return r;
  }
  type Snapshot = Awaited<ReturnType<typeof snapshot>>;
  function unchanged(a: Snapshot, b: Snapshot) {
    requireThat(a.paymentIntentId === b.paymentIntentId && a.refundId === b.refundId &&
      a.refundStatus === b.refundStatus && a.updatedAt.getTime() === b.updatedAt.getTime() &&
      a.refundFirstAttemptAt?.getTime() === b.refundFirstAttemptAt?.getTime(), "State changed; reconcile again");
  }
  async function evidence(r: Snapshot) {
    const payment = await provider.paymentIntents.retrieve(r.paymentIntentId!);
    requireThat(payment.id === r.paymentIntentId && payment.status === "succeeded", "Payment not verified succeeded");
    const amount = minor(payment.amount_received);
    requireThat(amount > BigInt(0) && /^[a-z]{3}$/.test(payment.currency), "Invalid payment amount/currency");
    const refunds: Stripe.Refund[] = [];
    for await (const refund of provider.refunds.list({ payment_intent: payment.id, limit: 100 })) {
      requireThat(!refunds.some(v => v.id === refund.id), "Duplicate evidence");
      refunds.push(refund);
    }
    if (r.refundId) {
      const known = await provider.refunds.retrieve(r.refundId);
      const listed = refunds.find(v => v.id === r.refundId);
      requireThat(listed && known.id === listed.id && known.status === listed.status &&
        known.amount === listed.amount && known.currency === listed.currency &&
        paymentId(known.payment_intent) === paymentId(listed.payment_intent), "Conflicting/missing known refund evidence");
    }
    for (const refund of refunds) {
      requireThat(paymentId(refund.payment_intent) === payment.id && refund.currency === payment.currency &&
        minor(refund.amount) === amount, "Partial or mismatched refund; manual investigation required");
    }
    requireThat(refunds.length <= 1, "Multiple refunds; manual investigation required");
    return { payment, amount, refund: refunds[0] as Stripe.Refund | undefined };
  }
  return {
    async list() {
      return db.soldOutResolution.findMany({
        where: { refundStatus: { not: "SUCCEEDED" }, manualSettlement: { is: null } },
        orderBy: { updatedAt: "asc" },
      });
    },
    async reconcile(sessionId: string) {
      const token = recoveryToken();
      const before = await locked(sessionId, async tx => {
        const current = await snapshot(tx, sessionId);
        await acquireRecovery(tx, sessionId, token);
        return current;
      });
      const found = await evidence(before); // Provider reads never inside transactions.
      const status = found.refund?.status;
      const statuses: Record<string, SoldOutRefundStatus> = {
        succeeded: "SUCCEEDED", pending: "PENDING", requires_action: "REQUIRES_ACTION", failed: "FAILED", canceled: "CANCELED",
      };
      requireThat(!found.refund || !!statuses[status || ""], "Unrecognized refund status");
      return locked(sessionId, async tx => {
        const current = await snapshot(tx, sessionId, token);
        unchanged(before, current);
        // Released only in the transaction committing verified evidence. Any
        // provider/validation/commit error retains the durable owner; no finally.
        await releaseRecovery(tx, sessionId, token);
        if (!found.refund) {
          const age = current.refundFirstAttemptAt ? Date.now() - current.refundFirstAttemptAt.getTime() : NaN;
          if (current.refundStatus === "UNKNOWN" && (!Number.isFinite(age) || age >= 23 * 60 * 60 * 1000)) {
            return { outcome: "NEEDS_REVIEW", resolution: await tx.soldOutResolution.update({
              where: { stripeSessionId: sessionId },
              data: { refundStatus: "NEEDS_REVIEW", lastError: "No refund evidence after retry window; operator settlement investigation required" },
            }) };
          }
          return { outcome: "UNRESOLVED", resolution: current };
        }
        requireThat(!current.refundId || current.refundId === found.refund.id, "Refund ID conflict");
        return { outcome: "RECONCILED", resolution: await tx.soldOutResolution.update({
          where: { stripeSessionId: sessionId },
          data: { refundStatus: statuses[status!], refundId: found.refund.id, lastError: null },
        }) };
      });
    },
    async recordSettlement(sessionId: string, input: unknown, operatorId: string) {
      const settlement = parseSettlement(input, operatorId);
      const token = recoveryToken();
      const before = await locked(sessionId, async tx => {
        const current = await snapshot(tx, sessionId);
        requireThat(["FAILED", "CANCELED", "NEEDS_REVIEW"].includes(current.refundStatus), "Case must already be stopped for manual review");
        await acquireRecovery(tx, sessionId, token);
        return current;
      });
      const found = await evidence(before);
      requireThat(!found.refund || ["failed", "canceled"].includes(found.refund.status || ""), "Refund may still complete or already succeeded");
      if (settlement.paymentIntentId !== found.payment.id || settlement.amountMinor !== found.amount ||
          settlement.currency !== found.payment.currency.toUpperCase()) {
        // Only a definite operator-input rejection reaches here: provider reads
        // completed and no pending/uncertain refund was found. No financial call
        // or settlement insert has occurred. Do not generalize to catch/finally:
        // provider uncertainty and ambiguous persistence must retain ownership.
        await locked(sessionId, async tx => {
          const current = await snapshot(tx, sessionId, token);
          unchanged(before, current);
          await releaseRecovery(tx, sessionId, token);
        });
        // Reject AFTER the release commits, otherwise throwing rolls it back.
        throw new Error("Settlement amount/currency/payment mismatch");
      }
      return locked(sessionId, async tx => {
        const current = await snapshot(tx, sessionId, token);
        unchanged(before, current);
        // Insert only. PK and evidence uniqueness are the final concurrency guard.
        const result = await tx.soldOutManualSettlement.create({ data: { stripeSessionId: sessionId, ...settlement } });
        await releaseRecovery(tx, sessionId, token);
        return result;
      });
    },
  };
}

export async function runCli(args: string[], env: NodeJS.ProcessEnv = process.env) {
  const [command, sessionId] = args;
  requireThat((command === "list" && args.length === 1) ||
    (["reconcile", "record-settlement"].includes(command) && args.length === 2 && nonblank(sessionId)),
  "Usage: list | reconcile SESSION | record-settlement SESSION");
  requireThat(env.FOODSAVE_RECOVERY_DATABASE_URL, "Explicit FOODSAVE_RECOVERY_DATABASE_URL required; no fallback");
  const target = new URL(env.FOODSAVE_RECOVERY_DATABASE_URL);
  requireThat(["postgres:", "postgresql:"].includes(target.protocol), "PostgreSQL target required");
  requireThat(command === "list" || env.FOODSAVE_RECOVERY_STRIPE_KEY, "Explicit read-only provider credential required");
  const db = new PrismaClient({ datasources: { db: { url: target.toString() } } });
  try {
    // Capability-limited adapter; never expose create/cancel to recovery.
    const stripe = command === "list" ? null : new Stripe(env.FOODSAVE_RECOVERY_STRIPE_KEY!, { maxNetworkRetries: 0 });
    const unavailable = () => { throw new Error("Provider unavailable for list"); };
    const provider = stripe ? { paymentIntents: { retrieve: stripe.paymentIntents.retrieve.bind(stripe.paymentIntents) },
      refunds: { retrieve: stripe.refunds.retrieve.bind(stripe.refunds), list: stripe.refunds.list.bind(stripe.refunds) } }
      : { paymentIntents: { retrieve: unavailable }, refunds: { retrieve: unavailable, list: unavailable } };
    const recovery = createRecovery(db, provider);
    let result: unknown;
    if (command === "list") result = await recovery.list();
    else if (command === "reconcile") result = await recovery.reconcile(sessionId);
    else {
      requireThat(nonblank(env.FOODSAVE_RECOVERY_OPERATOR_ID), "Operator identity required");
      let input = "";
      for await (const chunk of process.stdin) {
        input += chunk.toString();
        requireThat(input.length <= 16384, "Evidence input too large");
      }
      result = await recovery.recordSettlement(sessionId, JSON.parse(input), env.FOODSAVE_RECOVERY_OPERATOR_ID);
    }
    console.log(JSON.stringify(result, (_, v) => typeof v === "bigint" ? v.toString() : v, 2));
  } finally { await db.$disconnect(); }
}
if (require.main === module) {
  runCli(process.argv.slice(2)).catch(() => {
    // Do not print connection strings/provider errors that may contain secrets.
    console.error("Recovery refused or failed. Verify inputs, evidence, and current state before retrying.");
    process.exitCode = 1;
  });
}
