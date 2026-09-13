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

const OPTIONS = [
  { value: "VEGETARIAN", label: "ui.vegetarian" },
  { value: "VEGAN", label: "ui.vegan" },
  { value: "HALAL", label: "ui.halal" },
  { value: "GLUTEN_FREE", label: "ui.glutenfree" },
  { value: "DAIRY_FREE", label: "ui.dairyfree" },
  { value: "NUT_FREE", label: "ui.nutfree" },
];

export default function PreferencesPage() {
  const { t, text: tr, message: msg } = useLocale();
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
      setMessage("ui.you_must_be_signed_in");
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
        setMessage("ui.unable_to_save_your_preferences");
        return;
      }

      setMessage("ui.preferences_saved");
    } catch {
      setMessage("ui.unable_to_contact_the_server");
    }
  };

  return (
    <main className={s.page + " " + s.accountPage} style={{ backgroundColor: bg, color: "#183e32", minHeight: "100vh" }}>
      <Navbar />

      <section className="px-6 pt-14 pb-6 text-center">
        <p className="text-xs tracking-[0.4em] uppercase mb-3" style={{ color: jade }}>
          {t("ui.personalization")}</p>
        <h1 className={s.heading} style={{ fontSize: "clamp(2.2rem, 6vw, 4rem)" }}>
          {t("ui.my_preferences")}</h1>
        <p className="mt-3 max-w-md mx-auto" style={{ color: dim }}>
          {t("ui.select_your_dietary_preferences_to_refine_the_offers_suggested")}</p>
      </section>

      <div className="flex flex-col gap-3 w-full max-w-sm mx-auto px-6">
        {OPTIONS.map((opt, index) => {
          const checked = selected.includes(opt.value);
          return (
            <ScrollReveal key={opt.value} index={index}>
              <label
                className="flex items-center gap-3 rounded-2xl p-4 cursor-pointer"
                style={{
                  backgroundColor: "#ffffff",
                  border: checked ? `1px solid ${jade}` : "1px solid #dce2d8",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleOption(opt.value)}
                  className="w-5 h-5"
                  style={{ accentColor: jade }}
                />
                <span>{tr(opt.label)}</span>
              </label>
            </ScrollReveal>
          );
        })}
      </div>

      <div className="text-center px-6 pb-20">
        <button
          onClick={handleSave}
          className="mt-8 rounded-full px-8 py-3 font-bold uppercase tracking-wide text-sm"
          style={{ backgroundColor: amber, color: "#183e32" }}
        >
          {t("ui.save_my_preferences")}</button>

        {message && <p className="mt-4" style={{ color: dim }}>{msg(message)}</p>}
      </div>

      <Footer />
    </main>
  );
}
