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
  distanceKm?: number;
  merchant: {
    name: string;
    address: string;
    city: string;
  };
}

export default function OffersPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reserving, setReserving] = useState<string | null>(null);
  const [confirmations, setConfirmations] = useState<Record<string, string>>({});
  const [addressInput, setAddressInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");

  const loadOffers = () => {
    fetch("http://localhost:4000/offers")
      .then((res) => res.json())
      .then((data) => {
        setOffers(data.offers || []);
        setLoading(false);
      })
      .catch(() => {
        setError("Impossible de charger les offres");
        setLoading(false);
      });
  };

  useEffect(() => {
    loadOffers();
  }, []);

  const formatTime = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
  };

  const handleSearchNearby = async () => {
    if (!addressInput.trim()) return;

    setSearching(true);
    setSearchMessage("");

    try {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addressInput)}&format=json&limit=1`
      );
      const geoData = await geoRes.json();

      if (!geoData || geoData.length === 0) {
        setSearchMessage("Adresse introuvable, essayez une adresse plus précise");
        setSearching(false);
        return;
      }

      const lat = geoData[0].lat;
      const lng = geoData[0].lon;

      const res = await fetch(`http://localhost:4000/offers/nearby?lat=${lat}&lng=${lng}`);
      const data = await res.json();
      setOffers(data.offers || []);

      if (!data.offers || data.offers.length === 0) {
        setSearchMessage("Aucune offre trouvée près de cette adresse");
      }
    } catch {
      setSearchMessage("Erreur lors de la recherche");
    } finally {
      setSearching(false);
    }
  };

  const handleReserve = async (offerId: string) => {
    const token = localStorage.getItem("token");
    if (!token) {
      setConfirmations((prev) => ({ ...prev, [offerId]: "Vous devez être connecté pour réserver" }));
      return;
    }

    setReserving(offerId);

    try {
      const res = await fetch("http://localhost:4000/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ offerId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setConfirmations((prev) => ({ ...prev, [offerId]: data.message || "Erreur lors de la réservation" }));
        return;
      }

      setConfirmations((prev) => ({ ...prev, [offerId]: "Réservation confirmée !" }));
      loadOffers();
    } catch {
      setConfirmations((prev) => ({ ...prev, [offerId]: "Impossible de contacter le serveur" }));
    } finally {
      setReserving(null);
    }
  };

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-3xl font-bold text-green-700 mb-6 text-center">
        Offres disponibles
      </h1>

      <div className="max-w-2xl mx-auto mb-6 flex gap-2">
        <input
          type="text"
          placeholder="Entrez une adresse pour voir les offres proches"
          value={addressInput}
          onChange={(e) => setAddressInput(e.target.value)}
          className="border border-gray-300 rounded p-2 flex-1"
        />
        <button
          onClick={handleSearchNearby}
          disabled={searching}
          className="bg-green-700 text-white rounded px-4 font-semibold hover:bg-green-800 disabled:bg-gray-300"
        >
          {searching ? "..." : "Chercher"}
        </button>
      </div>

      {searchMessage && (
        <p className="text-center text-gray-600 mb-4">{searchMessage}</p>
      )}

      {loading && <p className="text-center text-gray-500">Chargement...</p>}
      {error && <p className="text-center text-red-600">{error}</p>}
      {!loading && offers.length === 0 && !searchMessage && (
        <p className="text-center text-gray-500">Aucune offre disponible pour le moment.</p>
      )}

      <div className="grid gap-4 max-w-2xl mx-auto">
        {offers.map((offer) => {
          const percent = Math.round(
            ((offer.originalPrice - offer.discountedPrice) / offer.originalPrice) * 100
          );
          return (
            <div
              key={offer.id}
              className="border border-gray-200 rounded-lg p-4 shadow-sm flex flex-col gap-1"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-lg font-semibold">{offer.title}</h2>
                  <p className="text-sm text-gray-500">
                    {offer.merchant.name} — {offer.merchant.city}
                    {offer.distanceKm !== undefined && (
                      <span className="text-green-700 font-medium"> · {offer.distanceKm.toFixed(1)} km</span>
                    )}
                  </p>
                </div>
                <span className="bg-green-700 text-white text-xs font-bold px-2 py-1 rounded">
                  -{percent}%
                </span>
              </div>

              {offer.description && (
                <p className="text-sm text-gray-600">{offer.description}</p>
              )}

              <div className="flex items-baseline gap-2 mt-1">
                <span className="line-through text-gray-400 text-sm">
                  {offer.originalPrice.toFixed(2)} $
                </span>
                <span className="text-green-700 font-bold text-lg">
                  {offer.discountedPrice.toFixed(2)} $
                </span>
              </div>

              <p className="text-sm text-gray-600">
                Récupération : {formatTime(offer.pickupStart)} - {formatTime(offer.pickupEnd)}
              </p>
              <p className="text-sm text-gray-500">
                {offer.quantity} disponible{offer.quantity > 1 ? "s" : ""}
              </p>

              <button
                onClick={() => handleReserve(offer.id)}
                disabled={reserving === offer.id || offer.quantity < 1}
                className="mt-2 bg-green-700 text-white rounded p-2 font-semibold hover:bg-green-800 disabled:bg-gray-300"
              >
                {reserving === offer.id ? "Réservation..." : "Réserver"}
              </button>

              {confirmations[offer.id] && (
                <p className="text-sm text-green-700 mt-1">{confirmations[offer.id]}</p>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
