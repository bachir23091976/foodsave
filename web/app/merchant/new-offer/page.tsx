"use client";
import { useLocale } from "../../lib/i18n/LocaleProvider";


import { useState } from "react";
import MerchantShell from "../../components/merchant/MerchantShell";
import s from "../../components/merchant/merchant.module.css";
import ui from "../../components/public.module.css";
import { API_URL } from "../../lib/api";

export default function NewOfferPage() {
  const { t, message: msg, number } = useLocale();
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
      setMessage("ui.you_must_be_signed_in");
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
          setMessage(uploadData.message || "ui.unable_to_upload_the_photo");
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
        setMessage(data.message || "ui.unable_to_create_the_offer");
        setLoading(false);
        return;
      }

      setMessage("ui.offer_published_successfully");
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
      setMessage("ui.unable_to_contact_the_server");
    } finally {
      setLoading(false);
    }
  };

  return (
    <MerchantShell title={t("ui.create_an_offer")} description={t("ui.present_your_surplus_with_a_clear_price_quantity_and")}>
      <div className={s.twoColumns}>
        <form onSubmit={handleSubmit} className={s.form}>
          <section className={s.panel}>
            <fieldset className={s.formSection}><legend>{t("ui.01_offer_details")}</legend><div className={s.form}>
              <div className={s.upload}>{imagePreview && <img src={imagePreview} alt={t("ui.offer_preview")} />}<div className={ui.filePicker}><span id="offer-image-label" className={s.field}>{t("ui.product_photo_optional")}</span><input id="offer-image" type="file" accept="image/*" onChange={handleImageChange} className="sr-only" aria-labelledby="offer-image-label" /><label className={ui.secondary} htmlFor="offer-image">{t("upload.choose")}</label><span className={s.help}>{imageFile?.name || t("upload.empty")}</span></div><p className={s.help}>{t("ui.choose_a_photo_that_represents_what_you_are_offering")}</p></div>
              <label className={s.field} htmlFor="offer-title">{t("ui.offer_title")}<input id="offer-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} required /></label>
              <label className={s.field} htmlFor="offer-category">{t("ui.category")}<select id="offer-category" value={category} onChange={(e) => setCategory(e.target.value)} required><option value="EPICERIE">{t("ui.grocery")}</option><option value="PLATS_PREPARES">{t("ui.prepared_meals")}</option><option value="SANDWICHS">{t("ui.sandwiches")}</option><option value="BOULANGERIE_PATISSERIE">{t("ui.bakery_pastries")}</option><option value="PIZZA_FAST_FOOD">{t("ui.pizza_fast_food")}</option><option value="FRUITS_LEGUMES">{t("ui.fruit_and_vegetables")}</option><option value="BOISSONS">{t("ui.drinks")}</option><option value="AUTRE">{t("ui.other")}</option></select></label>
              <label className={s.field} htmlFor="offer-description">{t("ui.description_optional")}<textarea id="offer-description" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
            </div></fieldset>
          </section>
          <section className={s.panel}><fieldset className={s.formSection}><legend>{t("ui.02_price_and_quantity")}</legend><div className={s.form}>
            <div className={s.fieldRow}><label className={s.field} htmlFor="offer-original-price">{t("ui.original_price_cad")}<input id="offer-original-price" type="number" step="0.01" value={originalPrice} onChange={(e) => setOriginalPrice(e.target.value)} required /></label><label className={s.field} htmlFor="offer-discounted-price">{t("ui.reduced_price_cad")}<input id="offer-discounted-price" type="number" step="0.01" value={discountedPrice} onChange={(e) => setDiscountedPrice(e.target.value)} required /></label></div>
            <label className={s.field} htmlFor="offer-quantity">{t("ui.available_quantity")}<input id="offer-quantity" type="number" min="1" max="1000" value={quantity} onChange={(e) => setQuantity(e.target.value)} required /></label>
          </div></fieldset></section>
          <section className={s.panel}><fieldset className={s.formSection}><legend>{t("ui.03_instore_pickup")}</legend><div className={s.form}>
            <label className={s.field} htmlFor="offer-pickup-start">{t("ui.pickup_starts")}<input id="offer-pickup-start" type="datetime-local" value={pickupStart} onChange={(e) => setPickupStart(e.target.value)} required /></label>
            <label className={s.field} htmlFor="offer-pickup-end">{t("ui.pickup_ends")}<input id="offer-pickup-end" type="datetime-local" value={pickupEnd} onChange={(e) => setPickupEnd(e.target.value)} required /></label>
          </div></fieldset></section>
          <button type="submit" disabled={loading} className={ui.button}>{loading ? t("ui.publishing") : t("ui.publish_offer")}</button>
          {message && <p role="status" className={s.notice}>{msg(message)}</p>}
        </form>
        <aside className={s.panel}><span className={s.badge}>{t("ui.no_unwelcome_surprises")}</span><h2 style={{ marginTop: 16 }}>{t("ui.an_offer_thats_easy_to_understand")}</h2><ul className={s.steps}><li>{t("ui.describe_the_products_included")}</li><li>{t("ui.enter_the_actual_price_and_available_quantity")}</li><li>{t("ui.choose_a_time_when_you_can_welcome_your_customers")}</li></ul></aside>
      </div>
    </MerchantShell>
  );
}
