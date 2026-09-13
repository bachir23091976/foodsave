"use client";
import { useLocale } from "../lib/i18n/LocaleProvider";
import type { ReactNode } from "react";
import Link from "next/link";
import Navbar from "./Navbar";
import Footer from "./Footer";
import EditorialVisual from "./EditorialVisual";
import s from "./public.module.css";

export default function AuthShell({ title, subtitle, merchant = false, children }: {
  title: string; subtitle: string; merchant?: boolean; children: ReactNode;
}) {
  const { t, text: tr } = useLocale();
  return <main className={s.page}>
    <Navbar />
    <div className={s.auth}>
      <aside className={s.authAside}>
        <div><p className={s.eyebrow}>{merchant ? t("ui.a_space_for_local_businesses") : t("ui.good_habits_start_here")}</p>
          <h2 className={s.heading}>{merchant ? t("ui.give_your_surplus_a_second_chance") : t("ui.good_food_small_prices_a_positive_step")}</h2>
        </div>
        <EditorialVisual merchant={merchant} compact />
        <p className={s.muted}>{merchant ? t("ui.create_your_account_then_complete_your_profile_and_payment") : t("ui.explore_offers_from_ottawa_businesses_and_pick_up_your")}</p>
      </aside>
      <section className={s.authForm}>
        <h1>{tr(title)}</h1><p className={s.muted} style={{ marginTop: 12 }}>{subtitle}</p>
        {children}
        <p className={s.authFooter}><Link href="/offers">{t("ui.explore_offers_without_signing_in_")}</Link></p>
      </section>
    </div>
    <Footer />
  </main>;
}

export function FutureSocialSignIn() {
  const { t, text: tr } = useLocale();
  return <div className={s.social}>
    <p className={s.separator}>{t("ui.or")}</p>
    <button type="button" className={s.secondary} disabled>{t("ui.continue_with_google_coming_soon")}</button>
    <button type="button" className={s.secondary} disabled>{t("ui.continue_with_apple_coming_soon")}</button>
    <small>{t("ui.these_options_are_not_available_yet_please_use_your")}</small>
  </div>;
}
