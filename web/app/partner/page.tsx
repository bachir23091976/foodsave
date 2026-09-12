import Link from "next/link";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import s from "../components/public.module.css";

export default function PartnerPage() {
  return <main className={s.page}>
    <Navbar />
    <div className={s.partnerHero}><section className={s.container + " " + s.hero}>
      <div><p className={s.eyebrow}>Pour les commerces d’Ottawa</p><h1 className={s.title}>Vos invendus.<br /><em>De nouvelles possibilités.</em></h1><p className={s.lede}>Transformez vos invendus en revenus et faites découvrir votre commerce à des clients près de chez vous.</p><div className={s.actions}><Link href="/register-merchant" className={s.button}>Inscrire mon commerce ↗</Link><a href="#parcours-commercant" className={s.quiet}>Comment ça marche</a></div></div>
      <aside className={s.partnerBoard}><p className={s.eyebrow}>Un outil pour votre quotidien</p><h2>Du surplus en vitrine<br />à la récupération en boutique.</h2><ol><li>Présentez votre commerce</li><li>Publiez vos offres disponibles</li><li>Accueillez les clients</li></ol><p style={{ marginTop: 22, color: "#d2dfcc", fontSize: 13 }}>Restaurants · Boulangeries · Cafés · Épiceries</p></aside>
    </section></div>
    <section className={s.container + " " + s.section}><div className={s.sectionHead}><h2 className={s.heading}>Bon pour votre commerce.<br />Bon pour votre quartier.</h2></div><div className={s.grid3}>{[
      ["Attirez de nouveaux clients", "Rendez vos offres visibles auprès des personnes qui explorent les commerces locaux."],
      ["Réduisez le gaspillage", "Proposez vos produits encore disponibles à prix réduit plutôt que de les laisser se perdre."],
      ["Publiez simplement", "Présentez le contenu, le prix, la quantité et le créneau de récupération de votre offre."],
    ].map(([title,description]) => <article key={title} className={s.benefit}><h3>{title}</h3><p>{description}</p></article>)}</div></section>
    <section id="parcours-commercant" className={s.band} style={{ scrollMarginTop: 90 }}><div className={s.container + " " + s.section}><p className={s.eyebrow}>Votre parcours partenaire</p><h2 className={s.heading}>Vous gardez la main sur vos offres.</h2><div className={s.grid3}>{[
      ["01", "Préparez votre compte", "Créez votre compte commerçant, complétez votre profil et configurez vos paiements."],
      ["02", "Publiez vos invendus", "Ajoutez votre offre. Les clients consultent les informations, puis réservent et paient en ligne."],
      ["03", "Validez la récupération", "À l’arrivée du client, scannez son QR ou saisissez son code pour valider la récupération."],
    ].map(([n,title,description]) => <article key={n} className={s.step}><span className={s.number}>{n}</span><h3>{title}</h3><p>{description}</p></article>)}</div></div></section>
    <section className={s.container + " " + s.promise}><div><p className={s.eyebrow}>Des paiements, en toute simplicité</p><h2 className={s.heading}>Paiements sécurisés avec Stripe.</h2></div><div><p className={s.muted}>Stripe est notre partenaire de paiement. Il sécurise les paiements des clients et permet le versement de vos revenus sur votre compte bancaire.</p><p className={s.muted} style={{ marginTop: 16 }}>La configuration et la vérification de votre compte doivent être terminées. Les versements restent soumis à l’admissibilité et au calendrier applicables.</p><Link href="/merchant/profile" className={s.quiet}>Configurer mes paiements →</Link></div></section>
    <section className={s.container + " " + s.section}><div className={s.faq}><h2 className={s.heading}>Avant de vous lancer</h2><details><summary>Quelles informations dois-je préparer ?</summary><p>Le nom et les coordonnées de votre commerce, sa présentation, puis les informations nécessaires à la configuration de vos paiements.</p></details><details><summary>Comment le client récupère-t-il sa réservation ?</summary><p>Il se présente au commerce dans le créneau indiqué avec son QR ou son code de réservation. Vous validez la récupération depuis votre espace commerçant.</p></details><details><summary>Une question sur FoodSave ?</summary><p>Écrivez-nous à <a href="mailto:info@foodsave.ca">info@foodsave.ca</a>.</p></details></div></section>
    <section className={s.container + " " + s.section}><div className={s.merchantCta}><div><h2 className={s.heading}>Prêt à donner une seconde<br />chance à vos invendus ?</h2><p>Votre prochaine étape : créer votre compte commerçant.</p></div><Link href="/register-merchant" className={s.button}>Devenir partenaire ↗</Link></div></section>
    <Footer />
  </main>;
}
