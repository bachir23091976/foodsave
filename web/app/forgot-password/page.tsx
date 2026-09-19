"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale } from "../lib/i18n/LocaleProvider";
import AuthShell from "../components/AuthShell";
import { API_URL } from "../lib/api";
import s from "../components/public.module.css";

export default function ForgotPasswordPage() {
  const { t, locale, message: msg } = useLocale();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, locale }),
      });
      const data = await response.json();
      setMessage(data.message || "auth.resetRequestAccepted");
    } catch {
      setError("ui.unable_to_contact_the_server");
    } finally {
      setLoading(false);
    }
  };

  return <AuthShell title="auth.forgotPassword" subtitle={t("auth.forgotPasswordIntro")}>
    <form onSubmit={submit} className={s.form}>
      <label className={s.field} htmlFor="forgot-password-email">{t("ui.email")}<input id="forgot-password-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      <button type="submit" disabled={loading} className={s.button}>{t("auth.sendResetLink")}</button>
    </form>
    {message && <p role="status" className={s.searchNote}>{msg(message)}</p>}
    {error && <p role="alert" className={s.alert}>{msg(error)}</p>}
    <p className={s.authFooter}><Link href="/login">{t("ui.sign_in")}</Link></p>
  </AuthShell>;
}