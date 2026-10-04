"use client";
import { useLocale } from "../../lib/i18n/LocaleProvider";


import { useEffect, useState } from "react";
import Link from "next/link";
import FoodSaveImage from "../../components/FoodSaveImage";
import MerchantShell from "../../components/merchant/MerchantShell";
import s from "../../components/merchant/merchant.module.css";
import ui from "../../components/public.module.css";
import { API_URL } from "../../lib/api";

interface Offer {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  originalPrice: number;
  discountedPrice: number;
  currentDiscountedPrice?: number;
  dynamicPricing?: { enabled: boolean; minimumPriceMinor: number; startingPriceMinor: number } | null;
  quantity: number;
  pickupStart: string;
  pickupEnd: string;
  createdAt: string;
}

export default function MerchantOffersPage() {
  const { t, message: msg, money, number, count, intlLocale } = useLocale();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [minimum, setMinimum] = useState("");
  const [saving, setSaving] = useState(false);
  const [dynamicAvailable, setDynamicAvailable] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  const loadOffers = () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setError("ui.you_must_be_signed_in");
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch(`${API_URL}/offers/mine`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => { if (!res.ok) throw new Error("Offers unavailable"); return res.json(); })
      .then((data) => {
        setDynamicAvailable(data.dynamicPricingAvailable === true);
        setOffers(data.offers || []);
        setLoading(false);
      })
      .catch(() => {
        setError("ui.unable_to_load_your_offers");
        setLoading(false);
      });
  };

  useEffect(() => {
    loadOffers();
  }, []);

  const handleDeactivate = async (offerId: string, offerTitle: string) => {
    const confirmed = window.confirm(
      t("offers.deactivate", { title: offerTitle })
    );
    if (!confirmed) return;

    const token = localStorage.getItem("token");
    if (!token) {
      setError("ui.you_must_be_signed_in");
      return;
    }

    setDeactivatingId(offerId);
    setError("");
    try {
      const res = await fetch(`${API_URL}/offers/${offerId}/deactivate`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.message || "ui.unable_to_deactivate_the_offer");
        return;
      }

      loadOffers();
    } catch {
      setError("ui.unable_to_contact_the_server");
    } finally {
      setDeactivatingId(null);
    }
  };

  const savePricing = async (id: string) => {
    if (saving) return;
    if (enabled && (!/^\d+(?:\.\d{1,2})?$/.test(minimum) || Number(minimum) <= 0)) { setError("dynamic.invalid"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch(API_URL + "/offers/" + id + "/dynamic-pricing", {
        method: "PATCH", headers: { "Content-Type": "application/json", Authorization: "Bearer " + localStorage.getItem("token") },
        body: JSON.stringify({ enabled, minimumPriceMinor: Math.round(Number(minimum) * 100) }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || "dynamic.invalid"); return; }
      setEditingId(null); loadOffers();
    } catch { setError("ui.unable_to_contact_the_server"); }
    finally { setSaving(false); }
  };
  const formatDateTime = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleString(intlLocale, {
      timeZone: "America/Toronto",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <MerchantShell title={t("ui.my_offers")} description={t("ui.view_your_businesss_offers_and_available_quantities")} action={<Link href="/merchant/new-offer" className={ui.button}>{t("ui.create_an_offer_")}</Link>}>
      {loading && <p role="status" className={s.notice}>{t("ui.loading_your_offers")}</p>}
      {error && <p role="alert" className={s.notice + " " + s.error}>{msg(error)}</p>}
      {!loading && !error && offers.length === 0 && <div className={s.empty}><h2>{t("ui.your_first_offer_starts_here")}</h2><p>{t("ui.describe_your_surplus_its_price_and_a_pickup_window")}</p><Link href="/merchant/new-offer" className={ui.secondary} style={{ marginTop: 20 }}>{t("ui.create_an_offer")}</Link></div>}
      {!loading && !error && <div className={s.cards}>{offers.map((offer) => <article key={offer.id} className={s.card + " " + s.offerCard}>
        <div className={s.offerImage}><FoodSaveImage url={offer.imageUrl} alt={offer.title} variant="offer" merchantType={null} /></div>
        <div className={s.offerBody}>
          <div className={s.cardTop}><h2>{offer.title}</h2><span className={s.badge + (offer.quantity > 0 ? " " + s.success : "")}>{offer.quantity > 0 ? count("offers.remaining", "offers.remainingPlural", offer.quantity) : t("ui.unavailable")}</span></div>
          {offer.description && <p className={s.muted} style={{ overflowWrap: "anywhere" }}>{offer.description}</p>}
          {offer.dynamicPricing && <p>{t("dynamic.start")}: {money(offer.dynamicPricing.startingPriceMinor / 100)} · {t("dynamic.minimum")}: {money(offer.dynamicPricing.minimumPriceMinor / 100)}</p>}
          {dynamicAvailable && Date.now() < Date.parse(offer.pickupStart) && <button type="button" className={ui.secondary} onClick={() => { setEditingId(offer.id); setEnabled(!!offer.dynamicPricing?.enabled); setMinimum(String((offer.dynamicPricing?.minimumPriceMinor ?? Math.round(offer.discountedPrice * 100)) / 100)); }}>{t("dynamic.edit")}</button>}
          {editingId === offer.id && <div><label><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> {t("dynamic.title")}</label>{enabled && <label>{t("dynamic.minimum")}<input type="number" min="0.01" step="0.01" max={offer.discountedPrice} value={minimum} onChange={e => setMinimum(e.target.value)} /></label>}<p>{t("dynamic.private")}</p><button type="button" className={ui.secondary} disabled={saving} onClick={() => void savePricing(offer.id)}>{t("dynamic.save")}</button></div>}
          <p className={s.price}><strong>{money(offer.currentDiscountedPrice ?? offer.discountedPrice)}</strong><del>{money(offer.originalPrice)}</del></p>
          <p className={s.help}>{t("ui.pickup")}{" "}{formatDateTime(offer.pickupStart)} – {formatDateTime(offer.pickupEnd)}</p>
          <p className={s.help}>{t("ui.published_on")}{" "}{formatDateTime(offer.createdAt)}</p>
          {offer.quantity > 0 && <div className={s.actions}><button type="button" onClick={() => handleDeactivate(offer.id, offer.title)} disabled={deactivatingId === offer.id} className={s.dangerButton}>{deactivatingId === offer.id ? t("ui.deactivating") : t("ui.deactivate")}</button></div>}
        </div>
      </article>)}</div>}
    </MerchantShell>
  );
}
