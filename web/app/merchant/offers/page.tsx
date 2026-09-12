"use client";

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
  quantity: number;
  pickupStart: string;
  pickupEnd: string;
  createdAt: string;
}

export default function MerchantOffersPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  const loadOffers = () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setError("Vous devez être connecté");
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch(`${API_URL}/offers/mine`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => { if (!res.ok) throw new Error("Offers unavailable"); return res.json(); })
      .then((data) => {
        setOffers(data.offers || []);
        setLoading(false);
      })
      .catch(() => {
        setError("Impossible de charger vos offres");
        setLoading(false);
      });
  };

  useEffect(() => {
    loadOffers();
  }, []);

  const handleDeactivate = async (offerId: string, offerTitle: string) => {
    const confirmed = window.confirm(
      `Désactiver l'offre "${offerTitle}" ? Elle ne sera plus visible dans les offres publiques.`
    );
    if (!confirmed) return;

    const token = localStorage.getItem("token");
    if (!token) {
      setError("Vous devez être connecté");
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
        setError(data?.message || "Impossible de désactiver l'offre");
        return;
      }

      loadOffers();
    } catch {
      setError("Impossible de contacter le serveur");
    } finally {
      setDeactivatingId(null);
    }
  };

  const formatDateTime = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleString("fr-CA", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <MerchantShell title="Mes offres" description="Retrouvez les offres de votre commerce et leurs quantités disponibles." action={<Link href="/merchant/new-offer" className={ui.button}>Créer une offre +</Link>}>
      {loading && <p role="status" className={s.notice}>Chargement de vos offres…</p>}
      {error && <p role="alert" className={s.notice + " " + s.error}>{error}</p>}
      {!loading && !error && offers.length === 0 && <div className={s.empty}><h2>Votre première offre commence ici.</h2><p>Présentez vos invendus, leur prix et un créneau de récupération.</p><Link href="/merchant/new-offer" className={ui.secondary} style={{ marginTop: 20 }}>Créer une offre</Link></div>}
      {!loading && !error && <div className={s.cards}>{offers.map((offer) => <article key={offer.id} className={s.card + " " + s.offerCard}>
        <div className={s.offerImage}><FoodSaveImage url={offer.imageUrl} alt={offer.title} variant="offer" merchantType={null} /></div>
        <div className={s.offerBody}>
          <div className={s.cardTop}><h2>{offer.title}</h2><span className={s.badge + (offer.quantity > 0 ? " " + s.success : "")}>{offer.quantity > 0 ? offer.quantity + " restante(s)" : "Indisponible"}</span></div>
          {offer.description && <p className={s.muted} style={{ overflowWrap: "anywhere" }}>{offer.description}</p>}
          <p className={s.price}><strong>{offer.discountedPrice.toFixed(2)} $</strong><del>{offer.originalPrice.toFixed(2)} $</del></p>
          <p className={s.help}>Récupération : {formatDateTime(offer.pickupStart)} – {formatDateTime(offer.pickupEnd)}</p>
          <p className={s.help}>Publiée le {formatDateTime(offer.createdAt)}</p>
          {offer.quantity > 0 && <div className={s.actions}><button type="button" onClick={() => handleDeactivate(offer.id, offer.title)} disabled={deactivatingId === offer.id} className={s.dangerButton}>{deactivatingId === offer.id ? "Désactivation…" : "Désactiver"}</button></div>}
        </div>
      </article>)}</div>}
    </MerchantShell>
  );
}
