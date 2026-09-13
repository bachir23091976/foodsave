"use client";
import { useLocale } from './LocaleProvider';
import styles from '../../components/public.module.css';

export default function LanguageSelector() {
  const { locale, setLocale, t } = useLocale();
  return <div className={styles.languageSelector} role="group" aria-label={t('common.language')}>
    <button type="button" lang="fr" aria-label="Français" aria-pressed={locale === 'fr'} onClick={() => setLocale('fr')}>FR</button>
    <span aria-hidden="true">|</span>
    <button type="button" lang="en" aria-label="English" aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>EN</button>
  </div>;
}
