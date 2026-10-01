BEGIN;
-- Additive: existing orders retain NULL; no historical financial backfill.
CREATE TABLE "CheckoutPricingSnapshot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "stripeSessionId" TEXT,
  "userId" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "stripeDestinationAccountId" TEXT NOT NULL,
  "merchandiseSubtotalMinor" INTEGER NOT NULL,
  "serviceFeeMinor" INTEGER NOT NULL,
  "customerTotalMinor" INTEGER NOT NULL,
  "merchantCommissionMinor" INTEGER NOT NULL,
  "merchantNetMinor" INTEGER NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "pricingVersion" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CheckoutPricingSnapshot_amounts_check" CHECK (
    "merchandiseSubtotalMinor" > 0 AND "customerTotalMinor" <= 99999999 AND
    "currency" = 'cad' AND "pricingVersion" IN (0,1) AND
    "merchantCommissionMinor" = ("merchandiseSubtotalMinor"::BIGINT * 15 + 50) / 100 AND
    "serviceFeeMinor" = CASE WHEN "pricingVersion" = 0 THEN 0 ELSE
      LEAST(149, GREATEST(49, ("merchandiseSubtotalMinor"::BIGINT * 5 + 50) / 100)) END AND
    "customerTotalMinor"::BIGINT = "merchandiseSubtotalMinor"::BIGINT + "serviceFeeMinor" AND
    "merchantNetMinor"::BIGINT = "merchandiseSubtotalMinor"::BIGINT - "merchantCommissionMinor"
  ),
  CONSTRAINT "CheckoutPricingSnapshot_ownership_check" CHECK (
    length(btrim("userId")) > 0 AND length(btrim("offerId")) > 0 AND
    length(btrim("stripeDestinationAccountId")) > 0 AND
    ("stripeSessionId" IS NULL OR length(btrim("stripeSessionId")) > 0)
  )
);
CREATE UNIQUE INDEX "CheckoutPricingSnapshot_stripeSessionId_key" ON "CheckoutPricingSnapshot"("stripeSessionId");
ALTER TABLE "Order" ADD COLUMN "pricingSnapshotId" TEXT;
CREATE UNIQUE INDEX "Order_pricingSnapshotId_key" ON "Order"("pricingSnapshotId");
ALTER TABLE "Order" ADD CONSTRAINT "Order_pricingSnapshotId_fkey" FOREIGN KEY ("pricingSnapshotId")
  REFERENCES "CheckoutPricingSnapshot"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "protect_checkout_pricing_snapshot"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Pricing snapshots cannot be deleted'; END IF;
  IF (to_jsonb(NEW) - 'stripeSessionId') IS DISTINCT FROM (to_jsonb(OLD) - 'stripeSessionId') OR
     (OLD."stripeSessionId" IS NOT NULL AND NEW."stripeSessionId" IS DISTINCT FROM OLD."stripeSessionId") THEN
    RAISE EXCEPTION 'Pricing snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "CheckoutPricingSnapshot_immutable" BEFORE UPDATE OR DELETE ON "CheckoutPricingSnapshot"
FOR EACH ROW EXECUTE FUNCTION "protect_checkout_pricing_snapshot"();

COMMIT;
