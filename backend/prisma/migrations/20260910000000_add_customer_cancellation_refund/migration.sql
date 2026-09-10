CREATE TYPE "CustomerCancellationRefundStatus" AS ENUM ('NOT_REQUESTED', 'UNKNOWN', 'PENDING', 'REQUIRES_ACTION', 'SUCCEEDED', 'FAILED', 'CANCELED', 'NEEDS_REVIEW');
CREATE TABLE "CustomerCancellationRefund" (
  "orderId" TEXT NOT NULL PRIMARY KEY,
  "stripeSessionId" TEXT NOT NULL,
  "paymentIntentId" TEXT,
  "refundId" TEXT,
  "refundStatus" "CustomerCancellationRefundStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  "firstAttemptAt" TIMESTAMP(3),
  "lastError" TEXT,
  "recoveryOwnerToken" TEXT,
  "reconciliationOwnerToken" TEXT,
  "creationDispatched" BOOLEAN NOT NULL DEFAULT false,
  "inventoryRestored" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerCancellationRefund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "CustomerCancellationRefund_stripeSessionId_key" ON "CustomerCancellationRefund"("stripeSessionId");
CREATE UNIQUE INDEX "CustomerCancellationRefund_refundId_key" ON "CustomerCancellationRefund"("refundId");
