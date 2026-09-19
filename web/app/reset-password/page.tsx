"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale } from "../lib/i18n/LocaleProvider";
import AuthShell from "../components/AuthShell";
import { API_URL } from "../lib/api";
import s from "../components/public.module.css";

export default function ResetPasswordPage() {
  const { t, message: msg } = useLocale();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!token) { setError("auth.resetInvalid"); return; }
    if (password !== confirmPassword) { setError("auth.resetPasswordMismatch"); return; }
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      const data = await response.json();
      if (!response.ok) setError(data.message || "auth.resetInvalid");
      else setMessage(data.message || "auth.resetSuccess");
    } catch {
      setError("ui.unable_to_contact_the_server");
    } finally {
      setLoading(false);
    }
  };

  return <AuthShell title="auth.resetPassword" subtitle={t("auth.resetPasswordIntro")}>
    {!message ? <form onSubmit={submit} className={s.form}>
      <label className={s.field} htmlFor="reset-password-new">{t("auth.newPassword")}<input id="reset-password-new" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
      <label className={s.field} htmlFor="reset-password-confirm">{t("auth.confirmPassword")}<input id="reset-password-confirm" type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>
      <button type="submit" disabled={loading} className={s.button}>{loading ? t("ui.saving") : t("auth.resetPassword")}</button>
    </form> : <p role="status" className={s.searchNote}>{msg(message)}</p>}
    {error && <p role="alert" className={s.alert}>{msg(error)}</p>}
    {message && <p className={s.authFooter}><Link href="/login">{t("ui.sign_in")}</Link></p>}
  </AuthShell>;
}