"use client";
import { useLocale } from "../lib/i18n/LocaleProvider";
import Link from "next/link";
import s from "./public.module.css";

export default function Footer() {
  const { t } = useLocale();
  return <footer id="contact" className={s.footer}>
    <div className={s.container}>
      <div className={s.footerGrid}>
        <div><Link href="/" className={s.logo} aria-label={t("ui.foodsave_home")}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path d="M5 18C2 9 9 4 20 3c1 11-4 18-13 16M4 21 15 10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg><span className={s.logoName}><span>Food</span><span className={s.logoSave}>Save</span></span></Link><p>{t("ui.ottawas_food_waste_reduction_marketplace")}<br />{t("ui.save_food_and_save_money")}</p></div>
        <div><h2>{t("ui.navigation")}</h2><div className={s.footerLinks}><Link href="/">{t("ui.home")}</Link><Link href="/offers">{t("ui.offers")}</Link><Link href="/partner">{t("ui.become_a_partner")}</Link></div></div>
        <div><h2>{t("ui.contact")}</h2><div className={s.footerLinks}><span>{t("ui.ottawa_ontario")}</span><a href="mailto:info@foodsave.ca">info@foodsave.ca</a></div></div>
        <div><h2>{t("ui.legal_information")}</h2><div className={s.footerLinks}><span>{t("ui.terms_of_use")}</span><span>{t("ui.privacy_policy")}</span><small>{t("ui.documents_coming_soon")}</small></div></div>
      </div>
      <div className={s.footerBottom}><span>{t("ui.foodsave_ottawa_canada")}</span><span>{t("ui.good_food_deserves_a_second_chance")}</span></div>
    </div>
  </footer>;
}
