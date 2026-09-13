import Link from "next/link";
import s from "./public.module.css";

export default function Footer() {
  return <footer id="contact" className={s.footer}>
    <div className={s.container}>
      <div className={s.footerGrid}>
        <div><Link href="/" className={s.logo} aria-label="FoodSave — Accueil"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path d="M5 18C2 9 9 4 20 3c1 11-4 18-13 16M4 21 15 10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg><span className={s.logoName}><span>Food</span><span className={s.logoSave}>Save</span></span></Link><p>Marketplace anti-gaspillage alimentaire à Ottawa.<br />Sauvez de la nourriture, économisez de l’argent.</p></div>
        <div><h2>Navigation</h2><div className={s.footerLinks}><Link href="/">Accueil</Link><Link href="/offers">Offres</Link><Link href="/partner">Devenir partenaire</Link></div></div>
        <div><h2>Contact</h2><div className={s.footerLinks}><span>Ottawa, Ontario</span><a href="mailto:info@foodsave.ca">info@foodsave.ca</a></div></div>
        <div><h2>Informations légales</h2><div className={s.footerLinks}><span>Conditions d’utilisation</span><span>Politique de confidentialité</span><small>Documents à venir.</small></div></div>
      </div>
      <div className={s.footerBottom}><span>FoodSave · Ottawa, Canada</span><span>De bons repas, une seconde chance.</span></div>
    </div>
  </footer>;
}
