import { Prisma, PrismaClient } from "@prisma/client";

export const PICKUP_GRACE_MS = 15 * 60 * 1000;

// Caller may already hold its existing advisory lock. Always acquire row locks
// after advisory locks; this helper never acquires an advisory lock.
export async function lockedOrder(tx: Prisma.TransactionClient, orderId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { offer: { include: { merchant: true } } } });
  // Epoch milliseconds preserve sub-millisecond comparison at an exact deadline
  // and do not depend on the PostgreSQL session timezone.
  const [clock] = await tx.$queryRaw<{ nowMs: number }[]>`SELECT (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::double precision AS "nowMs"`;
  if (!Number.isFinite(clock?.nowMs)) throw Error("Database decision time unavailable");
  return { order, now: clock.nowMs };
}

export function isOverdue(order: { status: string; noShowEligibleAt?: Date | null }, now: number) {
  return order.status === "CONFIRMED" && order.noShowEligibleAt != null && now > order.noShowEligibleAt.getTime();
}

export async function transitionOrder(db: PrismaClient, orderId: string, ownerId: string,
  action: "PICKUP" | "CANCEL", cancellationReason?: string) {
  return db.$transaction(async tx => {
    const { order, now } = await lockedOrder(tx, orderId);
    if (!order || order.offer.merchant.ownerId !== ownerId) return false;
    if (isOverdue(order, now)) {
      await tx.order.updateMany({ where: { id: orderId, status: "CONFIRMED" }, data: { status: "NO_SHOW" } });
      return false; // Return normally so expiration commits even when action is rejected.
    }
    if (order.status !== "CONFIRMED") return false;
    if (action === "PICKUP" && (now < order.offer.pickupStart.getTime() || now > (order.noShowEligibleAt ?? order.offer.pickupEnd).getTime())) return false;
    if (action === "CANCEL" && !order.stripeSessionId) return false;
    const result = await tx.order.updateMany({ where: { id: orderId, status: "CONFIRMED" },
      data: action === "PICKUP" ? { status: "COMPLETED" } : { status: "CANCELLED", cancellationReason } });
    return result.count === 1;
  });
}

// A bounded batch. Row selection and the final decision each use database time.
// No provider, inventory, notification or reward dependencies.
export async function reconcileNoShows(db: PrismaClient, scope: { userId?: string; merchantId?: string } = {}, limit = 100) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw Error("Invalid batch size");
  return db.$transaction(async tx => {
    const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT o."id" FROM "Order" o JOIN "Offer" f ON f."id" = o."offerId"
      WHERE o."status" = 'CONFIRMED' AND o."noShowEligibleAt" IS NOT NULL
        AND o."noShowEligibleAt" < (clock_timestamp() AT TIME ZONE 'UTC')
        ${scope.userId ? Prisma.sql`AND o."userId" = ${scope.userId}` : Prisma.empty}
        ${scope.merchantId ? Prisma.sql`AND f."merchantId" = ${scope.merchantId}` : Prisma.empty}
      ORDER BY o."id" LIMIT ${limit} FOR UPDATE OF o SKIP LOCKED`);
    let changed = 0;
    for (const { id } of rows) {
      const { order, now } = await lockedOrder(tx, id);
      if (order && isOverdue(order, now)) changed += (await tx.order.updateMany({
        where: { id, status: "CONFIRMED" }, data: { status: "NO_SHOW" },
      })).count;
    }
    return changed;
  });
}
