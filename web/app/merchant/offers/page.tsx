"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bebas_Neue, Space_Grotesk } from "next/font/google";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import FoodSaveImage from "../../components/FoodSaveImage";
import ScrollReveal from "../../components/ScrollReveal";
import { API_URL } from "../../lib/api";

const display = Bebas_Neue({ subsets: ["latin"], weight: "400" });
const body = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });

const bg = "#06110C";
const amber = "#FFB100";
const jade = "#17C989";
const dim = "#8FA396";

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
      setError("Vous devez etre connecte");
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch(`${API_URL}/offers/mine`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
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
      setError("Vous devez etre connecte");
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
    <main className={body.className} style={{ backgroundColor: bg, color: "#F5F1E8", minHeight: "100vh" }}>
      <Navbar />

      <section className="px-6 pt-14 pb-6 text-center">
        <p className="text-xs tracking-[0.4em] uppercase mb-3" style={{ color: jade }}>
          Votre vitrine
        </p>
        <h1 className={display.className} style={{ fontSize: "clamp(2.2rem, 6vw, 4rem)" }}>
          MES OFFRES
        </h1>
      </section>

      <div className="max-w-2xl mx-auto px-6 mb-6 flex justify-end">
        <Link
          href="/merchant/new-offer"
          className="rounded-full px-6 py-3 font-bold uppercase tracking-wide text-sm"
          style={{ backgroundColor: jade, color: bg }}
        >
          {"Cr\u00e9er une offre"}
        </Link>
      </div>

      {loading && <p className="text-center" style={{ color: dim }}>Chargement...</p>}
      {error && <p className="text-center" style={{ color: "#FF6B6B" }}>{error}</p>}
      {!loading && offers.length === 0 && (
        <p className="text-center" style={{ color: dim }}>
          Vous n&apos;avez encore publie aucune offre.
        </p>
      )}

      <div className="grid gap-4 max-w-2xl mx-auto px-6 pb-20">
        {offers.map((offer, index) => (
          <ScrollReveal key={offer.id} index={index}>
            <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "#0D1912", border: "1px solid rgba(255,255,255,0.1)" }}>
              <FoodSaveImage url={offer.imageUrl} alt={offer.title} variant="offer" merchantType={null} />

              <div className="p-5 flex flex-col gap-1">
                <div className="flex justify-between items-start mb-1">
                  <h2 className="text-lg font-bold">{offer.title}</h2>
                  <span
                    className="text-xs font-bold px-2 py-1 rounded"
                    style={
                      offer.quantity > 0
                        ? { backgroundColor: "rgba(23,201,137,0.15)", color: jade }
                        : { backgroundColor: "rgba(255,255,255,0.08)", color: dim }
                    }
                  >
                    {offer.quantity > 0 ? `${offer.quantity} restante(s)` : "Désactivée"}
                  </span>
                </div>

                {offer.description && (
                  <p className="text-sm mb-2" style={{ color: dim }}>{offer.description}</p>
                )}

                <div className="flex items-baseline gap-2 mb-1">
                  <span className="line-through text-sm" style={{ color: dim }}>
                    {offer.originalPrice.toFixed(2)} $
                  </span>
                  <span className="font-bold" style={{ color: amber }}>
                    {offer.discountedPrice.toFixed(2)} $
                  </span>
                </div>

                <p className="text-sm" style={{ color: dim }}>
                  Recuperation : {formatDateTime(offer.pickupStart)} - {formatDateTime(offer.pickupEnd)}
                </p>
                <p className="text-xs mt-1" style={{ color: dim, opacity: 0.7 }}>
                  Publiee le {formatDateTime(offer.createdAt)}
                </p>

                {offer.quantity > 0 && (
                  <button
                    onClick={() => handleDeactivate(offer.id, offer.title)}
                    disabled={deactivatingId === offer.id}
                    className="mt-3 self-start rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wide"
                    style={{ backgroundColor: "rgba(255,107,107,0.12)", color: "#FF6B6B", border: "1px solid rgba(255,107,107,0.35)" }}
                  >
                    {deactivatingId === offer.id ? "Désactivation..." : "Désactiver"}
                  </button>
                )}
              </div>
            </div>
          </ScrollReveal>
        ))}
      </div>

      <Footer />
    </main>
  );
}
