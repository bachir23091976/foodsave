CREATE TYPE "SoldOutRefundStatus" AS ENUM (
    'NOT_REQUESTED', 'UNKNOWN', 'PENDING', 'REQUIRES_ACTION',
    'SUCCEEDED', 'FAILED', 'CANCELED', 'NEEDS_REVIEW'
);

CREATE TABLE "SoldOutResolution" (
    "stripeSessionId" TEXT NOT NULL,
    "paymentIntentId" TEXT,
    "refundId" TEXT,
    "refundStatus" "SoldOutRefundStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "refundFirstAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SoldOutResolution_pkey" PRIMARY KEY ("stripeSessionId")
);

CREATE UNIQUE INDEX "SoldOutResolution_refundId_key" ON "SoldOutResolution"("refundId");
CREATE INDEX "SoldOutResolution_refundStatus_updatedAt_idx" ON "SoldOutResolution"("refundStatus", "updatedAt");
