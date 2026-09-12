"use client";

import { useState } from "react";
import MerchantShell from "../../components/merchant/MerchantShell";
import s from "../../components/merchant/merchant.module.css";
import ui from "../../components/public.module.css";
import { API_URL } from "../../lib/api";

export default function NewOfferPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("PLATS_PREPARES");
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
      setMessage("Vous devez être connecté");
      setLoading(false);
      return;
    }

    try {
      let imageUrl = "";

      if (imageFile) {
        const formData = new FormData();
        formData.append("image", imageFile);

        const uploadRes = await fetch(`${API_URL}/upload/image`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        const uploadData = await uploadRes.json();

        if (!uploadRes.ok) {
          setMessage(uploadData.message || "Erreur lors du téléversement de la photo");
          setLoading(false);
          return;
        }

        imageUrl = uploadData.imageUrl;
      }

      const res = await fetch(`${API_URL}/offers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title,
          description,
          category,
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
        setMessage(data.message || "Erreur lors de la création de l’offre");
        setLoading(false);
        return;
      }

      setMessage("Offre publiée avec succès !");
      setTitle("");
      setDescription("");
      setCategory("PLATS_PREPARES");
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
    <MerchantShell title="Créer une offre" description="Présentez vos invendus avec un prix, une quantité et un créneau de récupération clairs.">
      <div className={s.twoColumns}>
        <form onSubmit={handleSubmit} className={s.form}>
          <section className={s.panel}>
            <fieldset className={s.formSection}><legend>01 · Le contenu de l’offre</legend><div className={s.form}>
              <div className={s.upload}>{imagePreview && <img src={imagePreview} alt="Aperçu de votre offre" />}<label className={s.field} htmlFor="offer-image">Photo du produit (optionnel)<input id="offer-image" type="file" accept="image/*" onChange={handleImageChange} /></label><p className={s.help}>Choisissez une photo qui représente le contenu proposé.</p></div>
              <label className={s.field} htmlFor="offer-title">Titre de l’offre<input id="offer-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} required /></label>
              <label className={s.field} htmlFor="offer-category">Catégorie<select id="offer-category" value={category} onChange={(e) => setCategory(e.target.value)} required><option value="EPICERIE">Épicerie</option><option value="PLATS_PREPARES">Plats préparés</option><option value="SANDWICHS">Sandwichs</option><option value="BOULANGERIE_PATISSERIE">Boulangerie / Pâtisserie</option><option value="PIZZA_FAST_FOOD">Pizza / Fast-food</option><option value="FRUITS_LEGUMES">Fruits et légumes</option><option value="BOISSONS">Boissons</option><option value="AUTRE">Autre</option></select></label>
              <label className={s.field} htmlFor="offer-description">Description (optionnel)<textarea id="offer-description" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
            </div></fieldset>
          </section>
          <section className={s.panel}><fieldset className={s.formSection}><legend>02 · Prix et quantité</legend><div className={s.form}>
            <div className={s.fieldRow}><label className={s.field} htmlFor="offer-original-price">Prix original ($)<input id="offer-original-price" type="number" step="0.01" value={originalPrice} onChange={(e) => setOriginalPrice(e.target.value)} required /></label><label className={s.field} htmlFor="offer-discounted-price">Prix réduit ($)<input id="offer-discounted-price" type="number" step="0.01" value={discountedPrice} onChange={(e) => setDiscountedPrice(e.target.value)} required /></label></div>
            <label className={s.field} htmlFor="offer-quantity">Quantité disponible<input id="offer-quantity" type="number" min="1" max="1000" value={quantity} onChange={(e) => setQuantity(e.target.value)} required /></label>
          </div></fieldset></section>
          <section className={s.panel}><fieldset className={s.formSection}><legend>03 · Récupération au commerce</legend><div className={s.form}>
            <label className={s.field} htmlFor="offer-pickup-start">Début de récupération<input id="offer-pickup-start" type="datetime-local" value={pickupStart} onChange={(e) => setPickupStart(e.target.value)} required /></label>
            <label className={s.field} htmlFor="offer-pickup-end">Fin de récupération<input id="offer-pickup-end" type="datetime-local" value={pickupEnd} onChange={(e) => setPickupEnd(e.target.value)} required /></label>
          </div></fieldset></section>
          <button type="submit" disabled={loading} className={ui.button}>{loading ? "Publication…" : "Publier l’offre"}</button>
          {message && <p role="status" className={s.notice}>{message}</p>}
        </form>
        <aside className={s.panel}><span className={s.badge}>Pas de mauvaises surprises</span><h2 style={{ marginTop: 16 }}>Une offre facile à comprendre</h2><ul className={s.steps}><li>Décrivez les produits inclus.</li><li>Indiquez le prix et la quantité réellement disponibles.</li><li>Choisissez un créneau pendant lequel vous pouvez accueillir vos clients.</li></ul></aside>
      </div>
    </MerchantShell>
  );
}
