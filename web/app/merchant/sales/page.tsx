"use client";
import { useLocale } from "../../lib/i18n/LocaleProvider";


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
  const { t, text: tr, message: msg, money, number, intlLocale } = useLocale();
  const [sales, setSales] = useState<Sale[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setError("ui.you_must_be_signed_in");
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
        setError("ui.unable_to_load_your_sales");
        setLoading(false);
      });
  }, []);

  const formatDate = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleDateString(intlLocale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  return (
    <MerchantShell title={t("ui.my_sales")} description={t("ui.view_your_completed_sales_and_their_amounts_separately_from")}>
      {loading && <p role="status" className={s.notice}>{t("ui.loading_your_sales")}</p>}
      {error && <p role="alert" className={s.notice + " " + s.error}>{msg(error)}</p>}
      {!loading && !error && <>
        {summary && <dl className={s.summary}>{[
          [number(summary.totalSales), t("ui.completed_sales")],
          [money(summary.totalRevenue), t("ui.revenue")],
          [money(summary.totalCommission), t("ui.foodsave_commission")],
          [money(summary.totalNet), t("ui.net_sales_amount")],
        ].map(([value,label]) => <div className={s.metric} key={label}><dt>{tr(label)}</dt><dd>{value}</dd></div>)}</dl>}
        <p className={s.help} style={{ marginBottom: 24 }}>{t("ui.these_amounts_describe_your_sales_they_do_not_confirm")}</p>
        {sales.length === 0 ? <div className={s.empty}><h2>{t("ui.no_completed_sales_yet")}</h2><p>{t("ui.your_sales_will_appear_here_once_they_are_recorded")}</p></div> : <section aria-label={t("ui.sales_history")} className={s.cards}>{sales.map((sale) => <article key={sale.id} className={s.card + " " + s.sale}>
          <div><h3>{sale.title}</h3><p className={s.help}>{formatDate(sale.date)}</p></div>
          <dl className={s.saleNumbers}><div><dt>{t("ui.total")}</dt><dd>{money(sale.totalPrice)}</dd></div><div><dt>{t("ui.commission")}</dt><dd>−{money(sale.commission)}</dd></div><div><dt>{t("ui.net")}</dt><dd><strong>{money(sale.net)}</strong></dd></div></dl>
        </article>)}</section>}
      </>}
    </MerchantShell>
  );
}
