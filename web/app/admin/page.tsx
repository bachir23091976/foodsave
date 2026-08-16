"use client";

import { useEffect, useState } from "react";
import { Bebas_Neue, Space_Grotesk } from "next/font/google";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import ScrollReveal from "../components/ScrollReveal";
import { API_URL } from "../lib/api";

const display = Bebas_Neue({ subsets: ["latin"], weight: "400" });
const body = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });

const bg = "#06110C";
const amber = "#FFB100";
const jade = "#17C989";
const dim = "#8FA396";

interface Stats {
  userCount: number;
  merchantCount: number;
  offerCount: number;
  orderCount: number;
}

interface PendingMerchant {
  id: string;
  name: string;
  city: string;
  type: string;
  owner: { email: string; firstName: string; lastName: string };
}

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [pending, setPending] = useState<PendingMerchant[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadData = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setError("Vous devez être connecté");
      return;
    }

    try {
      const statsRes = await fetch(`${API_URL}/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const statsData = await statsRes.json();

      if (!statsRes.ok) {
        setError(statsData.message || "Accès refusé");
        return;
      }

      setStats(statsData.stats);

      const pendingRes = await fetch(`${API_URL}/admin/merchants/pending`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const pendingData = await pendingRes.json();
      setPending(pendingData.merchants || []);
    } catch {
      setError("Impossible de contacter le serveur");
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleApprove = async (merchantId: string) => {
    const token = localStorage.getItem("token");
    setMessage("");

    try {
      const res = await fetch(`${API_URL}/admin/merchants/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ merchantId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.message || "Erreur");
        return;
      }

      setMessage("Commerce approuvé !");
      loadData();
    } catch {
      setMessage("Erreur lors de l'approbation");
    }
  };

  if (error) {
    return (
      <main className={body.className} style={{ backgroundColor: bg, color: "#F5F1E8", minHeight: "100vh" }}>
        <div className="flex items-center justify-center min-h-screen px-6 text-center">
          <p style={{ color: "#FF6B6B" }}>{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className={body.className} style={{ backgroundColor: bg, color: "#F5F1E8", minHeight: "100vh" }}>
      <Navbar />

      <section className="px-6 pt-14 pb-6 text-center">
        <p className="text-xs tracking-[0.4em] uppercase mb-3" style={{ color: jade }}>
          Vue d ensemble
        </p>
        <h1 className={display.className} style={{ fontSize: "clamp(2.2rem, 6vw, 4rem)" }}>
          DASHBOARD ADMINISTRATEUR
        </h1>
      </section>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto px-6 mb-14">
          {[
            [stats.userCount, "Utilisateurs"],
            [stats.merchantCount, "Commerces"],
            [stats.offerCount, "Offres"],
            [stats.orderCount, "Commandes"],
          ].map(([value, label], i) => (
            <ScrollReveal key={label as string} index={i}>
              <div className="rounded-2xl p-5 text-center h-full" style={{ backgroundColor: "#0D1912", border: "1px solid rgba(255,255,255,0.1)" }}>
                <p className="text-2xl font-bold" style={{ color: jade }}>{value}</p>
                <p className="text-sm mt-1" style={{ color: dim }}>{label}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      )}

      <h2 className={display.className} style={{ fontSize: "1.6rem", color: amber, textAlign: "center", marginBottom: "1.5rem" }}>
        COMMERCES EN ATTENTE D APPROBATION
      </h2>

      {message && <p className="text-center mb-4" style={{ color: jade }}>{message}</p>}

      <div className="grid gap-3 max-w-2xl mx-auto px-6 pb-20">
        {pending.length === 0 && (
          <p className="text-center" style={{ color: dim }}>Aucun commerce en attente</p>
        )}
        {pending.map((merchant, index) => (
          <ScrollReveal key={merchant.id} index={index}>
            <div
              className="rounded-2xl p-5 flex justify-between items-center gap-4"
              style={{ backgroundColor: "#0D1912", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <div>
                <p className="font-bold">{merchant.name}</p>
                <p className="text-sm" style={{ color: dim }}>
                  {merchant.type} — {merchant.city}
                </p>
                <p className="text-sm" style={{ color: dim, opacity: 0.7 }}>
                  {merchant.owner.firstName} {merchant.owner.lastName} ({merchant.owner.email})
                </p>
              </div>
              <button
                onClick={() => handleApprove(merchant.id)}
                className="rounded-full px-5 py-2 font-bold uppercase tracking-wide text-xs whitespace-nowrap"
                style={{ backgroundColor: amber, color: bg }}
              >
                Approuver
              </button>
            </div>
          </ScrollReveal>
        ))}
      </div>

      <Footer />
    </main>
  );
}
