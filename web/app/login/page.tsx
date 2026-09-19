"use client";
import { useLocale } from "../lib/i18n/LocaleProvider";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "../lib/api";
import AuthShell, { FutureSocialSignIn } from "../components/AuthShell";
import s from "../components/public.module.css";

export default function LoginPage() {
  const { t, message: msg } = useLocale();
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
        setError(data.message || "ui.unable_to_sign_in");
        setLoading(false);
        return;
      }
      localStorage.setItem("token", data.token);
      router.push("/offers");
    } catch {
      setError("ui.unable_to_contact_the_server");
      setLoading(false);
    }
  };

  return (
    <AuthShell title={t("ui.welcome_back_to_foodsave")} subtitle={t("ui.sign_in_to_find_your_reservations")}>
      <form onSubmit={handleSubmit} className={s.form}>
        <label className={s.field} htmlFor="login-email">{t("ui.email")}<input id="login-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className={s.field} htmlFor="login-password">{t("ui.password")}<input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button type="submit" disabled={loading} className={s.button}>{loading ? t("ui.signing_in") : t("ui.sign_in")}</button>
      </form>
      <p className={s.authFooter}><a href="/forgot-password">{t("auth.forgotPassword")}</a></p>
      {error && <p role="alert" className={s.alert}>{msg(error)}</p>}
      <FutureSocialSignIn customer />
      <p className={s.authFooter}>{t("ui.new_here")}{" "}<a href="/register">{t("ui.create_an_account")}</a></p>
    </AuthShell>
  );
}
