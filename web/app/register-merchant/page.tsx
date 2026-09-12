"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "../lib/api";
import AuthShell from "../components/AuthShell";
import s from "../components/public.module.css";

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
      const res = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email, password, role: "MERCHANT" }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Erreur lors de l’inscription");
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
    <AuthShell title="Créez votre compte commerçant" subtitle="Votre première étape pour rejoindre FoodSave." merchant>
      <form onSubmit={handleSubmit} className={s.form}>
        <label className={s.field} htmlFor="registermerchant-firstname">Prénom
          <input id="registermerchant-firstname" type="text" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
        </label>
        <label className={s.field} htmlFor="registermerchant-lastname">Nom
          <input id="registermerchant-lastname" type="text" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
        </label>
        <label className={s.field} htmlFor="registermerchant-email">Courriel
          <input id="registermerchant-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className={s.field} htmlFor="registermerchant-password">Mot de passe
          <input id="registermerchant-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button type="submit" disabled={loading} className={s.button}>{loading ? "Création…" : "Créer mon compte"}</button>
      </form>
      {error && <p role="alert" className={s.alert}>{error}</p>}
      <p className={s.authFooter}>Déjà un compte ? <a href="/login">Se connecter</a></p>
    </AuthShell>
  );
}
