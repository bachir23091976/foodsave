"use client";
import { useLocale } from "../../lib/i18n/LocaleProvider";


import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Navbar from "../Navbar";
import publicStyles from "../public.module.css";
import s from "./merchant.module.css";

const links = [
  ["/merchant/profile", "ui.overview", "01"],
  ["/merchant/new-offer", "ui.create_an_offer", "+"],
  ["/merchant/offers", "ui.my_offers", "02"],
  ["/merchant/reservations", "ui.reservations", "03"],
  ["/merchant/sales", "ui.my_sales", "04"],
];

export default function MerchantShell({ title, description, action, children }: {
  title: string; description: string; action?: ReactNode; children: ReactNode;
}) {
  const { t, text: tr } = useLocale();
  const pathname = usePathname();
  return <main className={`${publicStyles.page} ${s.workspace}`}>
    <Navbar />
    <div className={s.frame}>
      <aside className={s.sidebar}>
        <p className={s.workspaceLabel}>{t("ui.merchant_workspace")}</p>
        <nav className={s.navigation} aria-label={t("ui.merchant_navigation")}>
          {links.map(([href, label, icon]) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>
            <span aria-hidden="true">{icon}</span>{tr(label)}
          </Link>)}
        </nav>
        <div className={s.sidebarNote}><p>{t("ui.need_help")}</p><a href="mailto:info@foodsave.ca">info@foodsave.ca</a></div>
      </aside>
      <div className={s.content}>
        <header className={s.header}>
          <div><p className={s.workspaceLabel}>{t("ui.foodsave_ottawa")}</p><h1>{tr(title)}</h1><p className={s.description}>{tr(description)}</p></div>
          {action && <div className={s.headerAction}>{action}</div>}
        </header>
        {children}
        <footer className={s.footer}><span>{t("ui.foodsave_merchant_workspace")}</span><Link href="/offers">{t("ui.view_the_marketplace_")}</Link></footer>
      </div>
    </div>
  </main>;
}
