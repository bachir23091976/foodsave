import type { Prisma } from "@prisma/client";
import { offerPriceMinor } from "./checkout-pricing";

type Configuration = { enabled: boolean; startingPriceMinor: number; minimumPriceMinor: number; formulaVersion: number };
type PricedOffer = { discountedPrice: number; pickupStart: Date; pickupEnd: Date; dynamicPricing?: Configuration | null };
// Activation only: never use this flag to reprice an existing dynamic offer.
export function dynamicPricingEnabled(): boolean {
  return process.env.FOODSAVE_DYNAMIC_PRICING_ENABLED === "true";
}
export function validateDynamicConfiguration(start: number, minimum: number, version = 1) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(minimum) || minimum <= 0 || minimum > start || start > 99_999_850 || version !== 1)
    throw Error("Invalid dynamic configuration");
}
export function currentPriceMinor(offer: PricedOffer, now: Date): number {
  const end = offer.pickupEnd.getTime(), time = now.getTime();
  if (!Number.isFinite(time) || !Number.isFinite(end) || time >= end) throw Error("Offer unavailable");
  const config = offer.dynamicPricing;
  if (!config?.enabled) return offerPriceMinor(offer.discountedPrice);
  validateDynamicConfiguration(config.startingPriceMinor, config.minimumPriceMinor, config.formulaVersion);
  const start = offer.pickupStart.getTime();
  if (!Number.isFinite(start) || end <= start) throw Error("Invalid pickup window");
  if (time <= start) return config.startingPriceMinor;
  const stage = (4n * (BigInt(time) - BigInt(start))) / (BigInt(end) - BigInt(start));
  const k = stage > 3n ? 3n : stage;
  return Number(BigInt(config.startingPriceMinor) - (BigInt(config.startingPriceMinor - config.minimumPriceMinor) * k) / 3n);
}
export async function pricingDecisionTime(tx: Prisma.TransactionClient): Promise<Date> {
  const [clock] = await tx.$queryRaw<{ nowMs: number }[]>`SELECT (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::double precision AS "nowMs"`;
  if (!Number.isFinite(clock?.nowMs)) throw Error("Database time unavailable");
  return new Date(Math.floor(clock.nowMs));
}
