"use client";

import { useEffect, useState } from "react";

interface Offer {
  id: string;
  title: string;
  description: string | null;
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

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setError("Vous devez etre connecte");
      setLoading(false);
      return;
    }

    fetch("http://localhost:4000/offers/mine", {
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
  }, []);

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
    <main className="min-h-screen p-8">
      <h1 className="text-3xl font-bold text-green-700 mb-6 text-center">
        Mes offres
      </h1>

      {loading && <p className="text-center text-gray-500">Chargement...</p>}
      {error && <p className="text-center text-red-600">{error}</p>}
      {!loading && offers.length === 0 && (
        <p className="text-center text-gray-500">
          Vous n&apos;avez encore publie aucune offre.
        </p>
      )}

      <div className="grid gap-4 max-w-2xl mx-auto">
        {offers.map((offer) => (
          <div
            key={offer.id}
            className="border border-gray-200 rounded-lg p-4 shadow-sm"
          >
            <div className="flex justify-between items-start mb-1">
              <h2 className="text-lg font-semibold">{offer.title}</h2>
              <span
                className={`text-xs font-bold px-2 py-1 rounded ${
                  offer.quantity > 0
                    ? "bg-green-100 text-green-800"
                    : "bg-gray-200 text-gray-600"
                }`}
              >
                {offer.quantity > 0 ? `${offer.quantity} restante(s)` : "Epuise"}
              </span>
            </div>

            {offer.description && (
              <p className="text-sm text-gray-600 mb-2">{offer.description}</p>
            )}

            <div className="flex items-baseline gap-2 mb-1">
              <span className="line-through text-gray-400 text-sm">
                {offer.originalPrice.toFixed(2)} $
              </span>
              <span className="text-green-700 font-bold">
                {offer.discountedPrice.toFixed(2)} $
              </span>
            </div>

            <p className="text-sm text-gray-500">
              Recuperation : {formatDateTime(offer.pickupStart)} - {formatDateTime(offer.pickupEnd)}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Publiee le {formatDateTime(offer.createdAt)}
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}