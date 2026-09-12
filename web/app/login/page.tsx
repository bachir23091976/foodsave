"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "../lib/api";
import AuthShell, { FutureSocialSignIn } from "../components/AuthShell";
import s from "../components/public.module.css";

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
      const res = await fetch(`${API_URL}/auth/login`, {
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
    <AuthShell title="Bon retour chez FoodSave" subtitle="Connectez-vous pour retrouver vos réservations.">
      <form onSubmit={handleSubmit} className={s.form}>
        <label className={s.field} htmlFor="login-email">Courriel
          <input id="login-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className={s.field} htmlFor="login-password">Mot de passe
          <input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button type="submit" disabled={loading} className={s.button}>{loading ? "Connexion…" : "Se connecter"}</button>
      </form>
      {error && <p role="alert" className={s.alert}>{error}</p>}
      <FutureSocialSignIn />
      <p className={s.authFooter}>Pas encore de compte ? <a href="/register">Créer un compte</a></p>
    </AuthShell>
  );
}
