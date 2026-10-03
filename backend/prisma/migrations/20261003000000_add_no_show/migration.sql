-- Historical orders deliberately retain NULL. No backfill.
ALTER TYPE "OrderStatus" ADD VALUE 'NO_SHOW';
ALTER TABLE "Order" ADD COLUMN "noShowEligibleAt" TIMESTAMP(3);
CREATE INDEX "Order_status_noShowEligibleAt_idx" ON "Order"("status", "noShowEligibleAt");
