-- Additive private configuration; historical offers remain fixed-price.
CREATE TABLE "OfferDynamicPricing" (
  "offerId" TEXT PRIMARY KEY REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "startingPriceMinor" INTEGER NOT NULL,
  "minimumPriceMinor" INTEGER NOT NULL,
  "formulaVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OfferDynamicPricing_amounts_check" CHECK (
    "minimumPriceMinor" > 0 AND "minimumPriceMinor" <= "startingPriceMinor"
    AND "startingPriceMinor" <= 99999850 AND "formulaVersion" = 1
  )
);
