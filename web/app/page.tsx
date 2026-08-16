"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bebas_Neue, Space_Grotesk } from "next/font/google";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import FoodSaveImage from "./components/FoodSaveImage";
import { API_URL } from "./lib/api";

const display = Bebas_Neue({ subsets: ["latin"], weight: "400" });
const body = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });

const bg = "#06110C";
const amber = "#FFB100";
const jade = "#17C989";
const dim = "#8FA396";

const commercesCount = 12;
const repasCount = 480;
const usersCount = 350;
const kgCount = 620;

interface Offer {
  id: string;
  title: string;
  imageUrl: string | null;
  originalPrice: number;
  discountedPrice: number;
  merchant: { name: string; city: string; type?: string };
}

export default function Home() {
  const [offers, setOffers] = useState<Offer[]>([]);

  useEffect(() => {
    fetch(`${API_URL}/offers`)
      .then((res) => res.json())
      .then((data) => setOffers((data.offers || []).slice(0, 3)))
      .catch(() => {});
  }, []);

  return (
    <main className={body.className} style={{ backgroundColor: bg, color: "#F5F1E8" }}>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .reveal { opacity: 0; animation: fadeUp 0.7s ease forwards; }
        .card-hover { transition: transform 0.3s ease, box-shadow 0.3s ease; }
        .card-hover:hover { transform: translateY(-6px); box-shadow: 0 18px 45px rgba(0,0,0,0.35); }
        .btn-primary { transition: transform 0.2s ease; }
        .btn-primary:hover { transform: scale(1.04); }
      `}</style>

      <Navbar />

      <section className="relative overflow-hidden px-6 pt-20 pb-16 text-center">
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(circle at 20% 20%, rgba(255,177,0,0.12), transparent 40%), radial-gradient(circle at 80% 30%, rgba(23,201,137,0.12), transparent 40%)" }}
        />
        <p className="reveal relative text-xs tracking-[0.4em] uppercase mb-6" style={{ color: jade }}>
          Ottawa - Reseau de sauvetage alimentaire
        </p>
        <h1 className={display.className + " reveal relative"} style={{ fontSize: "clamp(2.8rem, 8vw, 7rem)", lineHeight: 0.95 }}>
          NE LAISSEZ RIEN
          <br />
          <span style={{ color: amber }}>SE PERDRE</span>
        </h1>
        <p className="reveal relative max-w-2xl mx-auto mt-8 text-lg" style={{ color: dim, animationDelay: "0.15s" }}>
          FoodSave permet aux habitants d Ottawa de recuperer de la bonne nourriture invendue
          aupres des commerces locaux, a prix reduit, au lieu qu elle soit gaspillee.
        </p>
        <div className="reveal relative flex flex-wrap justify-center gap-4 mt-10" style={{ animationDelay: "0.3s" }}>
          <Link href="/offers" className="btn-primary px-9 py-4 rounded-full font-bold uppercase tracking-wide text-sm" style={{ backgroundColor: amber, color: bg }}>
            Voir les offres pres de moi
          </Link>
          <Link href="/register-merchant" className="btn-primary px-8 py-4 rounded-full font-bold uppercase tracking-wide text-sm border" style={{ borderColor: jade, color: jade }}>
            Devenir partenaire
          </Link>
        </div>
      </section>

      <section className="px-6 py-14 grid grid-cols-2 md:grid-cols-4 gap-8 text-center border-y" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <div>
          <p className={display.className} style={{ fontSize: "2.5rem", color: amber }}>{commercesCount}+</p>
          <p className="text-xs" style={{ color: dim }}>Commerces partenaires</p>
        </div>
        <div>
          <p className={display.className} style={{ fontSize: "2.5rem", color: jade }}>{repasCount}+</p>
          <p className="text-xs" style={{ color: dim }}>Repas sauves</p>
        </div>
        <div>
          <p className={display.className} style={{ fontSize: "2.5rem", color: amber }}>{usersCount}+</p>
          <p className="text-xs" style={{ color: dim }}>Utilisateurs actifs</p>
        </div>
        <div>
          <p className={display.className} style={{ fontSize: "2.5rem", color: jade }}>{kgCount}kg</p>
          <p className="text-xs" style={{ color: dim }}>Nourriture sauvee</p>
        </div>
      </section>

      <section id="comment-ca-marche" className="px-6 py-24 max-w-4xl mx-auto">
        <h2 className={display.className} style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", color: amber, textAlign: "center", marginBottom: "3rem" }}>
          COMMENT CA MARCHE
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            ["1", "Trouvez", "Decouvrez les offres alimentaires disponibles pres de vous."],
            ["2", "Reservez", "Choisissez une offre et reservez-la facilement en ligne."],
            ["3", "Sauvez", "Recuperez votre commande et participez a la reduction du gaspillage."],
          ].map(([n, title, text]) => (
            <div key={n} className="text-center">
              <div className="mx-auto mb-4 w-14 h-14 rounded-full flex items-center justify-center font-bold" style={{ backgroundColor: "#0D1912", border: "1px solid rgba(255,177,0,0.4)", color: amber }}>
                {n}
              </div>
              <p className="font-bold text-lg mb-1">{title}</p>
              <p style={{ color: dim }}>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 py-24 max-w-6xl mx-auto">
        <h2 className={display.className} style={{ fontSize: "clamp(2rem, 5vw, 3rem)", color: jade, textAlign: "center", marginBottom: "3rem" }}>
          DES OFFRES PRES DE CHEZ VOUS
        </h2>
        {offers.length === 0 && (
          <p className="text-center" style={{ color: dim }}>De nouvelles offres arrivent bientot.</p>
        )}
        <div className="grid md:grid-cols-3 gap-6">
          {offers.map((offer) => {
            const percent = Math.round(((offer.originalPrice - offer.discountedPrice) / offer.originalPrice) * 100);
            return (
              <div key={offer.id} className="card-hover rounded-2xl overflow-hidden" style={{ backgroundColor: "#0D1912", border: "1px solid rgba(255,255,255,0.1)" }}>
                <FoodSaveImage url={offer.imageUrl} alt={offer.title} variant="offer" merchantType={offer.merchant.type} />
                <div className="p-5 text-left">
                  <p className="font-bold">{offer.title}</p>
                  <p className="text-xs mb-2" style={{ color: dim }}>{offer.merchant.name} - {offer.merchant.city}</p>
                  <p className="text-sm mb-3">
                    <span className="line-through" style={{ color: dim }}>{offer.originalPrice.toFixed(2)} $</span>{" "}
                    <span className="font-bold" style={{ color: amber }}>{offer.discountedPrice.toFixed(2)} $</span>{" "}
                    <span style={{ color: jade }}>-{percent}%</span>
                  </p>
                  <Link href="/offers" className="text-sm font-bold" style={{ color: amber }}>
                    Voir l offre -&gt;
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
        <div className="text-center mt-10">
          <Link href="/offers" className="btn-primary px-8 py-3 rounded-full font-bold uppercase tracking-wide text-sm" style={{ backgroundColor: amber, color: bg }}>
            Voir toutes les offres
          </Link>
        </div>
      </section>

      <section className="px-6 py-24 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <div className="max-w-4xl mx-auto text-center">
          <p className={display.className} style={{ fontSize: "clamp(1.8rem, 4vw, 2.8rem)", color: "#F5F1E8" }}>
            UNE BONNE NOURRITURE MERITE UNE SECONDE CHANCE
          </p>
          <p className="mt-4 max-w-xl mx-auto" style={{ color: dim }}>
            Chaque commande passee sur FoodSave, c'est un repas sauve et un commerce local soutenu.
          </p>
        </div>
      </section>

      

      <Footer />
    </main>
  );
}


