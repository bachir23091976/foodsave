import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
import { cancellationRefundService } from "../lib/customer-cancellation-refund";

// Explicit operator invocation only. No dotenv, replacement refunds, manual
// payment authorization, ownership takeover, order reactivation or bulk mode.
export async function run(args: string[], env = process.env) {
  if (args.length !== 1 || !args[0].trim()) throw Error("One Order ID required");
  if (!env.FOODSAVE_CANCELLATION_DATABASE_URL || !env.FOODSAVE_CANCELLATION_STRIPE_KEY)
    throw Error("Explicit database and read-only provider credentials required; no fallback");
  const url = new URL(env.FOODSAVE_CANCELLATION_DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw Error("PostgreSQL required");
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  try {
    const stripe = new Stripe(env.FOODSAVE_CANCELLATION_STRIPE_KEY, { maxNetworkRetries: 0 });
    const row = await cancellationRefundService(db).reconcile(args[0], {
      checkout: { sessions: { retrieve: stripe.checkout.sessions.retrieve.bind(stripe.checkout.sessions) } },
      paymentIntents: { retrieve: stripe.paymentIntents.retrieve.bind(stripe.paymentIntents) },
      refunds: { list: stripe.refunds.list.bind(stripe.refunds) },
    });
    console.log(JSON.stringify({ orderId: row.orderId, refundStatus: row.refundStatus,
      refundId: row.refundId, inventoryRestored: row.inventoryRestored, lastError: row.lastError }));
  } finally { await db.$disconnect(); }
}
if (require.main === module) run(process.argv.slice(2)).catch(() => {
  console.error("Reconciliation refused or uncertain. Investigate before any manual financial action.");
  process.exitCode = 1;
});
