"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import FoodSaveImage from "./components/FoodSaveImage";
import PublicArt from "./components/PublicArt";
import s from "./components/public.module.css";
import { API_URL } from "./lib/api";

interface Offer {
  id: string; title: string; imageUrl: string | null; originalPrice: number; discountedPrice: number;
  merchant: { name: string; city: string; type?: string };
}

export default function Home() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    fetch(API_URL + "/offers")
      .then((res) => { if (!res.ok) throw new Error("Offers unavailable"); return res.json(); })
      .then((data) => setOffers((data.offers || []).slice(0, 3)))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  return <main className={s.page}>
    <Navbar />
    <section className={s.container + " " + s.hero}>
      <div>
        <p className={s.eyebrow}>Moins de gaspillage. Plus de goût. · Ottawa</p>
        <h1 className={s.title}>Sauvez de bons repas.<br /><em>Payez moins.</em></h1>
        <p className={s.lede}>Découvrez les invendus de commerces près de chez vous à prix réduit.</p>
        <div className={s.actions}><Link href="/offers" className={s.button}>Voir les offres près de chez moi <span aria-hidden="true">↗</span></Link></div>
        <p className={s.note}>Des commerces locaux. Une récupération sur place. Un geste qui compte.</p>
      </div>
      <div className={s.art}><PublicArt /><p className={s.artCaption}>LE BON GOÛT DE NE RIEN GASPILLER</p></div>
    </section>

    <section id="comment-ca-marche" className={s.band} style={{ scrollMarginTop: 90 }}>
      <div className={s.container + " " + s.section}>
        <div className={s.sectionHead}><div><p className={s.eyebrow}>Simple, du début à la faim</p><h2 className={s.heading}>Comment ça marche</h2></div><p className={s.muted}>Trois étapes. Une bonne habitude.</p></div>
        <div className={s.grid3}>
          {[
            ["01", "Découvrez", "Explorez les offres et consultez le contenu, le prix et l’horaire de récupération."],
            ["02", "Réservez", "Choisissez votre offre, connectez-vous et payez en ligne pour la réserver."],
            ["03", "Récupérez", "Une fois la réservation confirmée, présentez votre QR ou votre code au commerce pendant le créneau indiqué."],
          ].map(([n,title,description]) => <article className={s.step} key={n}><span className={s.number}>{n}</span><h3>{title}</h3><p>{description}</p></article>)}
        </div>
      </div>
    </section>

    <section className={s.container + " " + s.promise}>
      <div><p className={s.eyebrow}>La différence FoodSave</p><h2 className={s.heading}>Pas de mauvaises surprises.</h2><p className={s.lede}>Votre prochain repas mérite mieux qu’un point d’interrogation.</p></div>
      <ul className={s.checklist}><li>Consultez les informations de l’offre avant de payer.</li><li>Comparez le prix initial et le prix réduit.</li><li>Vérifiez le commerce et votre créneau de récupération.</li></ul>
    </section>

    <section className={s.container + " " + s.section}>
      <div className={s.sectionHead}><div><p className={s.eyebrow}>Les découvertes du quartier</p><h2 className={s.heading}>Ce soir près de chez vous</h2></div><Link href="/offers" className={s.quiet}>Toutes les offres →</Link></div>
      {loading && <p role="status" className={s.empty}>Nous recherchons les offres disponibles…</p>}
      {error && <p role="alert" className={s.alert}>Les offres sont momentanément indisponibles. Retrouvez-les sur la page Offres.</p>}
      {!loading && !error && offers.length === 0 && <div className={s.empty}><h3>Les bonnes découvertes se renouvellent.</h3><p>Aucune offre pour le moment. De nouvelles offres peuvent apparaître au cours de la journée.</p></div>}
      <div className={s.offerGrid}>{offers.map((offer) => <article key={offer.id} className={s.card}>
        <FoodSaveImage url={offer.imageUrl} alt={offer.title} variant="offer" merchantType={offer.merchant.type} />
        <div className={s.cardBody}><h3>{offer.title}</h3><p className={s.merchant}>{offer.merchant.name} · {offer.merchant.city}</p><p className={s.price}><strong>{offer.discountedPrice.toFixed(2)} $</strong><del>{offer.originalPrice.toFixed(2)} $</del></p><Link href="/offers" className={s.secondary}>Explorer les offres →</Link></div>
      </article>)}</div>
    </section>

    <section className={s.container + " " + s.section} aria-label="Les avantages FoodSave">
      <div className={s.grid3}>{[
        ["Économisez", "De bons produits à prix réduit, pour faire plaisir à votre budget."],
        ["Soutenez les commerces locaux", "Découvrez les commerces qui font vivre votre quartier."],
        ["Réduisez le gaspillage", "Donnez une nouvelle place aux invendus : dans votre assiette."],
      ].map(([title,description]) => <article key={title} className={s.benefit}><h3>{title}</h3><p>{description}</p></article>)}</div>
    </section>
    <section className={s.container + " " + s.section}><div className={s.merchantCta}><div><h2 className={s.heading}>Vos invendus peuvent encore<br />avoir de la valeur.</h2><p>Faites découvrir votre commerce à de nouveaux clients d’Ottawa.</p></div><Link href="/partner" className={s.button}>Devenir partenaire ↗</Link></div></section>
    <div className={s.container + " " + s.trust}><span>↗ Ottawa, Canada</span><span>✓ Prix et créneaux affichés avant réservation</span><span>✉ <a href="mailto:info@foodsave.ca">info@foodsave.ca</a></span></div>
    <Footer />
  </main>;
}
