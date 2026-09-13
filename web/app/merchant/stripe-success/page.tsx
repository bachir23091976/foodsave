"use client";
import { useLocale } from "../../lib/i18n/LocaleProvider";


import Link from "next/link";
import { useEffect, useState } from "react";
import MerchantShell from "../../components/merchant/MerchantShell";
import s from "../../components/merchant/merchant.module.css";
import ui from "../../components/public.module.css";
import { API_URL } from "../../lib/api";

export default function StripeSuccessPage() {
  const { t, text: tr } = useLocale();
  const [status, setStatus] = useState("LOADING");
  useEffect(() => {
    let active = true;
    const token = localStorage.getItem("token");
    if (!token) { setStatus("ERROR"); return; }
    fetch(`${API_URL}/merchants/stripe-status`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    }).then(async (res) => {
      if (!res.ok) throw new Error("Account status unavailable");
      const data = await res.json();
      if (active) setStatus(["READY", "NOT_CONNECTED", "ONBOARDING_INCOMPLETE"].includes(data.status) ? data.status : "ERROR");
    }).catch(() => { if (active) setStatus("ERROR"); });
    return () => { active = false; };
  }, []);
  const messages: Record<string, string> = {
    LOADING: "ui.checking_your_account",
    NOT_CONNECTED: "ui.your_payment_setup_is_not_connected_yet",
    ONBOARDING_INCOMPLETE: "ui.your_payment_setup_or_verification_is_still_incomplete",
    READY: "ui.your_payment_setup_is_ready",
    ERROR: "ui.status_temporarily_unavailable",
  };
  return (
    <MerchantShell title={t("ui.payment_setup")} description={t("ui.returning_from_setup_does_not_by_itself_confirm_that")}>
      <section className={s.panel + " " + s.payment}>
        <span aria-hidden="true" className={s.paymentSymbol}>{status === "READY" ? "✓" : "↗"}</span>
        <h2>{t("ui.your_payment_account")}</h2>
        <p role="status" className={s.notice + (status === "ERROR" ? " " + s.error : "")}>{tr(messages[status])}</p>
        <p className={s.help}>{t("ui.find_your_next_steps_in_your_merchant_profile_this")}</p>
        <div className={s.actions}><Link href="/merchant/profile#paiements" className={ui.button}>{t("ui.back_to_my_profile")}</Link></div>
      </section>
    </MerchantShell>
  );
}
