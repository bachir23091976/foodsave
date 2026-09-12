"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import NotificationBell from "../components/NotificationBell";
import LoyaltyBanner from "../components/LoyaltyBanner";
import FoodSaveImage from "../components/FoodSaveImage";
import { API_URL } from "../lib/api";

import s from "../components/public.module.css";

interface Offer {
  id: string;
  title: string;
  description: string | null;
  category: string;
  imageUrl: string | null;
  originalPrice: number;
  discountedPrice: number;
  quantity: number;
  pickupStart: string;
  pickupEnd: string;
  distanceKm?: number;
  merchant: { id: string; name: string; address: string; city: string; type?: string };
}

const OFFER_CATEGORIES = [
  { value: "TOUT", label: "Tout" },
  { value: "EPICERIE", label: "\u00c9picerie" },
  { value: "PLATS_PREPARES", label: "Plats pr\u00e9par\u00e9s" },
  { value: "SANDWICHS", label: "Sandwichs" },
  { value: "BOULANGERIE_PATISSERIE", label: "Boulangerie / P\u00e2tisserie" },
  { value: "PIZZA_FAST_FOOD", label: "Pizza / Fast-food" },
  { value: "FRUITS_LEGUMES", label: "Fruits et l\u00e9gumes" },
  { value: "BOISSONS", label: "Boissons" },
  { value: "AUTRE", label: "Autre" },
];

function getRoleFromToken(token: string): string | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(window.atob(padded))?.role || null;
  } catch {
    return null;
  }
}

