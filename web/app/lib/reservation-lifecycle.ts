type Reservation = { status: string; noShowEligibleAt?: string | null; offer: { pickupStart?: string; pickupEnd: string } };
export function reservationPhase(order: Reservation, now = Date.now()) {
  if (order.status !== "CONFIRMED") return "history";
  const end = Date.parse(order.offer.pickupEnd);
  const deadline = order.noShowEligibleAt ? Date.parse(order.noShowEligibleAt) : end;
  if (now > deadline) return "review"; // Not NO_SHOW until the server says so.
  if (now > end) return "grace";
  return "active";
}
export function canValidatePickup(order: Reservation, now = Date.now()) {
  return order.status === "CONFIRMED" && !!order.offer.pickupStart && now >= Date.parse(order.offer.pickupStart)
    && reservationPhase(order, now) !== "review";
}
