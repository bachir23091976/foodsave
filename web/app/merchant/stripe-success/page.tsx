"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import MerchantShell from "../../components/merchant/MerchantShell";
import s from "../../components/merchant/merchant.module.css";
import ui from "../../components/public.module.css";
import { API_URL } from "../../lib/api";

export default function StripeSuccessPage() {
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
    LOADING: "Vérification de votre compte…",
    NOT_CONNECTED: "La configuration de vos paiements n’est pas encore connectée.",
    ONBOARDING_INCOMPLETE: "La configuration ou la vérification de vos paiements reste incomplète.",
    READY: "Votre configuration de paiement est prête.",
    ERROR: "Statut momentanément indisponible.",
  };
  return (
    <MerchantShell title="Configuration des paiements" description="Le retour depuis la configuration ne confirme pas à lui seul que votre compte est prêt.">
      <section className={s.panel + " " + s.payment}>
        <span aria-hidden="true" className={s.paymentSymbol}>{status === "READY" ? "✓" : "↗"}</span>
        <h2>Votre compte de paiement</h2>
        <p role="status" className={s.notice + (status === "ERROR" ? " " + s.error : "")}>{messages[status]}</p>
        <p className={s.help}>Retrouvez les prochaines étapes dans votre profil commerçant. Aucun versement n’est déclenché par cette page.</p>
        <div className={s.actions}><Link href="/merchant/profile#paiements" className={ui.button}>Retour à mon profil</Link></div>
      </section>
    </MerchantShell>
  );
}
