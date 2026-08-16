"use client";

import { useEffect, useState } from "react";
import { Bebas_Neue, Space_Grotesk } from "next/font/google";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import ScrollReveal from "../components/ScrollReveal";
import { API_URL } from "../lib/api";

const display = Bebas_Neue({ subsets: ["latin"], weight: "400" });
const body = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });

const bg = "#06110C";
const amber = "#FFB100";
const jade = "#17C989";
const dim = "#8FA396";

const OPTIONS = [
  { value: "VEGETARIAN", label: "Végétarien" },
  { value: "VEGAN", label: "Végan" },
  { value: "HALAL", label: "Halal" },
  { value: "GLUTEN_FREE", label: "Sans gluten" },
  { value: "DAIRY_FREE", label: "Sans produits laitiers" },
  { value: "NUT_FREE", label: "Sans noix" },
];

export default function PreferencesPage() {
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  const loadPreferences = () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    fetch(`${API_URL}/users/dietary-preferences`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setSelected(data.dietaryPreferences || []))
      .catch(() => {});
  };

  useEffect(() => {
    loadPreferences();
  }, []);

  const toggleOption = (value: string) => {
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const handleSave = async () => {
    setMessage("");
    const token = localStorage.getItem("token");
    if (!token) {
      setMessage("Vous devez être connecté");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/users/dietary-preferences`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ dietaryPreferences: selected }),
      });

      if (!res.ok) {
        setMessage("Erreur lors de l'enregistrement");
        return;
      }

      setMessage("Préférences enregistrées !");
    } catch {
      setMessage("Impossible de contacter le serveur");
    }
  };

  return (
    <main className={body.className} style={{ backgroundColor: bg, color: "#F5F1E8", minHeight: "100vh" }}>
      <Navbar />

      <section className="px-6 pt-14 pb-6 text-center">
        <p className="text-xs tracking-[0.4em] uppercase mb-3" style={{ color: jade }}>
          Personnalisation
        </p>
        <h1 className={display.className} style={{ fontSize: "clamp(2.2rem, 6vw, 4rem)" }}>
          MES PRÉFÉRENCES
        </h1>
        <p className="mt-3 max-w-md mx-auto" style={{ color: dim }}>
          Selectionnez vos preferences alimentaires pour affiner les offres qui vous sont proposees.
        </p>
      </section>

      <div className="flex flex-col gap-3 w-full max-w-sm mx-auto px-6">
        {OPTIONS.map((opt, index) => {
          const checked = selected.includes(opt.value);
          return (
            <ScrollReveal key={opt.value} index={index}>
              <label
                className="flex items-center gap-3 rounded-2xl p-4 cursor-pointer"
                style={{
                  backgroundColor: "#0D1912",
                  border: checked ? `1px solid ${jade}` : "1px solid rgba(255,255,255,0.1)",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleOption(opt.value)}
                  className="w-5 h-5"
                  style={{ accentColor: jade }}
                />
                <span>{opt.label}</span>
              </label>
            </ScrollReveal>
          );
        })}
      </div>

      <div className="text-center px-6 pb-20">
        <button
          onClick={handleSave}
          className="mt-8 rounded-full px-8 py-3 font-bold uppercase tracking-wide text-sm"
          style={{ backgroundColor: amber, color: bg }}
        >
          Enregistrer mes préférences
        </button>

        {message && <p className="mt-4" style={{ color: dim }}>{message}</p>}
      </div>

      <Footer />
    </main>
  );
}
