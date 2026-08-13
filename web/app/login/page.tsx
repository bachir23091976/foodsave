"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bebas_Neue, Space_Grotesk } from "next/font/google";

const display = Bebas_Neue({ subsets: ["latin"], weight: "400" });
const bodyFont = Space_Grotesk({ subsets: ["latin"], weight: ["400", "700"] });

const bg = "#06110C";
const amber = "#FFB100";
const jade = "#17C989";
const dim = "#8FA396";

export default function LoginPage() {
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
      const res = await fetch("http://localhost:4000/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Erreur de connexion");
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
    <main className={bodyFont.className} style={{ backgroundColor: bg, color: "#F5F1E8", minHeight: "100vh" }}>
      <div className="flex flex-col items-center justify-center min-h-screen px-6 py-16">
        <p className="text-xs tracking-[0.4em] uppercase mb-4" style={{ color: jade }}>
          Bon retour
        </p>
        <h1 className={display.className} style={{ fontSize: "clamp(2.5rem, 6vw, 4rem)" }}>
          SE CONNECTER
        </h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-sm mt-10">
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
            style={{ backgroundColor: amber, color: bg }}
          >
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>
        {error && <p className="mt-4" style={{ color: "#FF6B6B" }}>{error}</p>}
        <p className="mt-8 text-sm" style={{ color: dim }}>
          Pas encore de compte ? <a href="/register" style={{ color: jade }}>Creer un compte</a>
        </p>
      </div>
    </main>
  );
}
