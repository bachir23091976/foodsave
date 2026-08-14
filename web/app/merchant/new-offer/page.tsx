"use client";

import { useState } from "react";
import { Bebas_Neue, Space_Grotesk } from "next/font/google";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";

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
    <main className={body.className} style={{ backgroundColor: bg, color: "#F5F1E8", minHeight: "100vh" }}>
      <style>{`
        .fs-upload { background: linear-gradient(135deg, #06110C, #16261C); transition: border-color 0.2s ease; }
        .fs-upload:hover { border-color: rgba(23,201,137,0.6) !important; }
      `}</style>
      <Navbar />

      <section className="px-6 pt-14 pb-4 text-center">
        <p className="text-xs tracking-[0.4em] uppercase mb-3" style={{ color: jade }}>
          Nouvelle offre
        </p>
        <h1 className={display.className} style={{ fontSize: "clamp(2.2rem, 6vw, 4rem)" }}>
          DONNEZ UNE SECONDE VIE
          <br />
          <span style={{ color: amber }}>A VOS SURPLUS</span>
        </h1>
        <p className="mt-4 max-w-lg mx-auto" style={{ color: dim }}>
          Une belle photo attire trois fois plus de reservations. Ajoutez-la en premier.
        </p>
      </section>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-md mx-auto px-6 pb-20">
        <label className="fs-upload rounded-2xl p-4 text-center cursor-pointer block" style={{ border: "1px dashed rgba(23,201,137,0.4)" }}>
          {imagePreview ? (
            <img src={imagePreview} alt="Apercu" className="w-full h-48 object-cover rounded-xl" />
          ) : (
            <div className="h-48 flex flex-col items-center justify-center gap-2">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                <path d="M4 16.5V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10.5" stroke={jade} strokeWidth="1.4" opacity="0.85" />
                <path d="M4 15l4.5-4.5a2 2 0 0 1 2.8 0L16 15" stroke={amber} strokeWidth="1.4" opacity="0.85" />
                <circle cx="9" cy="8.5" r="1.5" stroke={amber} strokeWidth="1.4" opacity="0.85" />
                <path d="M4 19h16" stroke={jade} strokeWidth="1.4" opacity="0.6" />
              </svg>
              <span style={{ color: "#F5F1E8" }} className="font-bold text-sm">Ajouter une photo du produit</span>
              <span style={{ color: dim }} className="text-xs">Heberge sur Cloudinary - format JPG ou PNG</span>
            </div>
          )}
          <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
        </label>

        <input
          type="text"
          placeholder="Titre de l'offre"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-full px-5 py-3 outline-none"
          style={inputStyle}
          required
        />
        <textarea
          placeholder="Description (optionnel)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="rounded-2xl px-5 py-3 outline-none"
          style={inputStyle}
        />
        <div className="grid grid-cols-2 gap-4">
          <input
            type="number"
            step="0.01"
            placeholder="Prix original ($)"
            value={originalPrice}
            onChange={(e) => setOriginalPrice(e.target.value)}
            className="rounded-full px-5 py-3 outline-none"
            style={inputStyle}
            required
          />
          <input
            type="number"
            step="0.01"
            placeholder="Prix reduit ($)"
            value={discountedPrice}
            onChange={(e) => setDiscountedPrice(e.target.value)}
            className="rounded-full px-5 py-3 outline-none"
            style={inputStyle}
            required
          />
        </div>
        <input
          type="number"
          placeholder="Quantite disponible"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="rounded-full px-5 py-3 outline-none"
          style={inputStyle}
          required
        />

        <div>
          <label className="text-xs uppercase tracking-wide" style={{ color: dim }}>Debut de recuperation</label>
          <input
            type="datetime-local"
            value={pickupStart}
            onChange={(e) => setPickupStart(e.target.value)}
            className="rounded-full px-5 py-3 outline-none w-full mt-1"
            style={inputStyle}
            required
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide" style={{ color: dim }}>Fin de recuperation</label>
          <input
            type="datetime-local"
            value={pickupEnd}
            onChange={(e) => setPickupEnd(e.target.value)}
            className="rounded-full px-5 py-3 outline-none w-full mt-1"
            style={inputStyle}
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="rounded-full px-6 py-3 font-bold uppercase tracking-wide text-sm mt-2"
          style={{ backgroundColor: amber, color: bg, opacity: loading ? 0.6 : 1 }}
        >
          {loading ? "Publication..." : "Publier l'offre"}
        </button>

        {message && <p className="text-center" style={{ color: dim }}>{message}</p>}
      </form>

      <Footer />
    </main>
  );
}
