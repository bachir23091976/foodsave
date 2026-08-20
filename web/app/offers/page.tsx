"use client";

import { useEffect, useState } from "react";
import { Bebas_Neue, Space_Grotesk } from "next/font/google";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import NotificationBell from "../components/NotificationBell";
import LoyaltyBanner from "../components/LoyaltyBanner";
import FoodSaveImage from "../components/FoodSaveImage";
import ScrollReveal from "../components/ScrollReveal";
import { API_URL } from "../lib/api";

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
  distanceKm?: number;
  merchant: { id: string; name: string; address: string; city: string; type?: string };
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
    fetch(`${API_URL}/offers`)
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
    fetch(`${API_URL}/favorites`, { headers: { Authorization: "Bearer " + token } })
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
      const geoRes = await fetch("https://nominatim.openstreetmap.org/search?q=" + encodeURIComponent(addressInput) + "&format=json&limit=1");
      const geoData = await geoRes.json();
      if (!geoData || geoData.length === 0) {
        setSearchMessage("Adresse introuvable, essayez une adresse plus precise");
        setSearching(false);
        return;
      }
      const lat = geoData[0].lat;
      const lng = geoData[0].lon;
      const res = await fetch(`${API_URL}/offers/nearby?lat=` + lat + "&lng=" + lng);
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
      const res = await fetch(`${API_URL}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
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
    try {
      const res = await fetch(`${API_URL}/favorites${isFavorite ? "/remove" : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ merchantId }),
      });

      if (!res.ok) return;

      if (isFavorite) {
        setFavoriteMerchantIds((prev) => prev.filter((id) => id !== merchantId));
      } else {
        setFavoriteMerchantIds((prev) => [...prev, merchantId]);
      }
    } catch {
      // Network failure: leave favoriteMerchantIds untouched so the star
      // icon keeps reflecting the last known-good state instead of drifting
      // out of sync with the backend.
    }
  };

  return (
    <main className={body.className} style={{ backgroundColor: bg, color: "#F5F1E8", minHeight: "100vh" }}>
      <Navbar />

      <section className="px-6 pt-14 pb-6 text-center">
        <p className="text-xs tracking-[0.4em] uppercase mb-3" style={{ color: jade }}>
          Ce soir a Ottawa
        </p>
        <h1 className={display.className} style={{ fontSize: "clamp(2.2rem, 6vw, 4rem)" }}>
          OFFRES DISPONIBLES
        </h1>
      </section>

      <div className="max-w-2xl mx-auto px-6 flex justify-end mb-2">
        <NotificationBell />
      </div>

      <div className="max-w-2xl mx-auto px-6">
        <LoyaltyBanner />
      </div>

      <div className="max-w-2xl mx-auto px-6 mb-8 flex gap-2">
        <label htmlFor="offers-address-search" className="sr-only">Entrez une adresse pour voir les offres proches</label>
        <input
          id="offers-address-search"
          type="text"
          placeholder="Entrez une adresse pour voir les offres proches"
          value={addressInput}
          onChange={(e) => setAddressInput(e.target.value)}
          className="rounded-full px-5 py-3 outline-none flex-1"
          style={{ backgroundColor: "#0D1912", border: "1px solid rgba(255,255,255,0.15)", color: "#F5F1E8" }}
        />
        <button
          onClick={handleSearchNearby}
          disabled={searching}
          className="rounded-full px-6 font-bold uppercase tracking-wide text-xs"
          style={{ backgroundColor: amber, color: bg }}
        >
          {searching ? "..." : "Chercher"}
        </button>
      </div>

      {searchMessage && <p className="text-center mb-4" style={{ color: dim }}>{searchMessage}</p>}
      {loading && <p className="text-center" style={{ color: dim }}>Chargement...</p>}
      {error && <p className="text-center" style={{ color: "#FF6B6B" }}>{error}</p>}
      {!loading && offers.length === 0 && !searchMessage && (
        <p className="text-center" style={{ color: dim }}>Aucune offre disponible pour le moment.</p>
      )}

      <div className="grid gap-4 max-w-2xl mx-auto px-6 pb-20">
        {offers.map((offer, index) => {
          const percent = Math.round(((offer.originalPrice - offer.discountedPrice) / offer.originalPrice) * 100);
          const isFavorite = favoriteMerchantIds.includes(offer.merchant.id);
          return (
            <ScrollReveal key={offer.id} index={index}>
              <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "#0D1912", border: "1px solid rgba(255,255,255,0.1)" }}>
                <FoodSaveImage url={offer.imageUrl} alt={offer.title} variant="offer" merchantType={offer.merchant.type} />

                <div className="p-5 flex flex-col gap-1">
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-lg font-bold">{offer.title}</h2>
                      <p className="text-sm flex items-center gap-1" style={{ color: dim }}>
                        {offer.merchant.name} - {offer.merchant.city}
                        {offer.distanceKm !== undefined && (
                          <span style={{ color: jade }} className="font-medium"> - {offer.distanceKm.toFixed(1)} km</span>
                        )}
                        <button
                          onClick={() => toggleFavorite(offer.merchant.id)}
                          className="ml-1"
                          style={{ color: amber }}
                          aria-label="Ajouter aux favoris"
                        >
                          {isFavorite ? "[*]" : "[ ]"}
                        </button>
                      </p>
                    </div>
                    <span className="text-xs font-bold px-2 py-1 rounded" style={{ backgroundColor: amber, color: bg }}>
                      -{percent}%
                    </span>
                  </div>

                  {offer.description && <p className="text-sm" style={{ color: dim }}>{offer.description}</p>}

                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="line-through text-sm" style={{ color: dim }}>{offer.originalPrice.toFixed(2)} $</span>
                    <span className="font-bold text-lg" style={{ color: amber }}>{offer.discountedPrice.toFixed(2)} $</span>
                  </div>

                  <p className="text-sm" style={{ color: dim }}>
                    Recuperation : {formatTime(offer.pickupStart)} - {formatTime(offer.pickupEnd)}
                  </p>
                  <p className="text-sm" style={{ color: dim }}>
                    {offer.quantity} disponible{offer.quantity > 1 ? "s" : ""}
                  </p>

                  <button
                    onClick={() => handleReserve(offer.id)}
                    disabled={reserving === offer.id || offer.quantity < 1}
                    className="mt-3 rounded-full py-3 font-bold uppercase tracking-wide text-sm"
                    style={{ backgroundColor: jade, color: bg }}
                  >
                    {reserving === offer.id ? "Redirection..." : "Reserver"}
                  </button>

                  {confirmations[offer.id] && <p className="text-sm mt-1" style={{ color: "#FF6B6B" }}>{confirmations[offer.id]}</p>}
                </div>
              </div>
            </ScrollReveal>
          );
        })}
      </div>

      <Footer />
    </main>
  );
}
