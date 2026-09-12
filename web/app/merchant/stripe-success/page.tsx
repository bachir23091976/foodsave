"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { API_URL } from "../../lib/api";
import { Bebas_Neue, Space_Grotesk } from "next/font/google";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";

const display = Bebas_Neue({ subsets: ["latin"], weight: "400" });
const body = Space_Grotesk({ subsets: ["latin"], weight: ["400", "700"] });

const bg = "#06110C";
const jade = "#17C989";
const dim = "#8FA396";

export default function StripeSuccessPage() {
  const [status, setStatus] = useState("LOADING");
  useEffect(() => {
    let active = true;
    const token = localStorage.getItem("token");
    if (!token) { setStatus("ERROR"); return; }
    fetch(`${API_URL}/merchants/stripe-status`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    }).then(async (res) => {
      if (!res.ok) throw new Error("Account status unavailable");
      const data = await res.json();
      if (active) setStatus(["READY", "NOT_CONNECTED", "ONBOARDING_INCOMPLETE"].includes(data.status) ? data.status : "ERROR");
    }).catch(() => { if (active) setStatus("ERROR"); });
    return () => { active = false; };
  }, []);
  const messages: Record<string, string> = {
    LOADING: "Vérification de votre compte…",
    NOT_CONNECTED: "La configuration de vos paiements n’est pas encore connectée.",
    ONBOARDING_INCOMPLETE: "La configuration ou la vérification de vos paiements reste incomplète.",
    READY: "Votre configuration de paiement est prête.",
    ERROR: "Statut momentanément indisponible.",
  };
  return (
    <main className={body.className} style={{ backgroundColor: bg, color: "#F5F1E8", minHeight: "100vh" }}>
      <Navbar />
      <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
        {status === "READY" && <div
          className="w-16 h-16 rounded-full flex items-center justify-center mb-6"
          style={{ backgroundColor: "rgba(23,201,137,0.15)", border: "1px solid rgba(23,201,137,0.4)" }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M5 13l4 4L19 7" stroke={jade} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>}
        <h1 className={display.className} style={{ fontSize: "clamp(2rem, 5vw, 3rem)" }}>
          Configuration des paiements
        </h1>
        <p role="status" className="mt-4 max-w-sm" style={{ color: dim }}>
          {messages[status]}
        </p>
        <Link href="/merchant/profile" className="mt-8" style={{ color: jade }}>
          Retour à mon profil
        </Link>
      </div>
      <Footer />
    </main>
  );
}
