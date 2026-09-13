"use client";
import Link from 'next/link';
import Navbar from './components/Navbar';
import { useLocale } from './lib/i18n/LocaleProvider';
import styles from './components/public.module.css';

export default function NotFound() {
  const { t } = useLocale();
  return <main className={styles.page}><Navbar /><section className={styles.container + ' ' + styles.section}>
    <h1 className={styles.heading}>{t('notFound.title')}</h1>
    <p className={styles.lede}>{t('notFound.description')}</p>
    <Link href="/offers" className={styles.button}>{t('ui.back_to_offers')}</Link>
  </section></main>;
}