export default function OffersPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reserving, setReserving] = useState<string | null>(null);
  const [confirmations, setConfirmations] = useState<Record<string, string>>({});
  const [addressInput, setAddressInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");
  const [favoriteMerchantIds, setFavoriteMerchantIds] = useState<string[]>([]);
  const [isMerchant, setIsMerchant] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("TOUT");

  const loadOffers = () => {
    fetch(`${API_URL}/offers`)
      .then(function (res) { if (!res.ok) throw new Error("Offers unavailable"); return res.json(); })
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

    const token = localStorage.getItem("token");
    const role = token ? getRoleFromToken(token) : null;
    setIsMerchant(role === "MERCHANT" || role === "ADMIN");
    if (!token) return;

    fetch(`${API_URL}/locations`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        const firstLocation = data.locations?.[0];
        if (firstLocation?.address) {
          setAddressInput(firstLocation.address);
        }
      })
      .catch(() => {});
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
        setSearchMessage("Adresse introuvable, essayez une adresse plus précise");
        setSearching(false);
        return;
      }
      const lat = geoData[0].lat;
      const lng = geoData[0].lon;
      const res = await fetch(`${API_URL}/offers/nearby?lat=` + lat + "&lng=" + lng);
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
  const handleUseLocation = () => {
    if (!navigator.geolocation) {
      setSearchMessage("La géolocalisation n'est pas disponible sur cet appareil");
      return;
    }

    setLocating(true);
    setSearchMessage("");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const res = await fetch(
            `${API_URL}/offers/nearby?lat=${latitude}&lng=${longitude}`
          );
          const data = await res.json();

          setOffers(data.offers || []);
          if (!data.offers || data.offers.length === 0) {
            setSearchMessage("Aucune offre trouvée près de votre position");
          }
        } catch {
          setSearchMessage("Erreur lors de la recherche par GPS");
        } finally {
          setLocating(false);
        }
      },
      () => {
        setSearchMessage(
          "Position refusée ou indisponible. Vous pouvez saisir une adresse."
        );
        setLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  };
  const handleReserve = async (offerId: string) => {
    const token = localStorage.getItem("token");
    if (!token) {
      setConfirmations((prev) => ({ ...prev, [offerId]: "Vous devez être connecté pour réserver" }));
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
        setConfirmations((prev) => ({ ...prev, [offerId]: data.message || "Erreur lors de la réservation" }));
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

  const filteredOffers =
    selectedCategory === "TOUT"
      ? offers
      : offers.filter((offer) => offer.category === selectedCategory);

  return (
    <main className={s.page}>
      <Navbar />
      <div className={s.container}>
        <section className={s.marketIntro}>
          <div><p className={s.eyebrow}>Ce soir à Ottawa</p><h1 className={s.title}>Sauvez de bons repas<br />près de chez vous</h1><p className={s.lede}>Découvrez les invendus de commerces locaux à prix réduit.</p></div>
          <div className={s.accountActions}><Link href={isMerchant ? "/merchant/reservations" : "/reservations"} className={s.secondary}>{isMerchant ? "Réservations clients" : "Mes réservations"}</Link><NotificationBell /></div>
        </section>
        <LoyaltyBanner />
        <section className={s.search} aria-label="Rechercher des offres par lieu">
          <label htmlFor="offers-address-search">Où souhaitez-vous récupérer votre repas ?</label>
          <div className={s.searchRow}>
            <input id="offers-address-search" type="text" placeholder="Votre adresse ou votre quartier" value={addressInput} onChange={(e) => setAddressInput(e.target.value)} />
            <button type="button" onClick={handleSearchNearby} disabled={searching} className={s.button}>{searching ? "Recherche…" : "Chercher"}</button>
            <button type="button" onClick={handleUseLocation} disabled={locating || searching} className={s.secondary}><span aria-hidden="true">⌖</span>{locating ? "Localisation…" : "Utiliser ma position"}</button>
          </div>
          <p className={s.searchNote}>Une adresse suffit pour explorer les offres à proximité.</p>
          {searchMessage && <p role="status" className={s.searchNote}>{searchMessage}</p>}
        </section>
        <section className={s.filters} aria-label="Catégories d’offres"><div className={s.filterRow}>
          {OFFER_CATEGORIES.map(category => <button key={category.value} type="button" onClick={() => setSelectedCategory(category.value)} aria-pressed={selectedCategory === category.value} className={s.chip}>{category.label}</button>)}
        </div></section>
        <section className={s.results} aria-label="Offres disponibles" aria-busy={loading || searching || locating}>
          {loading && <p className={s.empty} role="status">Recherche des offres disponibles…</p>}
          {error && <p className={s.alert} role="alert">{error}</p>}
          {!loading && !error && !searching && !locating && filteredOffers.length === 0 && <div className={s.empty}>
            <svg width="72" height="72" viewBox="0 0 72 72" fill="none" aria-hidden="true"><circle cx="36" cy="36" r="36" fill="#e0eacb" /><path d="m19 30 5 25h24l5-25H19Zm10 0v-5a7 7 0 0 1 14 0v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M31 42c6 0 10-6 10-6 1 8-3 13-9 12m-1 1 9-12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            <h2>{offers.length === 0 ? "Aucune offre près de vous pour le moment." : "Aucune offre dans cette catégorie pour le moment."}</h2>
            <p>De nouvelles offres peuvent apparaître au cours de la journée.</p>
            {selectedCategory !== "TOUT" && <button type="button" className={s.secondary} style={{ marginTop: 22 }} onClick={() => setSelectedCategory("TOUT")}>Voir toutes les catégories</button>}
          </div>}
          {!loading && !error && filteredOffers.length > 0 && <p className={s.resultsLabel}>{filteredOffers.length} offre{filteredOffers.length > 1 ? "s" : ""} à découvrir · Vérifiez le créneau de récupération</p>}
          <div className={s.offerGrid}>{filteredOffers.map(offer => {
            const percent = Math.round(((offer.originalPrice - offer.discountedPrice) / offer.originalPrice) * 100);
            const isFavorite = favoriteMerchantIds.includes(offer.merchant.id);
            return <article key={offer.id} className={s.card}>
              <FoodSaveImage url={offer.imageUrl} alt={offer.title} variant="offer" merchantType={offer.merchant.type} />
              <div className={s.cardBody}>
                <div className={s.cardTop}><div><h2>{offer.title}</h2><p className={s.merchant}>{offer.merchant.name} · {offer.merchant.city}{offer.distanceKm !== undefined && <span>· {offer.distanceKm.toFixed(1)} km</span>}</p></div><span className={s.badge}>−{percent} %</span></div>
                {offer.description && <p className={s.muted} style={{ fontSize: 14, overflowWrap: "anywhere" }}>{offer.description}</p>}
                <div className={s.cardTop}><p className={s.price}><strong>{offer.discountedPrice.toFixed(2)} $</strong><del>{offer.originalPrice.toFixed(2)} $</del></p><button type="button" className={s.favorite} onClick={() => toggleFavorite(offer.merchant.id)} aria-pressed={isFavorite} aria-label={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}>{isFavorite ? "★" : "☆"}</button></div>
                <p className={s.pickup}>Récupération : {formatTime(offer.pickupStart)} – {formatTime(offer.pickupEnd)}<br />{offer.quantity} disponible{offer.quantity > 1 ? "s" : ""}</p>
                <p className={s.muted} style={{ fontSize: 12 }}>Annulation gratuite jusqu’à 60 minutes avant la récupération.</p>
                <button type="button" onClick={() => handleReserve(offer.id)} disabled={reserving === offer.id || offer.quantity < 1} className={s.button}>{reserving === offer.id ? "Redirection…" : "Réserver"}</button>
                <a href={"https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(offer.merchant.address + ", " + offer.merchant.city)} target="_blank" rel="noopener noreferrer" className={s.quiet}>Itinéraire ↗</a>
                {confirmations[offer.id] && <p role="alert" className={s.alert}>{confirmations[offer.id]}</p>}
              </div>
            </article>;
          })}</div>
        </section>
      </div>
      <Footer />
    </main>
  );
}
