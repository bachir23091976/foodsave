export const PICKUP_TIME_ZONE = "America/Toronto";
const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: PICKUP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
function wallTime(date: Date): string {
  const p = Object.fromEntries(formatter.formatToParts(date).map(p => [p.type, p.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
// Intl supplies the zone offsets. Reject DST gaps/folds instead of guessing.
export function ottawaPickupInstant(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw Error("Invalid pickup time");
  const wall = Date.parse(value + ":00Z");
  if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 16) !== value) throw Error("Invalid pickup time");
  const offsets = new Set<number>();
  for (const hours of [-48, 0, 48]) {
    const probe = wall + hours * 3600000;
    offsets.add(Date.parse(wallTime(new Date(probe)) + ":00Z") - probe);
  }
  const matches = [...offsets].map(offset => new Date(wall - offset)).filter(date => wallTime(date) === value);
  if (matches.length !== 1) throw Error("Ambiguous or nonexistent pickup time");
  return matches[0].toISOString();
}
export function pickupWindow(start: string, end: string, now = Date.now()) {
  const pickupStart = ottawaPickupInstant(start), pickupEnd = ottawaPickupInstant(end);
  if (Date.parse(pickupStart) <= now || Date.parse(pickupEnd) <= Date.parse(pickupStart)) throw Error("Invalid pickup window");
  return { pickupStart, pickupEnd };
}
