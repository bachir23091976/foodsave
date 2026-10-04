import { currentPriceMinor } from "./dynamic-pricing";

// Explicit allowlists: private relations must never escape via object spreading.
export const customerMerchantSelect = { id: true, name: true, type: true, address: true, city: true, province: true,
  postalCode: true, latitude: true, longitude: true } as const;
export const customerOfferSelect = { id: true, title: true, description: true, category: true, imageUrl: true,
  originalPrice: true, quantity: true, pickupStart: true, pickupEnd: true, dietaryTags: true,
  createdAt: true, updatedAt: true, merchantId: true, merchant: { select: customerMerchantSelect } } as const;
export function publicOffer(offer: any, now: Date) {
  return { id: offer.id, title: offer.title, description: offer.description, category: offer.category,
    imageUrl: offer.imageUrl, originalPrice: offer.originalPrice,
    discountedPrice: offer.dynamicPricing?.enabled ? currentPriceMinor(offer, now) / 100 : offer.discountedPrice,
    dynamicPricingEnabled: !!offer.dynamicPricing?.enabled, quantity: offer.quantity,
    pickupStart: offer.pickupStart, pickupEnd: offer.pickupEnd, dietaryTags: offer.dietaryTags,
    createdAt: offer.createdAt, updatedAt: offer.updatedAt, merchantId: offer.merchantId,
    merchant: offer.merchant ? { id: offer.merchant.id, name: offer.merchant.name, type: offer.merchant.type, address: offer.merchant.address,
      city: offer.merchant.city, province: offer.merchant.province, postalCode: offer.merchant.postalCode,
      latitude: offer.merchant.latitude, longitude: offer.merchant.longitude } : undefined };
}
