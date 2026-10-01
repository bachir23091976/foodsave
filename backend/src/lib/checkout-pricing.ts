// All accounting uses integer cents. Major units exist only at the legacy boundary.
export const MAX_CUSTOMER_TOTAL_MINOR = 99_999_999;
export function offerPriceMinor(value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw Error("Invalid offer price");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) throw Error("Offer price must have at most two decimal places");
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] || "").padEnd(2, "0"));
  if (cents > BigInt(MAX_CUSTOMER_TOTAL_MINOR)) throw Error("Price exceeds supported range");
  return Number(cents);
}
export function checkoutPricing(subtotal: number, version: 0 | 1 = 1) {
  if (!Number.isSafeInteger(subtotal) || subtotal <= 0 || subtotal > MAX_CUSTOMER_TOTAL_MINOR ||
      (version !== 0 && version !== 1)) throw Error("Invalid pricing input");
  const s = BigInt(subtotal);
  const percent = (p: bigint) => Number((s * p + 50n) / 100n);
  const serviceFeeMinor = version === 0 ? 0 : Math.min(149, Math.max(49, percent(5n)));
  const merchantCommissionMinor = percent(15n);
  const customerTotalMinor = subtotal + serviceFeeMinor;
  if (customerTotalMinor > MAX_CUSTOMER_TOTAL_MINOR) throw Error("Total exceeds supported range");
  return { merchandiseSubtotalMinor: subtotal, serviceFeeMinor, customerTotalMinor,
    merchantCommissionMinor, merchantNetMinor: subtotal - merchantCommissionMinor,
    currency: "cad", pricingVersion: version };
}
export const pricingSelect = {
  merchandiseSubtotalMinor: true, serviceFeeMinor: true, customerTotalMinor: true,
  merchantCommissionMinor: true, merchantNetMinor: true, currency: true, pricingVersion: true,
} as const;
