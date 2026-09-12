"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "../lib/api";
import AuthShell, { FutureSocialSignIn } from "../components/AuthShell";
import s from "../components/public.module.css";

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
        setError(data.message || "Erreur lors de l’inscription");
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
    <AuthShell title="Créez votre compte" subtitle="Vos prochaines découvertes gourmandes vous attendent.">
      <form onSubmit={handleSubmit} className={s.form}>
        <label className={s.field} htmlFor="register-firstname">Prénom
          <input id="register-firstname" type="text" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
        </label>
        <label className={s.field} htmlFor="register-lastname">Nom
          <input id="register-lastname" type="text" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
        </label>
        <label className={s.field} htmlFor="register-email">Courriel
          <input id="register-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className={s.field} htmlFor="register-password">Mot de passe
          <input id="register-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <details><summary>Vous avez un code de parrainage ?</summary>
          <label className={s.field} htmlFor="register-referral" style={{ marginTop: 12 }}>Code de parrainage (facultatif)
            <input id="register-referral" type="text" value={referralCode} onChange={(e) => setReferralCode(e.target.value)} />
          </label>
        </details>
        <button type="submit" disabled={loading} className={s.button}>{loading ? "Création…" : "Créer mon compte"}</button>
      </form>
      {error && <p role="alert" className={s.alert}>{error}</p>}
      <FutureSocialSignIn />
      <p className={s.authFooter}>Déjà un compte ? <a href="/login">Se connecter</a></p>
    </AuthShell>
  );
}
