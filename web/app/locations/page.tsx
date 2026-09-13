"use client";
import { useLocale } from "../lib/i18n/LocaleProvider";


import { useEffect, useState } from "react";
import s from "../components/public.module.css";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import ScrollReveal from "../components/ScrollReveal";
import { API_URL } from "../lib/api";




const bg = "#faf8f2";
const amber = "#d8ee97";
const jade = "#215d43";
const dim = "#59685e";

const inputStyle = {
  backgroundColor: "#ffffff",
  border: "1px solid #bccbbb",
  color: "#183e32",
};

interface SavedLocation {
  id: string;
  label: string;
  address: string;
}

export default function LocationsPage() {
  const { t, message: msg } = useLocale();
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const loadLocations = () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    fetch(`${API_URL}/locations`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setLocations(data.locations || []))
      .catch(() => {});
  };

  useEffect(() => {
    loadLocations();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    const token = localStorage.getItem("token");
    if (!token) {
      setMessage("ui.you_must_be_signed_in");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/locations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ label, address }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.message || "ui.something_went_wrong");
        setLoading(false);
        return;
      }

      setMessage("ui.address_saved");
      setLabel("");
      setAddress("");
      loadLocations();
    } catch {
      setMessage("ui.unable_to_contact_the_server");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (locationId: string) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    await fetch(`${API_URL}/locations/delete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ locationId }),
    });

    loadLocations();
  };

  return (
    <main className={s.page + " " + s.accountPage} style={{ backgroundColor: bg, color: "#183e32", minHeight: "100vh" }}>
      <Navbar />

      <section className="px-6 pt-14 pb-6 text-center">
        <p className="text-xs tracking-[0.4em] uppercase mb-3" style={{ color: jade }}>
          {t("ui.nearby")}</p>
        <h1 className={s.heading} style={{ fontSize: "clamp(2.2rem, 6vw, 4rem)" }}>
          {t("ui.my_addresses")}</h1>
        <p className="mt-3 max-w-md mx-auto" style={{ color: dim }}>
          {t("ui.save_your_addresses_to_find_them_easily_later")}</p>
      </section>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-sm mx-auto px-6 mb-10">
        <label htmlFor="location-label" className="sr-only">{t("ui.name_eg_home_work")}</label>
        <input
          id="location-label"
          type="text"
          placeholder={t("ui.name_eg_home_work")}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="rounded-full px-5 py-3 outline-none"
          style={inputStyle}
          required
        />
        <label htmlFor="location-address" className="sr-only">{t("ui.address")}</label>
        <input
          id="location-address"
          type="text"
          placeholder={t("ui.address")}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="rounded-full px-5 py-3 outline-none"
          style={inputStyle}
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-full px-6 py-3 font-bold uppercase tracking-wide text-sm"
          style={{ backgroundColor: amber, color: "#183e32", opacity: loading ? 0.6 : 1 }}
        >
          {loading ? t("ui.saving") : t("ui.save_this_address")}
        </button>
      </form>

      {message && <p className="text-center mb-4" style={{ color: dim }}>{msg(message)}</p>}

      <div className="w-full max-w-sm mx-auto px-6 pb-20 flex flex-col gap-3">
        {locations.map((loc, index) => (
          <ScrollReveal key={loc.id} index={index}>
            <div
              className="flex justify-between items-center rounded-2xl p-4"
              style={{ backgroundColor: "#ffffff", border: "1px solid #dce2d8" }}
            >
              <div>
                <p className="font-bold">{loc.label}</p>
                <p className="text-sm" style={{ color: dim }}>{loc.address}</p>
              </div>
              <button
                onClick={() => handleDelete(loc.id)}
                className="text-sm"
                style={{ color: "#9d3529" }}
              >
                {t("ui.delete")}</button>
            </div>
          </ScrollReveal>
        ))}
      </div>

      <Footer />
    </main>
  );
}
