"use client";

import { useState } from "react";

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
  const [profileCreated, setProfileCreated] = useState(false);
  const [connectingStripe, setConnectingStripe] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");

    const token = localStorage.getItem("token");
    if (!token) {
      setMessage("Vous devez être connecté");
      return;
    }

    try {
      const res = await fetch("http://localhost:4000/merchants", {
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
      setProfileCreated(true);
    } catch {
      setMessage("Impossible de contacter le serveur");
    }
  };

  const handleConnectStripe = async () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    setConnectingStripe(true);

    try {
      const res = await fetch("http://localhost:4000/merchants/connect-stripe", {
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
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold text-green-700 mb-6">
        Créer mon profil de commerce
      </h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-sm">
        <input
          type="text"
          placeholder="Nom du commerce"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border border-gray-300 rounded p-2"
          required
        />

        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="border border-gray-300 rounded p-2"
        >
          <option value="RESTAURANT">Restaurant</option>
          <option value="CAFE">Café</option>
          <option value="BAKERY">Boulangerie</option>
          <option value="GROCERY">Épicerie</option>
          <option value="SUPERMARKET">Grande surface</option>
          <option value="HOTEL">Hôtel</option>
          <option value="OTHER">Autre</option>
        </select>

        <textarea
          placeholder="Description (optionnel)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="border border-gray-300 rounded p-2"
        />

        <input
          type="text"
          placeholder="Adresse"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="border border-gray-300 rounded p-2"
          required
        />
        <input
          type="text"
          placeholder="Ville"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="border border-gray-300 rounded p-2"
          required
        />
        <input
          type="text"
          placeholder="Province"
          value={province}
          onChange={(e) => setProvince(e.target.value)}
          className="border border-gray-300 rounded p-2"
          required
        />
        <input
          type="text"
          placeholder="Code postal"
          value={postalCode}
          onChange={(e) => setPostalCode(e.target.value)}
          className="border border-gray-300 rounded p-2"
          required
        />
        <input
          type="text"
          placeholder="Téléphone (optionnel)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="border border-gray-300 rounded p-2"
        />

        <button
          type="submit"
          className="bg-green-700 text-white rounded p-2 font-semibold hover:bg-green-800"
        >
          Créer mon profil
        </button>
      </form>

      {message && <p className="mt-4 text-gray-700">{message}</p>}

      {profileCreated && (
        <button
          onClick={handleConnectStripe}
          disabled={connectingStripe}
          className="mt-4 bg-blue-600 text-white rounded p-2 px-6 font-semibold hover:bg-blue-700 disabled:bg-gray-300"
        >
          {connectingStripe ? "Connexion..." : "Connecter mon compte Stripe"}
        </button>
      )}
    </main>
  );
}