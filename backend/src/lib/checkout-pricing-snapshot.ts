import type Stripe from "stripe";
import type { Prisma, PrismaClient, CheckoutPricingSnapshot } from "@prisma/client";
import { checkoutPricing } from "./checkout-pricing";

const requireEvidence: (condition: unknown) => asserts condition = condition => {
  if (!condition) throw Error("Checkout pricing evidence mismatch");
};
const objectId = (value: unknown): string | undefined => typeof value === "string"
  ? value : (value as { id?: string } | null)?.id;
export type PreparedPricing = { sessionId: string; snapshot: CheckoutPricingSnapshot | null;
  data: Omit<CheckoutPricingSnapshot, "id" | "createdAt"> };

// Read-only provider work, outside the session decision transaction. No account or financial writes.
export async function prepareCheckoutPricing(db: PrismaClient, provider: Stripe, sessionId: string,
  userId: string, offerId: string): Promise<PreparedPricing> {
  const session = await provider.checkout.sessions.retrieve(sessionId, { expand: ["payment_intent", "line_items"] });
  requireEvidence(session.id === sessionId && session.mode === "payment" && session.payment_status === "paid" &&
    session.metadata?.userId === userId && session.metadata?.offerId === offerId && session.currency === "cad");
  const payment = session.payment_intent as Stripe.PaymentIntent;
  requireEvidence(payment && typeof payment !== "string" && payment.status === "succeeded" &&
    payment.currency === "cad" && payment.amount === session.amount_total && payment.amount_received === session.amount_total);
  const destination = objectId(payment.transfer_data?.destination);
  requireEvidence(destination);
  const lines = session.line_items;
  requireEvidence(lines && !lines.has_more && lines.data.every(line => line.quantity === 1 &&
    line.currency === "cad" && line.amount_discount === 0 && line.amount_tax === 0 && line.amount_subtotal === line.amount_total));
  const snapshotId = session.metadata?.pricingSnapshotId;
  const version = session.metadata?.pricingVersion;
  let snapshot: CheckoutPricingSnapshot | null = null;
  let amounts;
  if (snapshotId !== undefined || version !== undefined) {
    requireEvidence(snapshotId && version === "1");
    snapshot = await db.checkoutPricingSnapshot.findUnique({ where: { id: snapshotId } });
    requireEvidence(snapshot && snapshot.pricingVersion === 1 && snapshot.userId === userId && snapshot.offerId === offerId &&
      snapshot.stripeDestinationAccountId === destination && (!snapshot.stripeSessionId || snapshot.stripeSessionId === sessionId));
    amounts = checkoutPricing(snapshot.merchandiseSubtotalMinor);
    requireEvidence(Object.entries(amounts).every(([key, value]) => snapshot![key as keyof CheckoutPricingSnapshot] === value));
    // Do not depend on provider list ordering.
    const actual = lines.data.map(line => line.amount_total).sort((a, b) => a - b);
    const expected = [amounts.merchandiseSubtotalMinor, amounts.serviceFeeMinor].sort((a, b) => a - b);
    requireEvidence(actual.length === 2 && actual.every((amount, i) => amount === expected[i]));
  } else {
    // Legacy sessions are verified from paid evidence, never from today's offer price.
    requireEvidence(lines.data.length === 1 && typeof session.amount_total === "number");
    amounts = checkoutPricing(session.amount_total, 0);
    requireEvidence(lines.data[0].amount_total === amounts.customerTotalMinor);
  }
  requireEvidence(session.amount_total === amounts.customerTotalMinor &&
    payment.application_fee_amount === amounts.merchantCommissionMinor + amounts.serviceFeeMinor &&
    payment.transfer_data?.amount == null);
  return { sessionId, snapshot, data: { ...amounts, stripeSessionId: sessionId, userId, offerId,
    stripeDestinationAccountId: destination } };
}

// Called only while holding the existing per-session advisory lock.
export async function bindCheckoutPricing(tx: Prisma.TransactionClient, prepared: PreparedPricing) {
  const { snapshot, data, sessionId } = prepared;
  if (!snapshot) return tx.checkoutPricingSnapshot.create({ data });
  const bound = await tx.checkoutPricingSnapshot.updateMany({
    where: { id: snapshot.id, OR: [{ stripeSessionId: null }, { stripeSessionId: sessionId }] },
    data: { stripeSessionId: sessionId },
  });
  requireEvidence(bound.count === 1);
  return { ...snapshot, stripeSessionId: sessionId };
}
