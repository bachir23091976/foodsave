"use client";
import { useState } from 'react';
import { API_URL } from '../lib/api';
import { useLocale } from '../lib/i18n/LocaleProvider';
import s from './public.module.css';

export default function GoogleSignInButton() {
  const { t, message, locale } = useLocale();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function start() {
    setBusy(true); setError('');
    try {
      const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      const verifier = encode(crypto.getRandomValues(new Uint8Array(32)));
      const challenge = encode(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
      sessionStorage.setItem('foodsave_google_verifier',verifier);
      const response = await fetch(`${API_URL}/auth/google/start`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ challenge, locale }) });
      const data = await response.json();
      if (!response.ok) { setError(data.message || 'auth.googleUnavailable'); setBusy(false); return; }
      const url = new URL(data.url), api = new URL(API_URL);
      if (url.origin !== api.origin || url.pathname !== '/auth/google/authorize') throw new Error();
      window.location.assign(url.href);
    } catch { sessionStorage.removeItem('foodsave_google_verifier'); setError('auth.googleUnavailable'); setBusy(false); }
  }
  return <><button type="button" className={s.secondary} disabled={busy} onClick={start}>{t(busy ? 'auth.googleLoading' : 'auth.googleContinue')}</button>
    {error && <p role="alert" className={s.alert}>{message(error)}</p>}</>;
}
