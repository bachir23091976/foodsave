"use client";

import { useEffect, useState } from "react";
import NotificationBell from "../components/NotificationBell";
import LoyaltyBanner from "../components/LoyaltyBanner";

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
  distanceKm?: number;
  merchant: {
    id: string;
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
  const [favoriteMerchantIds, setFavoriteMerchantIds] = useState<string[]>([]);

  const loadOffers = () => {
    fetch("http://localhost:4000/offers")
      .then(function (res) { return res.json(); })
      .then(function (data) {
        setOffers(data.offers || []);
        setLoading(false);
      })
      .catch(function () {
        setError("Impossible de charger les offres");
        setLoading(false);
      });
  };

  const loadFavorites = () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    fetch("http://localhost:4000/favorites", {
      headers: { Authorization: "Bearer " + token },
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        const ids = (data.favorites || []).map(function (f: any) { return f.merchantId; });
        setFavoriteMerchantIds(ids);
      })
      .catch(function () {});
  };

  useEffect(() => {
    loadOffers();
    loadFavorites();
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
        "https://nominatim.openstreetmap.org/search?q=" + encodeURIComponent(addressInput) + "&format=json&limit=1"
      );
      const geoData = await geoRes.json();

      if (!geoData || geoData.length === 0) {
        setSearchMessage("Adresse introuvable, essayez une adresse plus precise");
        setSearching(false);
        return;
      }

      const lat = geoData[0].lat;
      const lng = geoData[0].lon;

      const res = await fetch("http://localhost:4000/offers/nearby?lat=" + lat + "&lng=" + lng);
      const data = await res.json();
      setOffers(data.offers || []);

      if (!data.offers || data.offers.length === 0) {
        setSearchMessage("Aucune offre trouvee pres de cette adresse");
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
      setConfirmations((prev) => ({ ...prev, [offerId]: "Vous devez etre connecte pour reserver" }));
      return;
    }

    setReserving(offerId);

    try {
      const res = await fetch("http://localhost:4000/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ offerId }),
      });

      const data = await res.json();

      if (!res.ok || !data.checkoutUrl) {
        setConfirmations((prev) => ({ ...prev, [offerId]: data.message || "Erreur lors de la reservation" }));
        setReserving(null);
        return;
      }

      window.location.href = data.checkoutUrl;
    } catch {
      setConfirmations((prev) => ({ ...prev, [offerId]: "Impossible de contacter le serveur" }));
      setReserving(null);
    }
  };

  const toggleFavorite = async (merchantId: string) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const isFavorite = favoriteMerchantIds.includes(merchantId);

    if (isFavorite) {
      await fetch("http://localhost:4000/favorites/remove", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ merchantId }),
      });
      setFavoriteMerchantIds((prev) => prev.filter((id) => id !== merchantId));
    } else {
      await fetch("http://localhost:4000/favorites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ merchantId }),
      });
      setFavoriteMerchantIds((prev) => [...prev, merchantId]);
    }
  };

  return (
    <main className="min-h-screen p-8">
      <div className="flex justify-between items-center max-w-2xl mx-auto mb-6">
        <h1 className="text-3xl font-bold text-green-700 text-center flex-1">
          Offres disponibles
        </h1>
        <NotificationBell />
      </div>

      <LoyaltyBanner />

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
          const isFavorite = favoriteMerchantIds.includes(offer.merchant.id);
          return (
            <div
              key={offer.id}
              className="border border-gray-200 rounded-lg overflow-hidden shadow-sm flex flex-col gap-1"
            >
              {offer.imageUrl && (
                <img
                  src={offer.imageUrl}
                  alt={offer.title}
                  className="w-full h-40 object-cover"
                />
              )}

              <div className="p-4 flex flex-col gap-1">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-lg font-semibold">{offer.title}</h2>
                    <p className="text-sm text-gray-500 flex items-center gap-1">
                      {offer.merchant.name} - {offer.merchant.city}
                      {offer.distanceKm !== undefined && (
                        <span className="text-green-700 font-medium"> - {offer.distanceKm.toFixed(1)} km</span>
                      )}
                      <button
                        onClick={() => toggleFavorite(offer.merchant.id)}
                        className="ml-1 text-lg"
                        aria-label="Ajouter aux favoris"
                      >
                        {isFavorite ? "[*]" : "[ ]"}
                      </button>
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
                  Recuperation : {formatTime(offer.pickupStart)} - {formatTime(offer.pickupEnd)}
                </p>
                <p className="text-sm text-gray-500">
                  {offer.quantity} disponible{offer.quantity > 1 ? "s" : ""}
                </p>

                <button
                  onClick={() => handleReserve(offer.id)}
                  disabled={reserving === offer.id || offer.quantity < 1}
                  className="mt-2 bg-green-700 text-white rounded p-2 font-semibold hover:bg-green-800 disabled:bg-gray-300"
                >
                  {reserving === offer.id ? "Redirection..." : "Reserver"}
                </button>

                {confirmations[offer.id] && (
                  <p className="text-sm text-red-600 mt-1">{confirmations[offer.id]}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
