"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import MerchantShell from "../../components/merchant/MerchantShell";
import s from "../../components/merchant/merchant.module.css";
import ui from "../../components/public.module.css";
import { API_URL } from "../../lib/api";
import { useLocale } from "../../lib/i18n/LocaleProvider";

export default function StripeRefreshPage() {
  const { t } = useLocale();
  const [failed, setFailed] = useState(false);
  const request = useRef<Promise<string> | null>(null);

  useEffect(() => {
    let active = true;
    // Reuse the request when React replays effects; never retry automatically.
    if (!request.current) {
      request.current = (async () => {
        const token = localStorage.getItem("token");
        if (!token) throw new Error("Authentication required");
        const res = await fetch(`${API_URL}/merchants/connect-stripe`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({}),
        });
        if (!res.ok) throw new Error("Onboarding unavailable");
        const data = await res.json();
        if (typeof data.url !== "string" || !/^https:\/\/connect\.stripe\.com\//.test(data.url)) {
          throw new Error("Invalid onboarding destination");
        }
        return data.url as string;
      })();
    }
    request.current.then(url => {
      if (active) window.location.href = url;
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);

  return (
    <MerchantShell title={t("ui.payment_setup")} description={t("ui.find_your_next_steps_in_your_merchant_profile_this")}>
      <section className={s.panel}>
        <p role={failed ? "alert" : "status"} className={s.notice + (failed ? " " + s.error : "")}>
          {t(failed ? "ui.unable_to_connect_to_stripe" : "merchant.connecting")}
        </p>
        <Link href="/merchant/profile#paiements" className={ui.button}>{t("ui.back_to_my_profile")}</Link>
      </section>
    </MerchantShell>
  );
}
