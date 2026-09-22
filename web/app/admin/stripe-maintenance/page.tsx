"use client";

import { useEffect, useRef, useState } from "react";
import { API_URL } from "../../lib/api";

// UI visibility only, like Navbar. Backend authentication remains authoritative.
function isAdmin(token: string | null): boolean {
  try {
    if (!token) return false;
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(window.atob(payload + "=".repeat((4 - payload.length % 4) % 4))).role === "ADMIN";
  } catch { return false; }
}

export default function StripeMaintenancePage() {
  const [allowed, setAllowed] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);
  const statusLocked = useRef(false);
  const locked = useRef(false);

  useEffect(() => {
    try { setAllowed(isAdmin(localStorage.getItem("token"))); } catch { setAllowed(false); }
  }, []);

  async function execute() {
    if (locked.current) return;
    locked.current = true;
    setAttempted(true);
    try {
      const token = localStorage.getItem("token");
      if (!isAdmin(token)) { setAllowed(false); return; }
      const response = await fetch(`${API_URL}/admin/maintenance/stripe-test-identity-session`, {
        method: "POST",
        credentials: "omit",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok || data?.success !== true || typeof data.url !== "string") throw new Error("Invalid response");
      const url = new URL(data.url);
      if (url.protocol !== "https:" || url.hostname !== "verify.stripe.com" || url.port || url.username || url.password) {
        throw new Error("Invalid hosted URL");
      }
      window.location.assign(url.href);
    } catch {
      setError(true);
    }
  }

  async function checkStatus() {
    if (statusLocked.current) return;
    statusLocked.current = true;
    setChecking(true);
    setResult("");
    try {
      const token = localStorage.getItem("token");
      if (!isAdmin(token)) { setAllowed(false); return; }
      const response = await fetch(`${API_URL}/admin/maintenance/stripe-test-identity-status`, {
        method: "GET", credentials: "omit", headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok || data?.stripeMode !== "test" || !data.account) throw new Error("Invalid status");
      setResult(JSON.stringify(data, null, 2));
    } catch {
      setResult("Statut indisponible / Status unavailable.");
    } finally {
      statusLocked.current = false;
      setChecking(false);
    }
  }

  return (
    <main style={{ maxWidth: 760, margin: "40px auto", padding: 24 }}>
      <h1>Stripe Identity — TEST uniquement</h1>
      {!allowed ? <p role="alert">Accès ADMIN requis / ADMIN access required.</p> : <>
        <p>Vérification TEST Stripe : aucun vrai document d’identité et aucun vrai selfie.
          / Stripe TEST verification: no real identity document or selfie.</p>
        <p>Dans l’interface TEST Stripe, choisissez le scénario prédéfini réussi : Success / Verified.</p>
        <p>Le retour sur cette page ne prouve pas la réussite. Vérifiez le statut Stripe.
          / Returning here does not prove success. Check Stripe status.</p>
        <p>Une seule tentative sur cette page. Ne rechargez pas pour réessayer sans vérifier le résultat.
          / One attempt on this page. Do not reload to retry without checking the outcome.</p>
        <button type="button" disabled={attempted} onClick={execute} style={{ padding: 16 }}>
          {attempted ? "Tentative envoyée / Attempt initiated" : "Démarrer la vérification TEST"}
        </button>
        {error && <p role="alert">Le résultat de la création n'est pas confirmé. Ne relancez pas la
          vérification. Utilisez Vérifier le statut Stripe.
          / Outcome unconfirmed. Do not restart verification. Check Stripe status. No automatic retry.</p>}
        <button type="button" disabled={checking} onClick={checkStatus} style={{ padding: 16 }}>
          Vérifier le statut Stripe
        </button>
        {result && <pre aria-live="polite" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{result}</pre>}
      </>}
    </main>
  );
}
