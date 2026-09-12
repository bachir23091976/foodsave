"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Navbar from "../Navbar";
import publicStyles from "../public.module.css";
import s from "./merchant.module.css";

const links = [
  ["/merchant/profile", "Vue d’ensemble", "01"],
  ["/merchant/new-offer", "Créer une offre", "+"],
  ["/merchant/offers", "Mes offres", "02"],
  ["/merchant/reservations", "Réservations", "03"],
  ["/merchant/sales", "Mes ventes", "04"],
];

export default function MerchantShell({ title, description, action, children }: {
  title: string; description: string; action?: ReactNode; children: ReactNode;
}) {
  const pathname = usePathname();
  return <main className={`${publicStyles.page} ${s.workspace}`}>
    <Navbar />
    <div className={s.frame}>
      <aside className={s.sidebar}>
        <p className={s.workspaceLabel}>Espace commerçant</p>
        <nav className={s.navigation} aria-label="Navigation commerçant">
          {links.map(([href, label, icon]) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>
            <span aria-hidden="true">{icon}</span>{label}
          </Link>)}
        </nav>
        <div className={s.sidebarNote}><p>Une question ?</p><a href="mailto:info@foodsave.ca">info@foodsave.ca</a></div>
      </aside>
      <div className={s.content}>
        <header className={s.header}>
          <div><p className={s.workspaceLabel}>FoodSave · Ottawa</p><h1>{title}</h1><p className={s.description}>{description}</p></div>
          {action && <div className={s.headerAction}>{action}</div>}
        </header>
        {children}
        <footer className={s.footer}><span>FoodSave · Espace commerçant</span><Link href="/offers">Voir la marketplace ↗</Link></footer>
      </div>
    </div>
  </main>;
}
