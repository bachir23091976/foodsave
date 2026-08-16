"use client";

import { useEffect, useState } from "react";
import { Bebas_Neue, Space_Grotesk } from "next/font/google";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import ScrollReveal from "../../components/ScrollReveal";
import { API_URL } from "../../lib/api";

const display = Bebas_Neue({ subsets: ["latin"], weight: "400" });
const body = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });

const bg = "#06110C";
const amber = "#FFB100";
const jade = "#17C989";
const dim = "#8FA396";

interface Sale {
  id: string;
  title: string;
  totalPrice: number;
  commission: number;
  net: number;
  date: string;
}

interface Summary {
  totalSales: number;
  totalRevenue: number;
  totalCommission: number;
  totalNet: number;
}

export default function MerchantSalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setError("Vous devez etre connecte");
      setLoading(false);
      return;
    }

    fetch(`${API_URL}/merchants/sales`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        setSales(data.sales || []);
        setSummary(data.summary || null);
        setLoading(false);
      })
      .catch(() => {
        setError("Impossible de charger vos ventes");
        setLoading(false);
      });
  }, []);

  const formatDate = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleDateString("fr-CA", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  return (
    <main className={body.className} style={{ backgroundColor: bg, color: "#F5F1E8", minHeight: "100vh" }}>
      <Navbar />

      <section className="px-6 pt-14 pb-6 text-center">
        <p className="text-xs tracking-[0.4em] uppercase mb-3" style={{ color: jade }}>
          Performance
        </p>
        <h1 className={display.className} style={{ fontSize: "clamp(2.2rem, 6vw, 4rem)" }}>
          MES VENTES
        </h1>
      </section>

      {loading && <p className="text-center" style={{ color: dim }}>Chargement...</p>}
      {error && <p className="text-center" style={{ color: "#FF6B6B" }}>{error}</p>}

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto px-6 mb-12">
          {[
            [summary.totalSales.toString(), "Ventes completees", "#F5F1E8"],
            [summary.totalRevenue.toFixed(2) + " $", "Chiffre d'affaires", jade],
            [summary.totalCommission.toFixed(2) + " $", "Commission FoodSave", amber],
            [summary.totalNet.toFixed(2) + " $", "Montant net recu", "#F5F1E8"],
          ].map(([value, label, color], i) => (
            <ScrollReveal key={label} index={i}>
              <div className="rounded-2xl p-5 text-center h-full" style={{ backgroundColor: "#0D1912", border: "1px solid rgba(255,255,255,0.1)" }}>
                <p className="text-2xl font-bold" style={{ color }}>{value}</p>
                <p className="text-sm mt-1" style={{ color: dim }}>{label}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      )}

      {!loading && sales.length === 0 && (
        <p className="text-center" style={{ color: dim }}>Aucune vente completee pour le moment.</p>
      )}

      <div className="grid gap-3 max-w-2xl mx-auto px-6 pb-20">
        {sales.map((sale, index) => (
          <ScrollReveal key={sale.id} index={index}>
            <div
              className="rounded-2xl p-4 flex justify-between items-center"
              style={{ backgroundColor: "#0D1912", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <div>
                <p className="font-bold">{sale.title}</p>
                <p className="text-xs" style={{ color: dim, opacity: 0.7 }}>{formatDate(sale.date)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm" style={{ color: dim }}>Total : {sale.totalPrice.toFixed(2)} $</p>
                <p className="text-sm" style={{ color: amber }}>Commission : -{sale.commission.toFixed(2)} $</p>
                <p className="text-sm font-bold" style={{ color: jade }}>Net : {sale.net.toFixed(2)} $</p>
              </div>
            </div>
          </ScrollReveal>
        ))}
      </div>

      <Footer />
    </main>
  );
}
