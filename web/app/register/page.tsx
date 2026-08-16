"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bebas_Neue, Space_Grotesk } from "next/font/google";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import FoodSaveImage from "../components/FoodSaveImage";
import { API_URL } from "../lib/api";

const display = Bebas_Neue({ subsets: ["latin"], weight: "400" });
const body = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });

const bg = "#06110C";
const amber = "#FFB100";
const jade = "#17C989";
const dim = "#8FA396";

export default function RegisterPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email, password, role: "CLIENT", referralCode }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Erreur lors de l inscription");
        setLoading(false);
        return;
      }

      localStorage.setItem("token", data.token);
      router.push("/offers");
    } catch {
      setError("Impossible de contacter le serveur");
      setLoading(false);
    }
  };

  return (
    <main className={body.className} style={{ backgroundColor: bg, color: "#F5F1E8" }}>
      <Navbar />

      <section className="px-6 py-16 max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-center">
        <FoodSaveImage url={null} alt="Rejoindre FoodSave" variant="hero" merchantType={null} className="rounded-2xl order-2 md:order-1" />

        <div className="order-1 md:order-2">
          <p className="text-xs tracking-[0.4em] uppercase mb-4" style={{ color: jade }}>
            Rejoignez FoodSave
          </p>
          <h1 className={display.className} style={{ fontSize: "clamp(2.2rem, 6vw, 3.8rem)", lineHeight: 1 }}>
            CREEZ VOTRE
            <br />
            <span style={{ color: amber }}>COMPTE</span>
          </h1>
          <p className="mt-4" style={{ color: dim }}>
            Trouvez de bons plats a prix reduit pres de chez vous.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-8">
            <label htmlFor="register-firstname" className="sr-only">Prenom</label>
            <input
              id="register-firstname"
              type="text"
              placeholder="Prenom"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="rounded-full px-5 py-3 outline-none"
              style={{ backgroundColor: "#0D1912", border: "1px solid rgba(255,255,255,0.15)", color: "#F5F1E8" }}
              required
            />
            <label htmlFor="register-lastname" className="sr-only">Nom</label>
            <input
              id="register-lastname"
              type="text"
              placeholder="Nom"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="rounded-full px-5 py-3 outline-none"
              style={{ backgroundColor: "#0D1912", border: "1px solid rgba(255,255,255,0.15)", color: "#F5F1E8" }}
              required
            />
            <label htmlFor="register-referral" className="sr-only">Code de parrainage (optionnel)</label>
            <input
              id="register-referral"
              type="text"
              placeholder="Code de parrainage (optionnel)"
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value)}
              className="rounded-full px-5 py-3 outline-none"
              style={{ backgroundColor: "#0D1912", border: "1px solid rgba(255,255,255,0.15)", color: "#F5F1E8" }}
            />
            <label htmlFor="register-email" className="sr-only">Courriel</label>
            <input
              id="register-email"
              type="email"
              placeholder="Courriel"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-full px-5 py-3 outline-none"
              style={{ backgroundColor: "#0D1912", border: "1px solid rgba(255,255,255,0.15)", color: "#F5F1E8" }}
              required
            />
            <label htmlFor="register-password" className="sr-only">Mot de passe</label>
            <input
              id="register-password"
              type="password"
              placeholder="Mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-full px-5 py-3 outline-none"
              style={{ backgroundColor: "#0D1912", border: "1px solid rgba(255,255,255,0.15)", color: "#F5F1E8" }}
              required
            />

            <button
              type="submit"
              disabled={loading}
              className="rounded-full px-6 py-3 font-bold uppercase tracking-wide text-sm mt-2"
              style={{ backgroundColor: amber, color: bg }}
            >
              {loading ? "Creation..." : "Creer mon compte"}
            </button>
          </form>

          {error && <p className="mt-4" style={{ color: "#FF6B6B" }}>{error}</p>}
        </div>
      </section>

      <Footer />
    </main>
  );
}
