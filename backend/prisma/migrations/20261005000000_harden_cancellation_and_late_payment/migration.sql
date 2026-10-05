BEGIN;
-- Keep existing recovery tables and historical semantics; no Order backfill.
CREATE TYPE "CancellationRefundActor" AS ENUM ('CUSTOMER', 'MERCHANT');
ALTER TABLE "CustomerCancellationRefund"
  ADD COLUMN "actor" "CancellationRefundActor" NOT NULL DEFAULT 'CUSTOMER';
CREATE TYPE "UnavailablePaymentReason" AS ENUM ('SOLD_OUT', 'PICKUP_EXPIRED');
ALTER TABLE "SoldOutResolution"
  ADD COLUMN "reason" "UnavailablePaymentReason" NOT NULL DEFAULT 'SOLD_OUT';
COMMIT;
