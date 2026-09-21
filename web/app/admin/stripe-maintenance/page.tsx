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
      const response = await fetch(`${API_URL}/admin/maintenance/stripe-test-person-document`, {
        method: "POST",
        credentials: "omit",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data: unknown = await response.json();
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid response");
      setResult(JSON.stringify(data, null, 2));
    } catch {
      setError(true);
    }
  }

  return (
    <main style={{ maxWidth: 760, margin: "40px auto", padding: 24 }}>
      <h1>Maintenance Stripe TEST — ADMIN</h1>
      {!allowed ? <p role="alert">Accès ADMIN requis / ADMIN access required.</p> : <>
        <p>Opération temporaire approuvée / Approved temporary operation.</p>
        <p>Une seule tentative sur cette page. Ne rechargez pas pour réessayer sans vérifier le résultat.
          / One attempt on this page. Do not reload to retry without checking the outcome.</p>
        <button type="button" disabled={attempted} onClick={execute} style={{ padding: 16 }}>
          {attempted ? "Tentative envoyée / Attempt initiated" : "Exécuter une fois / Execute once"}
        </button>
        {error && <p role="alert">Résultat non confirmé. Aucune nouvelle tentative automatique.
          / Outcome unconfirmed. No automatic retry.</p>}
        {result && <pre aria-live="polite" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{result}</pre>}
      </>}
    </main>
  );
}
