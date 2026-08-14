"use client";

import Link from "next/link";
import { Bebas_Neue, Space_Grotesk } from "next/font/google";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import FoodSaveImage from "../components/FoodSaveImage";

const display = Bebas_Neue({ subsets: ["latin"], weight: "400" });
const body = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });

const bg = "#06110C";
const amber = "#FFB100";
const jade = "#17C989";
const dim = "#8FA396";

export default function PartnerPage() {
  return (
    <main className={body.className} style={{ backgroundColor: bg, color: "#F5F1E8" }}>
      <style>{`
        .benefit-card { transition: transform 0.3s ease, box-shadow 0.3s ease; }
        .benefit-card:hover { transform: translateY(-6px); box-shadow: 0 18px 45px rgba(0,0,0,0.35); }
        .btn-primary { transition: transform 0.2s ease; }
        .btn-primary:hover { transform: scale(1.04); }
      `}</style>

      <Navbar />

      <section className="relative overflow-hidden px-6 pt-16 pb-16 max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-center">
        <div>
          <p className="text-xs tracking-[0.4em] uppercase mb-6" style={{ color: amber }}>
            Pour les commerces d Ottawa
          </p>
          <h1 className={display.className} style={{ fontSize: "clamp(2.4rem, 6vw, 4.5rem)", lineHeight: 1 }}>
            TRANSFORMEZ VOS SURPLUS
            <br />
            <span style={{ color: jade }}>EN OPPORTUNITES</span>
          </h1>
          <p className="max-w-md mt-6 text-lg" style={{ color: dim }}>
            FoodSave aide les restaurants, cafes, boulangeries et commerces locaux a reduire
            leurs pertes, recuperer des revenus et attirer de nouveaux clients.
          </p>
          <div className="mt-8">
            <Link href="/register-merchant" className="btn-primary inline-block px-10 py-4 rounded-full font-bold uppercase tracking-wide text-sm" style={{ backgroundColor: jade, color: bg }}>
              Devenir partenaire
            </Link>
          </div>
        </div>

        <FoodSaveImage url={null} alt="Commerce partenaire FoodSave" variant="hero" merchantType={null} className="rounded-2xl" />
      </section>

      <section className="px-6 py-20 max-w-5xl mx-auto grid md:grid-cols-2 gap-6">
        {[
          ["Reduisez le gaspillage", "Donnez une deuxieme chance a vos surplus alimentaires plutot que de les jeter."],
          ["Recuperez des revenus", "Transformez vos invendus en revenus supplementaires, 85% pour vous, sans frais fixe."],
          ["Faites decouvrir votre commerce", "Attirez de nouveaux clients locaux qui decouvrent votre commerce via FoodSave."],
          ["Aidez votre communaute", "Participez a une initiative locale contre le gaspillage alimentaire a Ottawa."],
        ].map(([title, text]) => (
          <div key={title} className="benefit-card rounded-2xl p-8" style={{ backgroundColor: "#0D1912", border: "1px solid rgba(255,255,255,0.1)" }}>
            <p className="font-bold text-xl mb-2" style={{ color: amber }}>{title}</p>
            <p style={{ color: dim }}>{text}</p>
          </div>
        ))}
      </section>

      <section className="px-6 py-20 max-w-4xl mx-auto">
        <h2 className={display.className} style={{ fontSize: "clamp(2rem, 5vw, 3rem)", color: jade, textAlign: "center", marginBottom: "3rem" }}>
          COMMENT CA MARCHE POUR VOUS
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            ["1", "Inscrivez votre commerce", "Creez votre profil commerce en quelques minutes, sans frais d inscription."],
            ["2", "Publiez vos invendus", "Ajoutez une offre avec photo en quelques clics des que vous avez du surplus."],
            ["3", "Recevez vos paiements", "Les clients reservent et paient en ligne, vous recevez vos fonds automatiquement."],
          ].map(([n, title, text]) => (
            <div key={n} className="text-center">
              <div className="mx-auto mb-4 w-14 h-14 rounded-full flex items-center justify-center font-bold" style={{ backgroundColor: "#06110C", border: "1px solid rgba(23,201,137,0.4)", color: jade }}>
                {n}
              </div>
              <p className="font-bold text-lg mb-1">{title}</p>
              <p style={{ color: dim }}>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 py-20 text-center" style={{ backgroundColor: "#0D1912" }}>
        <p className={display.className} style={{ fontSize: "clamp(1.8rem, 4vw, 2.6rem)" }}>
          PRET A REDUIRE VOTRE GASPILLAGE ?
        </p>
        <div className="mt-8">
          <Link href="/register-merchant" className="btn-primary inline-block px-10 py-4 rounded-full font-bold uppercase tracking-wide text-sm" style={{ backgroundColor: amber, color: bg }}>
            Devenir partenaire des maintenant
          </Link>
        </div>
      </section>

      <Footer />
    </main>
  );
}
