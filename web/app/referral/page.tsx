"use client";

import { useEffect, useState } from "react";
import { Bebas_Neue, Space_Grotesk } from "next/font/google";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import ScrollReveal from "../components/ScrollReveal";

const display = Bebas_Neue({ subsets: ["latin"], weight: "400" });
const body = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });

const bg = "#06110C";
const amber = "#FFB100";
const jade = "#17C989";
const dim = "#8FA396";

export default function ReferralPage() {
  const [referralCode, setReferralCode] = useState("");
  const [referralCount, setReferralCount] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    fetch("http://localhost:4000/users/referral", {
      headers: { Authorization: "Bearer " + token },
    })
      .then((res) => res.json())
      .then((data) => {
        setReferralCode(data.referralCode || "");
        setReferralCount(data.referralCount || 0);
      })
      .catch(() => {});
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(referralCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className={body.className} style={{ backgroundColor: bg, color: "#F5F1E8", minHeight: "100vh" }}>
      <Navbar />

      <section className="px-6 pt-16 pb-6 text-center">
        <p className="text-xs tracking-[0.4em] uppercase mb-3" style={{ color: jade }}>
          Parrainage
        </p>
        <h1 className={display.className} style={{ fontSize: "clamp(2.4rem, 6vw, 4.5rem)", lineHeight: 1 }}>
          INVITEZ UN AMI,
          <br />
          <span style={{ color: amber }}>GAGNEZ ENSEMBLE</span>
        </h1>
        <p className="mt-4 max-w-md mx-auto" style={{ color: dim }}>
          Partagez votre code avec un ami. Quand il fait sa premiere commande, vous recevez tous les deux une
          recompense de fidelite.
        </p>
      </section>

      <ScrollReveal index={0} className="max-w-sm mx-auto px-6">
        <div
          className="rounded-2xl p-8 text-center"
          style={{ backgroundColor: "#0D1912", border: "1px solid rgba(23,201,137,0.3)" }}
        >
          <p className="text-sm mb-2" style={{ color: dim }}>Votre code de parrainage</p>
          <p className={display.className} style={{ fontSize: "2.4rem", color: jade, letterSpacing: "0.05em" }}>
            {referralCode || "..."}
          </p>
          <button
            onClick={handleCopy}
            className="mt-5 rounded-full px-8 py-3 font-bold uppercase tracking-wide text-sm"
            style={{ backgroundColor: amber, color: bg }}
          >
            {copied ? "Copie !" : "Copier le code"}
          </button>
        </div>
      </ScrollReveal>

      <ScrollReveal index={1} className="text-center mt-8 px-6">
        <p style={{ color: dim }}>
          Vous avez deja invite <span className="font-bold" style={{ color: "#F5F1E8" }}>{referralCount}</span> ami
          {referralCount > 1 ? "s" : ""}
        </p>
      </ScrollReveal>

      <section className="px-6 py-20 max-w-3xl mx-auto">
        <div className="grid md:grid-cols-2 gap-8">
          {[
            ["1", "Partagez votre code", "Envoyez votre code personnel a un ami par message ou reseau social."],
            ["2", "Recevez votre recompense", "Des sa premiere commande, vous recevez tous les deux une reduction de fidelite."],
          ].map(([n, title, text], i) => (
            <ScrollReveal key={n} index={i}>
              <div className="text-center">
                <div
                  className="mx-auto mb-4 w-14 h-14 rounded-full flex items-center justify-center font-bold"
                  style={{ backgroundColor: "#06110C", border: "1px solid rgba(23,201,137,0.4)", color: jade }}
                >
                  {n}
                </div>
                <p className="font-bold text-lg mb-1">{title}</p>
                <p style={{ color: dim }}>{text}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      <Footer />
    </main>
  );
}
