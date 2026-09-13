"use client";
import LanguageSelector from "../lib/i18n/LanguageSelector";
import { useLocale } from "../lib/i18n/LocaleProvider";


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
  const { t, text: tr, message: msg, number } = useLocale();
  const [stats, setStats] = useState<Stats | null>(null);
  const [pending, setPending] = useState<PendingMerchant[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadData = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setError("ui.you_must_be_signed_in");
      return;
    }

    try {
      const statsRes = await fetch(`${API_URL}/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const statsData = await statsRes.json();

      if (!statsRes.ok) {
        setError(statsData.message || "ui.access_denied");
        return;
      }

      setStats(statsData.stats);

      const pendingRes = await fetch(`${API_URL}/admin/merchants/pending`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const pendingData = await pendingRes.json();
      setPending(pendingData.merchants || []);
    } catch {
      setError("ui.unable_to_contact_the_server");
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
        setMessage(data.message || "ui.something_went_wrong");
        return;
      }

      setMessage("ui.business_approved");
      loadData();
    } catch {
      setMessage("ui.unable_to_approve_this_business");
    }
  };

  if (error) {
    return (
      <main className={body.className} style={{ backgroundColor: bg, color: "#F5F1E8", minHeight: "100vh" }}>
        <LanguageSelector />
        <div className="flex items-center justify-center min-h-screen px-6 text-center">
          <p style={{ color: "#FF6B6B" }}>{msg(error)}</p>
        </div>
      </main>
    );
  }

  return (
    <main className={body.className} style={{ backgroundColor: bg, color: "#F5F1E8", minHeight: "100vh" }}>
      <Navbar />

      <section className="px-6 pt-14 pb-6 text-center">
        <p className="text-xs tracking-[0.4em] uppercase mb-3" style={{ color: jade }}>
          {t("ui.overview")}</p>
        <h1 className={display.className} style={{ fontSize: "clamp(2.2rem, 6vw, 4rem)" }}>
          {t("ui.admin_dashboard")}</h1>
      </section>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto px-6 mb-14">
          {[
            [stats.userCount, t("ui.users")],
            [stats.merchantCount, t("ui.businesses")],
            [stats.offerCount, t("ui.offers")],
            [stats.orderCount, t("ui.orders")],
          ].map(([value, label], i) => (
            <ScrollReveal key={label as string} index={i}>
              <div className="rounded-2xl p-5 text-center h-full" style={{ backgroundColor: "#0D1912", border: "1px solid rgba(255,255,255,0.1)" }}>
                <p className="text-2xl font-bold" style={{ color: jade }}>{value}</p>
                <p className="text-sm mt-1" style={{ color: dim }}>{tr(label)}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      )}

      <h2 className={display.className} style={{ fontSize: "1.6rem", color: amber, textAlign: "center", marginBottom: "1.5rem" }}>
        {t("ui.businesses_awaiting_approval")}</h2>

      {message && <p className="text-center mb-4" style={{ color: jade }}>{msg(message)}</p>}

      <div className="grid gap-3 max-w-2xl mx-auto px-6 pb-20">
        {pending.length === 0 && (
          <p className="text-center" style={{ color: dim }}>{t("ui.no_businesses_awaiting_approval")}</p>
        )}
        {pending.map((merchant, index) => (
          <ScrollReveal key={merchant.id} index={index}>
            <div
              className="rounded-2xl p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 min-w-0"
              style={{ backgroundColor: "#0D1912", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <div className="min-w-0 max-w-full break-words">
                <p className="font-bold">{merchant.name}</p>
                <p className="text-sm" style={{ color: dim }}>
                  {tr(({ RESTAURANT: "ui.restaurant", CAFE: "ui.cafe", BAKERY: "ui.bakery", GROCERY: "ui.grocery", SUPERMARKET: "ui.supermarket", HOTEL: "ui.hotel", OTHER: "ui.other" } as Record<string, string>)[merchant.type] || "ui.other")} — {merchant.city}
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
                {t("ui.approve")}</button>
            </div>
          </ScrollReveal>
        ))}
      </div>

      <Footer />
    </main>
  );
}
