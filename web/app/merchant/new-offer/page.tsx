"use client";

import { useState } from "react";

export default function NewOfferPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");
  const [discountedPrice, setDiscountedPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [pickupStart, setPickupStart] = useState("");
  const [pickupEnd, setPickupEnd] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    const token = localStorage.getItem("token");
    if (!token) {
      setMessage("Vous devez etre connecte");
      setLoading(false);
      return;
    }

    try {
      let imageUrl = "";

      if (imageFile) {
        const formData = new FormData();
        formData.append("image", imageFile);

        const uploadRes = await fetch("http://localhost:4000/upload/image", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        const uploadData = await uploadRes.json();

        if (!uploadRes.ok) {
          setMessage(uploadData.message || "Erreur lors du televersement de la photo");
          setLoading(false);
          return;
        }

        imageUrl = uploadData.imageUrl;
      }

      const res = await fetch("http://localhost:4000/offers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title,
          description,
          imageUrl,
          originalPrice: parseFloat(originalPrice),
          discountedPrice: parseFloat(discountedPrice),
          quantity: parseInt(quantity),
          pickupStart,
          pickupEnd,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.message || "Erreur lors de la creation de l'offre");
        setLoading(false);
        return;
      }

      setMessage("Offre publiee avec succes !");
      setTitle("");
      setDescription("");
      setOriginalPrice("");
      setDiscountedPrice("");
      setQuantity("");
      setPickupStart("");
      setPickupEnd("");
      setImageFile(null);
      setImagePreview("");
    } catch {
      setMessage("Impossible de contacter le serveur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center p-8">
      <h1 className="text-3xl font-bold text-green-700 mb-6">
        Publier une nouvelle offre
      </h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-sm">
        <label className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-green-500">
          {imagePreview ? (
            <img src={imagePreview} alt="Apercu" className="w-full h-40 object-cover rounded" />
          ) : (
            <span className="text-gray-500">Cliquez pour ajouter une photo du produit</span>
          )}
          <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
        </label>

        <input
          type="text"
          placeholder="Titre de l'offre"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="border border-gray-300 rounded p-2"
          required
        />
        <textarea
          placeholder="Description (optionnel)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="border border-gray-300 rounded p-2"
        />
        <input
          type="number"
          step="0.01"
          placeholder="Prix original ($)"
          value={originalPrice}
          onChange={(e) => setOriginalPrice(e.target.value)}
          className="border border-gray-300 rounded p-2"
          required
        />
        <input
          type="number"
          step="0.01"
          placeholder="Prix reduit ($)"
          value={discountedPrice}
          onChange={(e) => setDiscountedPrice(e.target.value)}
          className="border border-gray-300 rounded p-2"
          required
        />
        <input
          type="number"
          placeholder="Quantite disponible"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="border border-gray-300 rounded p-2"
          required
        />
        <label className="text-sm text-gray-600">Debut de recuperation</label>
        <input
          type="datetime-local"
          value={pickupStart}
          onChange={(e) => setPickupStart(e.target.value)}
          className="border border-gray-300 rounded p-2"
          required
        />
        <label className="text-sm text-gray-600">Fin de recuperation</label>
        <input
          type="datetime-local"
          value={pickupEnd}
          onChange={(e) => setPickupEnd(e.target.value)}
          className="border border-gray-300 rounded p-2"
          required
        />

        <button
          type="submit"
          disabled={loading}
          className="bg-green-700 text-white rounded p-2 font-semibold hover:bg-green-800 disabled:bg-gray-300"
        >
          {loading ? "Publication..." : "Publier l'offre"}
        </button>
      </form>

      {message && <p className="mt-4 text-gray-700">{message}</p>}
    </main>
  );
}