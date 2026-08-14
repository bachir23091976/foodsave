"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bebas_Neue, Space_Grotesk } from "next/font/google";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import FoodSaveImage from "../components/FoodSaveImage";

const display = Bebas_Neue({ subsets: ["latin"], weight: "400" });
const body = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });

const bg = "#06110C";
const jade = "#17C989";
const dim = "#8FA396";

export default function RegisterMerchantPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("http://localhost:4000/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email, password, role: "MERCHANT" }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Erreur lors de l inscription");
        setLoading(false);
        return;
      }

      localStorage.setItem("token", data.token);
      router.push("/merchant/profile");
    } catch {
      setError("Impossible de contacter le serveur");
      setLoading(false);
    }
  };

  return (
    <main className={body.className} style={{ backgroundColor: bg, color: "#F5F1E8" }}>
      <Navbar />

      <section className="px-6 py-16 max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-center">
        <div>
          <p className="text-xs tracking-[0.4em] uppercase mb-4" style={{ color: jade }}>
            Pour les commerces d Ottawa
          </p>
          <h1 className={display.className} style={{ fontSize: "clamp(2.2rem, 6vw, 3.8rem)", lineHeight: 1 }}>
            INSCRIVEZ
            <br />
            VOTRE COMMERCE
          </h1>
          <p className="mt-4" style={{ color: dim }}>
            Sans frais d inscription. Publiez vos invendus en quelques minutes.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-8">
            <input
              type="text"
              placeholder="Prenom"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="rounded-full px-5 py-3 outline-none"
              style={{ backgroundColor: "#0D1912", border: "1px solid rgba(255,255,255,0.15)", color: "#F5F1E8" }}
              required
            />
            <input
              type="text"
              placeholder="Nom"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="rounded-full px-5 py-3 outline-none"
              style={{ backgroundColor: "#0D1912", border: "1px solid rgba(255,255,255,0.15)", color: "#F5F1E8" }}
              required
            />
            <input
              type="email"
              placeholder="Courriel"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-full px-5 py-3 outline-none"
              style={{ backgroundColor: "#0D1912", border: "1px solid rgba(255,255,255,0.15)", color: "#F5F1E8" }}
              required
            />
            <input
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
              style={{ backgroundColor: jade, color: bg }}
            >
              {loading ? "Creation..." : "S inscrire comme commercant"}
            </button>
          </form>

          {error && <p className="mt-4" style={{ color: "#FF6B6B" }}>{error}</p>}
        </div>

        <FoodSaveImage url={null} alt="Commerce partenaire FoodSave" variant="hero" merchantType={null} className="rounded-2xl" />
      </section>

      <Footer />
    </main>
  );
}
