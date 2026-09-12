import type { ReactNode } from "react";
import Link from "next/link";
import Navbar from "./Navbar";
import Footer from "./Footer";
import PublicArt from "./PublicArt";
import s from "./public.module.css";

export default function AuthShell({ title, subtitle, merchant = false, children }: {
  title: string; subtitle: string; merchant?: boolean; children: ReactNode;
}) {
  return <main className={s.page}>
    <Navbar />
    <div className={s.auth}>
      <aside className={s.authAside}>
        <div><p className={s.eyebrow}>{merchant ? "L’espace des commerces locaux" : "Les bonnes habitudes commencent ici"}</p>
          <h2 className={s.heading}>{merchant ? "Une nouvelle vie pour vos invendus." : "De bons repas. Un petit prix. Un geste utile."}</h2>
        </div>
        <PublicArt />
        <p className={s.muted}>{merchant ? "Créez votre compte, puis complétez votre profil et la configuration de vos paiements." : "Découvrez les offres des commerces d’Ottawa et récupérez votre réservation sur place."}</p>
      </aside>
      <section className={s.authForm}>
        <h1>{title}</h1><p className={s.muted} style={{ marginTop: 12 }}>{subtitle}</p>
        {children}
        <p className={s.authFooter}><Link href="/offers">Explorer les offres sans se connecter →</Link></p>
      </section>
    </div>
    <Footer />
  </main>;
}

export function FutureSocialSignIn() {
  return <div className={s.social}>
    <p className={s.separator}>ou</p>
    <button type="button" className={s.secondary} disabled>Continuer avec Google — à venir</button>
    <button type="button" className={s.secondary} disabled>Continuer avec Apple — à venir</button>
    <small>Ces options ne sont pas encore disponibles. Utilisez votre courriel.</small>
  </div>;
}
