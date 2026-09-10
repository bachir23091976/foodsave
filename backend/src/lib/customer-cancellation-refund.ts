import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient, CustomerCancellationRefundStatus } from "@prisma/client";
import type Stripe from "stripe";

type Reads = {
  checkout: { sessions: Pick<Stripe["checkout"]["sessions"], "retrieve"> };
  paymentIntents: Pick<Stripe["paymentIntents"], "retrieve">;
  refunds: Pick<Stripe["refunds"], "list">;
};
type Provider = Reads & { refunds: Reads["refunds"] & Pick<Stripe["refunds"], "create"> };
const statuses: Record<string, CustomerCancellationRefundStatus> = {
  succeeded: "SUCCEEDED", pending: "PENDING", requires_action: "REQUIRES_ACTION",
  failed: "FAILED", canceled: "CANCELED",
};
function check(value: unknown, message: string): asserts value { if (!value) throw Error(message); }
function id(value: unknown): string | undefined {
  return typeof value === "string" ? value : (value as { id?: string } | null)?.id;
}
export function cancellationRefundService(db: PrismaClient) {
  async function locked<T>(orderId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>) {
    return db.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${"foodsave:customer-cancellation:" + orderId}, 0))`;
      return fn(tx);
    });
  }
  async function snapshot(tx: Prisma.TransactionClient, orderId: string) {
    const row = await tx.customerCancellationRefund.findUnique({ where: { orderId }, include: { order: true } });
    check(row && row.order.status === "CANCELLED", "Cancelled order and durable record required");
    check(row.stripeSessionId === row.order.stripeSessionId, "Order/session mismatch");
    return row;
  }
  async function evidence(provider: Reads, row: Awaited<ReturnType<typeof snapshot>>) {
    const session = await provider.checkout.sessions.retrieve(row.stripeSessionId);
    check(session.id === row.stripeSessionId && session.payment_status === "paid" &&
      session.metadata?.userId === row.order.userId && session.metadata?.offerId === row.order.offerId,
    "Checkout/order evidence mismatch");
    const paymentIntentId = id(session.payment_intent);
    check(paymentIntentId && (!row.paymentIntentId || row.paymentIntentId === paymentIntentId), "PaymentIntent mismatch");
    const payment = await provider.paymentIntents.retrieve(paymentIntentId);
    check(payment.id === paymentIntentId && payment.status === "succeeded" &&
      Number.isSafeInteger(payment.amount_received) && payment.amount_received > 0 &&
      session.amount_total === payment.amount_received && session.currency === payment.currency,
    "Payment amount/currency evidence mismatch");
    const found: Stripe.Refund[] = [];
    for await (const refund of provider.refunds.list({ payment_intent: paymentIntentId, limit: 100 })) {
      check(id(refund.payment_intent) === paymentIntentId && refund.amount === payment.amount_received &&
        refund.currency === payment.currency, "Partial/mismatched refund requires investigation");
      found.push(refund);
      check(found.length <= 1, "Multiple refunds require investigation");
    }
    check(!row.refundId || found[0]?.id === row.refundId, "Known refund missing or mismatched");
    return { paymentIntentId, payment, refund: found[0] as Stripe.Refund | undefined };
  }
  async function persist(orderId: string, token: string, reconcile: boolean,
    paymentIntentId: string | null, refund: Stripe.Refund | undefined, error: string | null = null) {
    return locked(orderId, async tx => {
      const row = await snapshot(tx, orderId);
      const field = reconcile ? "reconciliationOwnerToken" : "recoveryOwnerToken";
      check(row[field] === token, "Stale recovery owner");
      if (row.refundStatus === "SUCCEEDED") return row;
      check(!row.paymentIntentId || !paymentIntentId || row.paymentIntentId === paymentIntentId, "PaymentIntent changed");
      check(!row.refundId || !refund || row.refundId === refund.id, "Refund changed");
      const status = refund ? statuses[refund.status || ""] || "UNKNOWN" : "NEEDS_REVIEW";
      let inventoryRestored = row.inventoryRestored;
      if (status === "SUCCEEDED" && !inventoryRestored) {
        // Zero may mean explicit merchant deactivation. Never infer available
        // inventory from zero; leave it unchanged for audited investigation.
        const restored = await tx.offer.updateMany({
          where: { id: row.order.offerId, quantity: { gt: 0 }, pickupEnd: { gt: new Date() } },
          data: { quantity: { increment: 1 } },
        });
        inventoryRestored = restored.count === 1;
      }
      return tx.customerCancellationRefund.update({ where: { orderId }, data: {
        paymentIntentId: paymentIntentId || row.paymentIntentId, refundId: refund?.id || row.refundId,
        refundStatus: status, inventoryRestored,
        lastError: status === "SUCCEEDED" ? (inventoryRestored ? null : "Inventory unchanged: availability requires verification")
          : error || "Refund incomplete; audited investigation required",
        // Reconciliation never releases or replaces financial creation ownership.
        ...(reconcile ? { reconciliationOwnerToken: null } :
          status === "UNKNOWN" ? {} : { recoveryOwnerToken: null }),
      } });
    });
  }
  return {
    async claim(orderId: string, userId: string) {
      const token = randomUUID();
      return locked(orderId, async tx => {
        const order = await tx.order.findUnique({ where: { id: orderId }, include: { offer: true } });
        check(order && order.userId === userId && order.status === "CONFIRMED" && order.stripeSessionId,
          "Order no longer eligible for cancellation");
        check(Date.now() < order.offer.pickupStart.getTime() - 3600000, "Cancellation cutoff passed");
        const changed = await tx.order.updateMany({ where: { id: orderId, userId, status: "CONFIRMED" },
          data: { status: "CANCELLED", cancellationReason: "Annulée par le client" } });
        check(changed.count === 1, "Cancellation already claimed");
        await tx.customerCancellationRefund.create({ data: { orderId, stripeSessionId: order.stripeSessionId,
          recoveryOwnerToken: token, refundStatus: "UNKNOWN", firstAttemptAt: new Date() } });
        return token;
      });
    },
    async attempt(orderId: string, token: string, provider: Provider) {
      try {
        const row = await locked(orderId, async tx => {
          const current = await snapshot(tx, orderId);
          check(current.recoveryOwnerToken === token, "Stale recovery owner");
          return current;
        });
        if (row.refundStatus === "SUCCEEDED") return row;
        const found = await evidence(provider, row);
        let refund = found.refund;
        if (!refund) {
          await locked(orderId, async tx => {
            const current = await snapshot(tx, orderId);
            check(current.recoveryOwnerToken === token && current.refundStatus !== "SUCCEEDED" &&
              !current.creationDispatched, "Creation already dispatched or terminal; reconcile only");
            await tx.customerCancellationRefund.update({ where: { orderId }, data: {
              creationDispatched: true, paymentIntentId: found.paymentIntentId,
            } });
          });
          refund = await provider.refunds.create({ payment_intent: found.paymentIntentId,
            reverse_transfer: true, refund_application_fee: true }, { idempotencyKey: `customer_cancel_${orderId}` });
        }
        check(id(refund.payment_intent) === found.paymentIntentId && refund.amount === found.payment.amount_received &&
          refund.currency === found.payment.currency, "Refund response mismatch");
        return await persist(orderId, token, false, found.paymentIntentId, refund);
      } catch (error) {
        await locked(orderId, async tx => {
          const row = await snapshot(tx, orderId);
          check(row.recoveryOwnerToken === token || row.refundStatus === "SUCCEEDED", "Stale recovery owner");
          if (row.refundStatus !== "SUCCEEDED") await tx.customerCancellationRefund.update({ where: { orderId },
            data: { refundStatus: "UNKNOWN", lastError: "Provider or persistence outcome uncertain; reconcile evidence; never retry creation" } });
        });
        throw error;
      }
    },
    async reconcile(orderId: string, provider: Reads) {
      const token = randomUUID();
      const row = await locked(orderId, async tx => {
        const current = await snapshot(tx, orderId);
        if (current.refundStatus === "SUCCEEDED") return current;
        check(!current.reconciliationOwnerToken, "Reconciliation already owned; investigation required");
        await tx.customerCancellationRefund.update({ where: { orderId }, data: { reconciliationOwnerToken: token } });
        return current;
      });
      if (row.refundStatus === "SUCCEEDED") return row;
      // Read-only provider evidence can be reconciled while a creation token is
      // abandoned/in flight: this path never authorizes financial creation or
      // manual payment. Only verified success is terminal; absence is not proof
      // of failure. A crash retains the separate reconciliation token.
      const found = await evidence(provider, row);
      return persist(orderId, token, true, found.paymentIntentId, found.refund,
        "No definitive successful refund; audited investigation required; do not issue replacement payment");
    },
  };
}
