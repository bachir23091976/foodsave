-- Uncommitted migration revised before release. Recreate the disposable local
-- validation database explicitly; never rewrite applied remote migration history.
ALTER TABLE "SoldOutResolution" ADD COLUMN "recoveryOwnerToken" TEXT;

CREATE TYPE "ManualSettlementMethod" AS ENUM ('BANK_TRANSFER', 'PAYMENT_PROVIDER');

CREATE TABLE "SoldOutManualSettlement" (
    "stripeSessionId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" "ManualSettlementMethod" NOT NULL,
    "evidenceReference" TEXT NOT NULL,
    "paymentIntentId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "reason" TEXT NOT NULL,
    CONSTRAINT "SoldOutManualSettlement_pkey" PRIMARY KEY ("stripeSessionId"),
    CONSTRAINT "SoldOutManualSettlement_resolution_fkey" FOREIGN KEY ("stripeSessionId") REFERENCES "SoldOutResolution"("stripeSessionId") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "manual_positive_amount" CHECK ("amountMinor" > 0),
    CONSTRAINT "manual_currency" CHECK ("currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "manual_operator" CHECK ("operatorId" ~ '[^[:space:]]'),
    CONSTRAINT "manual_evidence" CHECK ("evidenceReference" ~ '[^[:space:]]'),
    CONSTRAINT "manual_payment" CHECK ("paymentIntentId" ~ '[^[:space:]]'),
    CONSTRAINT "manual_reason" CHECK ("reason" ~ '[^[:space:]]'),
    CONSTRAINT "manual_completed_time" CHECK ("completedAt" <= "recordedAt")
);

CREATE UNIQUE INDEX "SoldOutManualSettlement_method_evidenceReference_key" ON "SoldOutManualSettlement"("method", "evidenceReference");
