"use client";
import { useLocale } from "../lib/i18n/LocaleProvider";

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
  { value: "TOUT", label: "ui.all" },
  { value: "EPICERIE", label: "ui.grocery" },
  { value: "PLATS_PREPARES", label: "ui.prepared_meals" },
  { value: "SANDWICHS", label: "ui.sandwiches" },
  { value: "BOULANGERIE_PATISSERIE", label: "ui.bakery_pastries" },
  { value: "PIZZA_FAST_FOOD", label: "ui.pizza_fast_food" },
  { value: "FRUITS_LEGUMES", label: "ui.fruit_and_vegetables" },
  { value: "BOISSONS", label: "ui.drinks" },
  { value: "AUTRE", label: "ui.other" },
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
  const { t, text: tr, message: msg, money, number, count, intlLocale } = useLocale();
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
        setError("ui.unable_to_load_offers");
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
    return date.toLocaleTimeString(intlLocale, { hour: "2-digit", minute: "2-digit" });
  };

  const handleSearchNearby = async () => {
    if (!addressInput.trim()) return;
    setSearching(true);
    setSearchMessage("");
    try {
      const geoRes = await fetch("https://nominatim.openstreetmap.org/search?q=" + encodeURIComponent(addressInput) + "&format=json&limit=1");
      const geoData = await geoRes.json();
      if (!geoData || geoData.length === 0) {
        setSearchMessage("ui.address_not_found_try_a_more_specific_address");
        setSearching(false);
        return;
      }
      const lat = geoData[0].lat;
      const lng = geoData[0].lon;
      const res = await fetch(`${API_URL}/offers/nearby?lat=` + lat + "&lng=" + lng);
      const data = await res.json();
      setOffers(data.offers || []);
      if (!data.offers || data.offers.length === 0) {
        setSearchMessage("ui.no_offers_found_near_this_address");
      }
    } catch {
      setSearchMessage("ui.unable_to_complete_the_search");
    } finally {
      setSearching(false);
    }
  };
  const handleUseLocation = () => {
    if (!navigator.geolocation) {
      setSearchMessage("ui.geolocation_is_not_available_on_this_device");
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
            setSearchMessage("ui.no_offers_found_near_your_location");
          }
        } catch {
          setSearchMessage("ui.unable_to_search_using_your_location");
        } finally {
          setLocating(false);
        }
      },
      () => {
        setSearchMessage(
          "ui.location_denied_or_unavailable_you_can_enter_an_address"
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
      setConfirmations((prev) => ({ ...prev, [offerId]: "ui.sign_in_to_reserve" }));
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
        setConfirmations((prev) => ({ ...prev, [offerId]: data.message || "ui.unable_to_make_the_reservation" }));
        setReserving(null);
        return;
      }
      window.location.href = data.checkoutUrl;
    } catch {
      setConfirmations((prev) => ({ ...prev, [offerId]: "ui.unable_to_contact_the_server" }));
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
          <div><p className={s.eyebrow}>{t("ui.tonight_in_ottawa")}</p><h1 className={s.title}>{t("ui.save_good_food")}<br />{t("ui.close_to_home")}</h1><p className={s.lede}>{t("ui.discover_surplus_food_from_local_businesses_at_reduced_prices")}</p></div>
          <div className={s.accountActions}><Link href={isMerchant ? "/merchant/reservations" : "/reservations"} className={s.secondary}>{isMerchant ? t("ui.customer_reservations") : t("ui.my_reservations")}</Link><NotificationBell /></div>
        </section>
        <LoyaltyBanner />
        <section className={s.search} aria-label={t("ui.search_offers_by_location")}>
          <label htmlFor="offers-address-search">{t("ui.where_would_you_like_to_pick_up_your_meal")}</label>
          <div className={s.searchRow}>
            <input id="offers-address-search" type="text" placeholder={t("ui.your_address_or_neighbourhood")} value={addressInput} onChange={(e) => setAddressInput(e.target.value)} />
            <button type="button" onClick={handleSearchNearby} disabled={searching} className={s.button}>{searching ? t("ui.searching") : t("ui.search")}</button>
            <button type="button" onClick={handleUseLocation} disabled={locating || searching} className={s.secondary}><span aria-hidden="true">⌖</span>{locating ? t("ui.locating") : t("ui.use_my_location")}</button>
          </div>
          <p className={s.searchNote}>{t("ui.enter_an_address_to_explore_nearby_offers")}</p>
          {searchMessage && <p role="status" className={s.searchNote}>{msg(searchMessage)}</p>}
        </section>
        <section className={s.filters} aria-label={t("ui.offer_categories")}><div className={s.filterRow}>
          {OFFER_CATEGORIES.map(category => <button key={category.value} type="button" onClick={() => setSelectedCategory(category.value)} aria-pressed={selectedCategory === category.value} className={s.chip}>{tr(category.label)}</button>)}
        </div></section>
        <section className={s.results} aria-label={t("ui.available_offers")} aria-busy={loading || searching || locating}>
          {loading && <p className={s.empty} role="status">{t("ui.finding_available_offers")}</p>}
          {error && <p className={s.alert} role="alert">{msg(error)}</p>}
          {!loading && !error && !searching && !locating && filteredOffers.length === 0 && <div className={s.empty}>
            <svg width="72" height="72" viewBox="0 0 72 72" fill="none" aria-hidden="true"><circle cx="36" cy="36" r="36" fill="#e0eacb" /><path d="m19 30 5 25h24l5-25H19Zm10 0v-5a7 7 0 0 1 14 0v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M31 42c6 0 10-6 10-6 1 8-3 13-9 12m-1 1 9-12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            <h2>{offers.length === 0 ? t("ui.no_offers_near_you_right_now") : t("ui.no_offers_in_this_category_right_now")}</h2>
            <p>{t("ui.new_offers_may_appear_throughout_the_day")}</p>
            {selectedCategory !== "TOUT" && <button type="button" className={s.secondary} style={{ marginTop: 22 }} onClick={() => setSelectedCategory("TOUT")}>{t("ui.view_all_categories")}</button>}
          </div>}
          {!loading && !error && filteredOffers.length > 0 && <p className={s.resultsLabel}>{count("offers.count", "offers.countPlural", filteredOffers.length)}</p>}
          <div className={s.offerGrid}>{filteredOffers.map(offer => {
            const percent = Math.round(((offer.originalPrice - offer.discountedPrice) / offer.originalPrice) * 100);
            const isFavorite = favoriteMerchantIds.includes(offer.merchant.id);
            return <article key={offer.id} className={s.card}>
              <FoodSaveImage url={offer.imageUrl} alt={offer.title} variant="offer" merchantType={offer.merchant.type} />
              <div className={s.cardBody}>
                <div className={s.cardTop}><div><h2>{offer.title}</h2><p className={s.merchant}>{offer.merchant.name} · {offer.merchant.city}{offer.distanceKm !== undefined && <span>· {number(offer.distanceKm, 1)} km</span>}</p></div><span className={s.badge}>−{percent} %</span></div>
                {offer.description && <p className={s.muted} style={{ fontSize: 14, overflowWrap: "anywhere" }}>{offer.description}</p>}
                <div className={s.cardTop}><p className={s.price}><strong>{money(offer.discountedPrice)}</strong><del>{money(offer.originalPrice)}</del></p><button type="button" className={s.favorite} onClick={() => toggleFavorite(offer.merchant.id)} aria-pressed={isFavorite} aria-label={isFavorite ? t("ui.remove_from_favourites") : t("ui.add_to_favourites")}>{isFavorite ? "★" : "☆"}</button></div>
                <p className={s.pickup}>{t("ui.pickup")}{" "}{formatTime(offer.pickupStart)} – {formatTime(offer.pickupEnd)}<br />{count("offers.available", "offers.availablePlural", offer.quantity)}</p>
                <p className={s.muted} style={{ fontSize: 12 }}>{t("ui.free_cancellation_up_to_60_minutes_before_pickup")}</p>
                <button type="button" onClick={() => handleReserve(offer.id)} disabled={reserving === offer.id || offer.quantity < 1} className={s.button}>{reserving === offer.id ? t("ui.redirecting") : t("ui.reserve")}</button>
                <a href={"https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(offer.merchant.address + ", " + offer.merchant.city)} target="_blank" rel="noopener noreferrer" className={s.quiet}>{t("ui.directions_")}</a>
                {confirmations[offer.id] && <p role="alert" className={s.alert}>{msg(confirmations[offer.id])}</p>}
              </div>
            </article>;
          })}</div>
        </section>
      </div>
      <Footer />
    </main>
  );
}
