"use client";

import Link from "next/link";
import { Bebas_Neue, Space_Grotesk } from "next/font/google";

const display = Bebas_Neue({ subsets: ["latin"], weight: "400" });
const body = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });

const bg = "#06110C";
const paper = "#F5F1E8";
const amber = "#FFB100";
const jade = "#17C989";
const dim = "#8FA396";

export default function Home() {
  return (
    <main className={body.className} style={{ backgroundColor: bg, color: paper }}>
      <style>{`
        @keyframes drift { 0% { transform: translateY(0px); } 50% { transform: translateY(-14px); } 100% { transform: translateY(0px); } }
        @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        @keyframes pulseGlow { 0% { opacity: 0.5; } 50% { opacity: 1; } 100% { opacity: 0.5; } }
        .float1 { animation: drift 6s ease-in-out infinite; }
        .float2 { animation: drift 7s ease-in-out infinite 1s; }
        .float3 { animation: drift 5s ease-in-out infinite 0.5s; }
        .marquee-track { display: flex; width: max-content; animation: marquee 22s linear infinite; }
        .glow-dot { animation: pulseGlow 2.4s ease-in-out infinite; }
      `}</style>

      <section className="relative overflow-hidden px-6 pt-24 pb-16 text-center">
        <div
          className="absolute inset-0"
          style={{
            background: "radial-gradient(circle at 20% 20%, rgba(255,177,0,0.12), transparent 40%), radial-gradient(circle at 80% 30%, rgba(23,201,137,0.12), transparent 40%)",
          }}
        />
        <p
          className="relative text-xs tracking-[0.4em] uppercase mb-6"
          style={{ color: jade }}
        >
          Ottawa - Reseau de sauvetage alimentaire
        </p>
        <h1
          className={display.className}
          style={{ fontSize: "clamp(3rem, 9vw, 8rem)", lineHeight: 0.95, letterSpacing: "0.01em" }}
          className={display.className + " relative"}
        >
          NE LAISSEZ RIEN
          <br />
          <span style={{ color: amber }}>SE PERDRE</span>
        </h1>
        <p className="relative max-w-xl mx-auto mt-8 text-lg" style={{ color: dim }}>
          Chaque soir, des commerces d Ottawa ont de la bonne nourriture en trop.
          FoodSave la sauve avant qu elle ne disparaisse, a prix reduit.
        </p>
        <div className="relative flex flex-wrap justify-center gap-4 mt-10">
          <Link
            href="/register"
            className="px-8 py-4 rounded-full font-bold uppercase tracking-wide text-sm"
            style={{ backgroundColor: amber, color: bg }}
          >
            Voir les offres pres de moi
          </Link>
          <Link
            href="/register-merchant"
            className="px-8 py-4 rounded-full font-bold uppercase tracking-wide text-sm border"
            style={{ borderColor: jade, color: jade }}
          >
            Devenir partenaire
          </Link>
        </div>

        <div className="relative mt-20 hidden md:flex justify-center gap-10">
          <div
            className="float1 rounded-2xl p-5 w-56 text-left"
            style={{ backgroundColor: "#0D1912", border: "1px solid rgba(255,177,0,0.3)", boxShadow: "0 0 40px rgba(255,177,0,0.15)" }}
          >
            <div className="h-24 rounded-lg mb-3" style={{ backgroundColor: "#16261C" }} />
            <p className="font-bold text-sm">Panier boulangerie</p>
            <p className="text-xs mt-1" style={{ color: dim }}>
              <span className="line-through">15.00 $</span>{" "}
              <span style={{ color: amber }} className="font-bold">6.00 $</span>
            </p>
          </div>
          <div
            className="float2 rounded-2xl p-5 w-56 text-left mt-10"
            style={{ backgroundColor: "#0D1912", border: "1px solid rgba(23,201,137,0.3)", boxShadow: "0 0 40px rgba(23,201,137,0.15)" }}
          >
            <div className="h-24 rounded-lg mb-3" style={{ backgroundColor: "#16261C" }} />
            <p className="font-bold text-sm">Plats du jour</p>
            <p className="text-xs mt-1" style={{ color: dim }}>
              <span className="line-through">12.00 $</span>{" "}
              <span style={{ color: jade }} className="font-bold">5.00 $</span>
            </p>
          </div>
          <div
            className="float3 rounded-2xl p-5 w-56 text-left"
            style={{ backgroundColor: "#0D1912", border: "1px solid rgba(255,177,0,0.3)", boxShadow: "0 0 40px rgba(255,177,0,0.15)" }}
          >
            <div className="h-24 rounded-lg mb-3" style={{ backgroundColor: "#16261C" }} />
            <p className="font-bold text-sm">Epicerie surplus</p>
            <p className="text-xs mt-1" style={{ color: dim }}>
              <span className="line-through">20.00 $</span>{" "}
              <span style={{ color: amber }} className="font-bold">8.00 $</span>
            </p>
          </div>
        </div>
      </section>

      <div className="overflow-hidden border-y" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <div className="marquee-track py-4 text-sm tracking-widest uppercase" style={{ color: dim }}>
          {Array(2).fill(0).map((_, i) => (
            <span key={i} className="flex items-center gap-10 pr-10">
              <span>Pain sauve</span>
              <span style={{ color: amber }}>*</span>
              <span>Plats sauves</span>
              <span style={{ color: jade }}>*</span>
              <span>Fruits sauves</span>
              <span style={{ color: amber }}>*</span>
              <span>Zero gaspillage</span>
              <span style={{ color: jade }}>*</span>
            </span>
          ))}
        </div>
      </div>

      <section className="px-6 py-24 max-w-4xl mx-auto">
        <h2 className={display.className} style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", color: amber }}>
          COMMENT CA MARCHE
        </h2>
        <div className="mt-12 relative pl-8" style={{ borderLeft: "2px solid rgba(255,255,255,0.1)" }}>
          {[
            ["Reperez", "Trouvez des paniers surprises pres de chez vous ce soir."],
            ["Reservez", "Payez en ligne en toute securite, en quelques secondes."],
            ["Recuperez", "Presentez votre code au commercant et repartez heureux."],
          ].map(([title, text], i) => (
            <div key={i} className="relative mb-12 last:mb-0">
              <span
                className="glow-dot absolute -left-[41px] top-1 w-4 h-4 rounded-full"
                style={{ backgroundColor: i % 2 === 0 ? amber : jade }}
              />
              <p className="font-bold text-xl">{title}</p>
              <p className="mt-1" style={{ color: dim }}>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 py-16 grid md:grid-cols-2 gap-8 text-center border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <div>
          <p className={display.className} style={{ fontSize: "4rem", color: amber }}>15%</p>
          <p style={{ color: dim }}>Seule commission FoodSave, jamais de frais caches</p>
        </div>
        <div>
          <p className={display.className} style={{ fontSize: "4rem", color: jade }}>0$</p>
          <p style={{ color: dim }}>Cout d inscription pour les commercants</p>
        </div>
      </section>

      <section className="px-6 py-24 grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        <Link
          href="/register"
          className="rounded-2xl p-10 text-center transition hover:scale-[1.02]"
          style={{ backgroundColor: "#0D1912", border: "1px solid rgba(255,177,0,0.35)" }}
        >
          <p className={display.className} style={{ fontSize: "2rem" }}>JE SUIS CLIENT</p>
          <p className="mt-2" style={{ color: dim }}>Trouvez de bons plats a sauver ce soir</p>
        </Link>
        <Link
          href="/register-merchant"
          className="rounded-2xl p-10 text-center transition hover:scale-[1.02]"
          style={{ backgroundColor: "#0D1912", border: "1px solid rgba(23,201,137,0.35)" }}
        >
          <p className={display.className} style={{ fontSize: "2rem" }}>JE SUIS COMMERCANT</p>
          <p className="mt-2" style={{ color: dim }}>Vendez vos invendus, sans frais d inscription</p>
        </Link>
      </section>
    </main>
  );
}
