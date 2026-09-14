"use client";
import { useLocale } from "../lib/i18n/LocaleProvider";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "../lib/api";
import AuthShell, { FutureSocialSignIn } from "../components/AuthShell";
import s from "../components/public.module.css";

export default function RegisterPage() {
  const { t, message: msg } = useLocale();
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
        body: JSON.stringify({ firstName, lastName, email, password, role: "CLIENT" }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "ui.unable_to_register");
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
    <AuthShell title={t("ui.create_your_account")} subtitle={t("ui.your_next_food_discoveries_are_waiting")}>
      <form onSubmit={handleSubmit} className={s.form}>
        <label className={s.field} htmlFor="register-firstname">{t("ui.first_name")}<input id="register-firstname" type="text" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
        </label>
        <label className={s.field} htmlFor="register-lastname">{t("ui.last_name")}<input id="register-lastname" type="text" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
        </label>
        <label className={s.field} htmlFor="register-email">{t("ui.email")}<input id="register-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className={s.field} htmlFor="register-password">{t("ui.password")}<input id="register-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button type="submit" disabled={loading} className={s.button}>{loading ? t("ui.creating") : t("ui.create_my_account")}</button>
      </form>
      {error && <p role="alert" className={s.alert}>{msg(error)}</p>}
      <FutureSocialSignIn customer />
      <p className={s.authFooter}>{t("ui.already_have_an_account")}{" "}<a href="/login">{t("ui.sign_in")}</a></p>
    </AuthShell>
  );
}
