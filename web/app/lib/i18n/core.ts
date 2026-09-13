import { en, fr, type MessageKey } from './dictionary';

export type Locale = 'fr' | 'en';
export const LOCALE_COOKIE = 'foodsave_locale';
export function resolveLocale(saved?: string, languages?: string | null): Locale {
  if (saved === 'fr' || saved === 'en') return saved;
  const primary = (languages || '').split(',')[0].split(';')[0].trim().toLowerCase().split('-')[0];
  return primary === 'en' ? 'en' : 'fr';
}
export function localeCookie(locale: Locale, secure = false) {
  return `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${secure ? '; Secure' : ''}`;
}
export function translate(locale: Locale, key: MessageKey, values: Record<string, string | number> = {}) {
  return (locale === 'en' ? en[key] : fr[key]).replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`));
}
export function isMessageKey(value: unknown): value is MessageKey {
  return typeof value === 'string' && Object.hasOwn(fr, value);
}
export function canadianLocale(locale: Locale) { return locale === 'en' ? 'en-CA' : 'fr-CA'; }
export function formatMoney(locale: Locale, value: number) {
  return new Intl.NumberFormat(canadianLocale(locale), { style: 'currency', currency: 'CAD' }).format(value);
}
export function formatNumber(locale: Locale, value: number, digits?: number) {
  return new Intl.NumberFormat(canadianLocale(locale), digits === undefined ? {} : { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}
export function plural(locale: Locale, key: MessageKey, many: MessageKey, count: number) {
  return translate(locale, new Intl.PluralRules(canadianLocale(locale)).select(count) === 'one' ? key : many, { count: formatNumber(locale, count) });
}
