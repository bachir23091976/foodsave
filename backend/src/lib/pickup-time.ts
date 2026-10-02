// UTC ISO only: never interpret a timezone-free value in the server timezone.
export function parsePickupInstant(value: unknown): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return new Date(NaN);
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value ? date : new Date(NaN);
}
