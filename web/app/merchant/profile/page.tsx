"use client";

import { useEffect, useState } from "react";
import { Bebas_Neue, Space_Grotesk } from "next/font/google";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import FoodSaveImage from "../../components/FoodSaveImage";
import { API_URL } from "../../lib/api";

const display = Bebas_Neue({ subsets: ["latin"], weight: "400" });
const body = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });

const bg = "#06110C";
const amber = "#FFB100";
const jade = "#17C989";
const dim = "#8FA396";

const inputStyle = {
  backgroundColor: "#0D1912",
  border: "1px solid rgba(255,255,255,0.15)",
  color: "#F5F1E8",
};

interface Merchant {
  id: string;
  name: string;
  type: string;
  description: string | null;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  phone: string | null;
  stripeAccountId: string | null;
}

export default function MerchantProfilePage() {
  const [name, setName] = useState("");
  const [type, setType] = useState("RESTAURANT");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("Ontario");
  const [postalCode, setPostalCode] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [loadingMerchant, setLoadingMerchant] = useState(true);
  const [connectingStripe, setConnectingStripe] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoadingMerchant(false);
      return;
    }

    fetch(`${API_URL}/merchants/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.status === 404 ? null : res.json()))
      .then((data) => {
        if (data?.merchant) {
          setMerchant(data.merchant);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingMerchant(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");

    const token = localStorage.getItem("token");
    if (!token) {
      setMessage("Vous devez être connecté");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/merchants`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, type, description, address, city, province, postalCode, phone }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.message || "Une erreur est survenue");
        return;
      }

      setMessage("Profil de commerce créé avec succès !");
      setMerchant(data.merchant);
    } catch {
      setMessage("Impossible de contacter le serveur");
    }
  };

  const handleConnectStripe = async () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    setConnectingStripe(true);

    try {
      const res = await fetch(`${API_URL}/merchants/connect-stripe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });

      const data = await res.json();

      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setMessage(data.message || "Erreur lors de la connexion à Stripe");
      }
    } catch {
      setMessage("Impossible de contacter le serveur");
    } finally {
      setConnectingStripe(false);
    }
  };

  return (
    <main className={body.className} style={{ backgroundColor: bg, color: "#F5F1E8", minHeight: "100vh" }}>
      <Navbar />

      <section className="px-6 py-16 max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-start">
        <div>
          <p className="text-xs tracking-[0.4em] uppercase mb-4" style={{ color: jade }}>
            Espace commerçant
          </p>
          <h1 className={display.className} style={{ fontSize: "clamp(2.2rem, 6vw, 3.8rem)", lineHeight: 1 }}>
            GÉREZ VOTRE
            <br />
            <span style={{ color: amber }}>COMMERCE</span>
          </h1>
          {loadingMerchant ? (
            <p className="mt-4" style={{ color: dim }}>Chargement...</p>
          ) : merchant ? (
            <>
              <p className="mt-4" style={{ color: dim }}>
                Voici les informations de votre commerce enregistrées sur FoodSave.
              </p>

              <div
                className="mt-8 rounded-2xl p-5 flex flex-col gap-1"
                style={{ backgroundColor: "#0D1912", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                <p className="font-bold text-lg">{merchant.name}</p>
                <p className="text-sm" style={{ color: dim }}>{merchant.type}</p>
                {merchant.description && (
                  <p className="text-sm mt-1" style={{ color: dim }}>{merchant.description}</p>
                )}
                <p className="text-sm mt-2" style={{ color: dim }}>
                  {merchant.address}, {merchant.city}, {merchant.province} {merchant.postalCode}
                </p>
                {merchant.phone && <p className="text-sm" style={{ color: dim }}>{merchant.phone}</p>}
              </div>
            </>
          ) : (
            <>
              <p className="mt-4" style={{ color: dim }}>
                Créez votre profil commerce pour commencer à publier vos surplus sur FoodSave.
              </p>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-8">
            <label htmlFor="merchant-name" className="sr-only">Nom du commerce</label>
            <input
              id="merchant-name"
              type="text"
              placeholder="Nom du commerce"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-full px-5 py-3 outline-none"
              style={inputStyle}
              required
            />

            <label htmlFor="merchant-type" className="sr-only">Type de commerce</label>
            <select
              id="merchant-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="rounded-full px-5 py-3 outline-none"
              style={inputStyle}
            >
              <option value="RESTAURANT">Restaurant</option>
              <option value="CAFE">Café</option>
              <option value="BAKERY">Boulangerie</option>
              <option value="GROCERY">Épicerie</option>
              <option value="SUPERMARKET">Grande surface</option>
              <option value="HOTEL">Hôtel</option>
              <option value="OTHER">Autre</option>
            </select>

            <label htmlFor="merchant-description" className="sr-only">Description (optionnel)</label>
            <textarea
              id="merchant-description"
              placeholder="Description (optionnel)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-2xl px-5 py-3 outline-none"
              style={inputStyle}
            />

            <label htmlFor="merchant-address" className="sr-only">Adresse</label>
            <input
              id="merchant-address"
              type="text"
              placeholder="Adresse"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="rounded-full px-5 py-3 outline-none"
              style={inputStyle}
              required
            />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="merchant-city" className="sr-only">Ville</label>
                <input
                  id="merchant-city"
                  type="text"
                  placeholder="Ville"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="rounded-full px-5 py-3 outline-none w-full"
                  style={inputStyle}
                  required
                />
              </div>
              <div>
                <label htmlFor="merchant-province" className="sr-only">Province</label>
                <input
                  id="merchant-province"
                  type="text"
                  placeholder="Province"
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  className="rounded-full px-5 py-3 outline-none w-full"
                  style={inputStyle}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="merchant-postalcode" className="sr-only">Code postal</label>
                <input
                  id="merchant-postalcode"
                  type="text"
                  placeholder="Code postal"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  className="rounded-full px-5 py-3 outline-none w-full"
                  style={inputStyle}
                  required
                />
              </div>
              <div>
              <label htmlFor="merchant-phone" className="sr-only">Téléphone (optionnel)</label>
              <input
                id="merchant-phone"
                type="text"
                placeholder="Téléphone (optionnel)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="rounded-full px-5 py-3 outline-none w-full"
                style={inputStyle}
              />
              </div>
            </div>

            <button
              type="submit"
              className="rounded-full px-6 py-3 font-bold uppercase tracking-wide text-sm mt-2"
              style={{ backgroundColor: amber, color: bg }}
            >
              Créer mon profil
                </button>
              </form>
            </>
          )}

          {message && <p className="mt-4" style={{ color: dim }}>{message}</p>}

          <div
            className="mt-6 rounded-2xl p-5 text-sm"
            style={{ backgroundColor: "#0D1912", border: "1px solid rgba(23,201,137,0.3)", color: "#F5F1E8" }}
          >
            <span style={{ color: jade }} className="font-bold">🎁 Programme de fidélité — </span>
            <span style={{ color: dim }}>
              FoodSave offre des réductions de fidélité à vos clients réguliers, entièrement financées par notre
              commission — sans aucun coût pour vous. Ça vous aide à fidéliser une clientèle qui revient régulièrement !
            </span>
          </div>

          {merchant && (
            merchant.stripeAccountId ? (
              <p className="mt-4 font-bold" style={{ color: jade }}>
                ✓ Compte Stripe connecté
              </p>
            ) : (
              <button
                onClick={handleConnectStripe}
                disabled={connectingStripe}
                className="mt-4 rounded-full px-6 py-3 font-bold uppercase tracking-wide text-sm"
                style={{ backgroundColor: jade, color: bg }}
              >
                {connectingStripe ? "Connexion..." : "Connecter mon compte Stripe"}
              </button>
            )
          )}
        </div>

        <div className="hidden md:block sticky top-24">
          <FoodSaveImage url={null} alt={merchant?.name || name || "Votre commerce"} variant="hero" merchantType={merchant?.type || type} className="rounded-2xl" />
          <p className="mt-4 text-sm text-center" style={{ color: dim }}>
            Un aperçu qui s adapte au type de commerce que vous choisissez.
          </p>
        </div>
      </section>

      <Footer />
    </main>
  );
}
