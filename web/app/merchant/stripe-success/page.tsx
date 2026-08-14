"use client";

import { Bebas_Neue, Space_Grotesk } from "next/font/google";

const display = Bebas_Neue({ subsets: ["latin"], weight: "400" });
const body = Space_Grotesk({ subsets: ["latin"], weight: ["400", "700"] });

const bg = "#06110C";
const jade = "#17C989";
const dim = "#8FA396";

export default function StripeSuccessPage() {
  return (
    <main className={body.className} style={{ backgroundColor: bg, color: "#F5F1E8", minHeight: "100vh" }}>
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mb-6"
          style={{ backgroundColor: "rgba(23,201,137,0.15)", border: "1px solid rgba(23,201,137,0.4)" }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M5 13l4 4L19 7" stroke={jade} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className={display.className} style={{ fontSize: "clamp(2rem, 5vw, 3rem)" }}>
          CONFIGURATION STRIPE TERMINEE !
        </h1>
        <p className="mt-4 max-w-sm" style={{ color: dim }}>
          Votre compte est maintenant prêt à recevoir des paiements.
        </p>
        <a href="/merchant/profile" className="mt-8" style={{ color: jade }}>
          Retour à mon profil
        </a>
      </div>
    </main>
  );
}
