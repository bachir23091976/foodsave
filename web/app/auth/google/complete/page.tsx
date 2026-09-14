"use client";
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { API_URL } from '../../../lib/api';
import { useLocale } from '../../../lib/i18n/LocaleProvider';
import AuthShell from '../../../components/AuthShell';

export default function GoogleCompletePage() {
  const { t, message, setLocale } = useLocale();
  const started = useRef(false), [error, setError] = useState('');
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    async function complete() {
      try {
        const handoff = new URLSearchParams(window.location.hash.slice(1)).get('handoff');
        window.history.replaceState(null,'','/auth/google/complete');
        const verifier = sessionStorage.getItem('foodsave_google_verifier');
        sessionStorage.removeItem('foodsave_google_verifier');
        if (!handoff || !verifier) { setError('auth.googleInvalid'); return; }
        const response = await fetch(`${API_URL}/auth/google/complete`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ handoff, verifier }) });
        const data = await response.json();
        if (data.locale === 'fr' || data.locale === 'en') setLocale(data.locale);
        if (!response.ok || typeof data.token !== 'string') { setError(data.message || 'auth.googleUnavailable'); return; }
        localStorage.setItem('token',data.token);
        window.location.replace('/offers');
      } catch { setError('auth.googleUnavailable'); }
    }
    void complete();
  }, [setLocale]);
  return <AuthShell title={t('auth.googleContinue')} subtitle={t('auth.googleLoading')}>
    {error ? <><p role="alert">{message(error)}</p><Link href="/login">{t('ui.sign_in')}</Link></> : <p role="status">{t('auth.googleLoading')}</p>}
  </AuthShell>;
}
