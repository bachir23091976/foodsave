"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode, type FormEvent } from 'react';
import { canadianLocale, formatMoney, formatNumber, isMessageKey, localeCookie, plural, translate, type Locale } from './core';
import type { MessageKey } from './dictionary';
import { safeMessageKey } from './messages';

export function localeTools(locale: Locale) {
  return {
    locale, intlLocale: canadianLocale(locale),
    t: (key: MessageKey, values?: Record<string, string | number>) => translate(locale, key, values),
    text: (key: string | number) => isMessageKey(key) ? translate(locale, key) : String(key),
    message: (value: unknown) => translate(locale, safeMessageKey(value)),
    money: (value: number) => formatMoney(locale, value),
    number: (value: number, digits?: number) => formatNumber(locale, value, digits),
    count: (one: MessageKey, many: MessageKey, value: number) => plural(locale, one, many, value),
  };
}
const Context = createContext({ ...localeTools('fr'), setLocale: (_locale: Locale) => {} });

export function LocaleProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const [locale, setLocaleState] = useState(initialLocale);
  const value = useMemo(() => ({ ...localeTools(locale), setLocale: (next: Locale) => {
    setLocaleState(next);
    document.cookie = localeCookie(next, location.protocol === 'https:');
  } }), [locale]);
  useEffect(() => {
    document.documentElement.lang = canadianLocale(locale);
    document.title = translate(locale, 'metadata.title');
    document.querySelector('meta[name="description"]')?.setAttribute('content', translate(locale, 'metadata.description'));
    document.querySelectorAll('input, textarea, select').forEach(input => {
      if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || input instanceof HTMLSelectElement) input.setCustomValidity('');
    });
  }, [locale]);

  const validate = (event: FormEvent) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || input instanceof HTMLSelectElement)) return;
    input.setCustomValidity('');
    const v = input.validity;
    if (v.valid) return;
    let key: MessageKey = 'validation.invalid';
    let limit = '';
    if (v.valueMissing) key = 'validation.required';
    else if (v.typeMismatch) key = 'validation.email';
    else if (v.rangeUnderflow) { key = 'validation.min'; limit = input.getAttribute('min') || ''; }
    else if (v.rangeOverflow) { key = 'validation.max'; limit = input.getAttribute('max') || ''; }
    else if (v.tooShort) { key = 'validation.length'; limit = input.getAttribute('minlength') || ''; }
    input.setCustomValidity(value.t(key, { value: limit }));
  };
  return <Context.Provider value={value}><div style={{ display: 'contents' }} onInvalidCapture={validate} onInputCapture={event => {
    const input = event.target;
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || input instanceof HTMLSelectElement) input.setCustomValidity('');
  }}>{children}</div></Context.Provider>;
}
export function useLocale() { return useContext(Context); }
