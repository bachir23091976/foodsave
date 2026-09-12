import Link from "next/link";
import s from "./public.module.css";

export default function Footer() {
  return <footer id="contact" className={s.footer}>
    <div className={s.container}>
      <div className={s.footerGrid}>
        <div><Link href="/" className={s.logo}>FoodSave<span aria-hidden="true" style={{ color: "#6b8b43" }}>↗</span></Link><p>Marketplace anti-gaspillage alimentaire à Ottawa.<br />Sauvez de la nourriture, économisez de l’argent.</p></div>
        <div><h2>Navigation</h2><div className={s.footerLinks}><Link href="/">Accueil</Link><Link href="/offers">Offres</Link><Link href="/partner">Devenir partenaire</Link></div></div>
        <div><h2>Contact</h2><div className={s.footerLinks}><span>Ottawa, Ontario</span><a href="mailto:info@foodsave.ca">info@foodsave.ca</a></div></div>
        <div><h2>Informations légales</h2><div className={s.footerLinks}><span>Conditions d’utilisation</span><span>Politique de confidentialité</span><small>Documents à venir.</small></div></div>
      </div>
      <div className={s.footerBottom}><span>FoodSave · Ottawa, Canada</span><span>De bons repas, une seconde chance.</span></div>
    </div>
  </footer>;
}
