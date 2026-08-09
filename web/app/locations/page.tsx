"use client";

import { useEffect, useState } from "react";

interface SavedLocation {
  id: string;
  label: string;
  address: string;
}

export default function LocationsPage() {
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const loadLocations = () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    fetch("http://localhost:4000/locations", {
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
      setMessage("Vous devez être connecté");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("http://localhost:4000/locations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ label, address }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.message || "Erreur");
        setLoading(false);
        return;
      }

      setMessage("Adresse enregistrée !");
      setLabel("");
      setAddress("");
      loadLocations();
    } catch {
      setMessage("Impossible de contacter le serveur");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (locationId: string) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    await fetch("http://localhost:4000/locations/delete", {
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
    <main className="min-h-screen flex flex-col items-center p-8">
      <h1 className="text-3xl font-bold text-green-700 mb-6">
        Mes adresses
      </h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-sm mb-8">
        <input
          type="text"
          placeholder="Nom (ex: Domicile, Travail)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="border border-gray-300 rounded p-2"
          required
        />
        <input
          type="text"
          placeholder="Adresse"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="border border-gray-300 rounded p-2"
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-green-700 text-white rounded p-2 font-semibold hover:bg-green-800 disabled:bg-gray-300"
        >
          {loading ? "Enregistrement..." : "Enregistrer cette adresse"}
        </button>
      </form>

      {message && <p className="text-gray-700 mb-4">{message}</p>}

      <div className="w-full max-w-sm flex flex-col gap-2">
        {locations.map((loc) => (
          <div
            key={loc.id}
            className="flex justify-between items-center border border-gray-200 rounded p-3"
          >
            <div>
              <p className="font-semibold">{loc.label}</p>
              <p className="text-sm text-gray-500">{loc.address}</p>
            </div>
            <button
              onClick={() => handleDelete(loc.id)}
              className="text-red-600 text-sm hover:underline"
            >
              Supprimer
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}