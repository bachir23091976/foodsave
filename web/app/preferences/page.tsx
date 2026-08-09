"use client";

import { useEffect, useState } from "react";

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

    fetch("http://localhost:4000/users/dietary-preferences", {
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
      const res = await fetch("http://localhost:4000/users/dietary-preferences", {
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
    <main className="min-h-screen flex flex-col items-center p-8">
      <h1 className="text-3xl font-bold text-green-700 mb-6">
        Mes préférences alimentaires
      </h1>

      <div className="flex flex-col gap-3 w-full max-w-sm">
        {OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className="flex items-center gap-3 border border-gray-200 rounded p-3 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={selected.includes(opt.value)}
              onChange={() => toggleOption(opt.value)}
              className="w-5 h-5"
            />
            {opt.label}
          </label>
        ))}
      </div>

      <button
        onClick={handleSave}
        className="mt-6 bg-green-700 text-white rounded p-2 px-6 font-semibold hover:bg-green-800"
      >
        Enregistrer mes préférences
      </button>

      {message && <p className="mt-4 text-gray-700">{message}</p>}
    </main>
  );
}