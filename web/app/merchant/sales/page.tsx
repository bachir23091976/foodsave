"use client";

import { useEffect, useState } from "react";
import MerchantShell from "../../components/merchant/MerchantShell";
import s from "../../components/merchant/merchant.module.css";
import ui from "../../components/public.module.css";
import { API_URL } from "../../lib/api";

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
      setError("Vous devez être connecté");
      setLoading(false);
      return;
    }

    fetch(`${API_URL}/merchants/sales`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => { if (!res.ok) throw new Error("Sales unavailable"); return res.json(); })
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
    <MerchantShell title="Mes ventes" description="Consultez vos ventes terminées et les montants associés, sans les confondre avec les versements bancaires.">
      {loading && <p role="status" className={s.notice}>Chargement de vos ventes…</p>}
      {error && <p role="alert" className={s.notice + " " + s.error}>{error}</p>}
      {!loading && !error && <>
        {summary && <dl className={s.summary}>{[
          [summary.totalSales.toString(), "Ventes terminées"],
          [summary.totalRevenue.toFixed(2) + " $", "Chiffre d’affaires"],
          [summary.totalCommission.toFixed(2) + " $", "Commission FoodSave"],
          [summary.totalNet.toFixed(2) + " $", "Montant net des ventes"],
        ].map(([value,label]) => <div className={s.metric} key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
        <p className={s.help} style={{ marginBottom: 24 }}>Ces montants décrivent vos ventes. Ils ne confirment pas qu’un versement a été reçu sur votre compte bancaire.</p>
        {sales.length === 0 ? <div className={s.empty}><h2>Aucune vente terminée pour le moment.</h2><p>Vos ventes apparaîtront ici lorsqu’elles seront enregistrées comme terminées.</p></div> : <section aria-label="Historique des ventes" className={s.cards}>{sales.map((sale) => <article key={sale.id} className={s.card + " " + s.sale}>
          <div><h3>{sale.title}</h3><p className={s.help}>{formatDate(sale.date)}</p></div>
          <dl className={s.saleNumbers}><div><dt>Total</dt><dd>{sale.totalPrice.toFixed(2)} $</dd></div><div><dt>Commission</dt><dd>−{sale.commission.toFixed(2)} $</dd></div><div><dt>Net</dt><dd><strong>{sale.net.toFixed(2)} $</strong></dd></div></dl>
        </article>)}</section>}
      </>}
    </MerchantShell>
  );
}
