import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

// Every caller checks Order first under this lock, then resolution/terminal state,
// then ownership. Provider calls follow the successful acquisition COMMIT only.
export async function lockCheckout(tx: Prisma.TransactionClient, sessionId: string) {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('foodsave:checkout:' || CAST(${sessionId} AS text), CAST(0 AS bigint)))`;
}

export function recoveryToken(): string { return randomUUID(); }

export function assertRecoveryOwner(current: string | null | undefined, expected: string | null) {
  if ((current ?? null) !== expected) throw new Error("Recovery active or uncertain; ownership mismatch");
}

export async function acquireRecovery(tx: Prisma.TransactionClient, sessionId: string, token: string) {
  if (!token) throw new Error("Recovery token required");
  const count = await tx.$executeRaw`
    UPDATE "SoldOutResolution" SET "recoveryOwnerToken" = ${token}
    WHERE "stripeSessionId" = ${sessionId} AND "recoveryOwnerToken" IS NULL
  `;
  if (count !== 1) throw new Error("Recovery active or uncertain; acquisition refused");
}

// Call only in the transaction committing a definitive result, after Order and
// ownership checks. Never call from finally, timeout handling, or stale takeover.
// A crashed/uncertain owner's committed token deliberately survives connection
// loss. No force-unlock exists; an unresolved owner blocks financial recovery.
export async function releaseRecovery(tx: Prisma.TransactionClient, sessionId: string, token: string) {
  if (!token) throw new Error("Recovery token required");
  const count = await tx.$executeRaw`
    UPDATE "SoldOutResolution" SET "recoveryOwnerToken" = NULL
    WHERE "stripeSessionId" = ${sessionId} AND "recoveryOwnerToken" = ${token}
  `;
  if (count !== 1) throw new Error("Recovery ownership changed; release refused");
}
