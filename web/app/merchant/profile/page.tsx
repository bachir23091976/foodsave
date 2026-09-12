"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import MerchantShell from "../../components/merchant/MerchantShell";
import s from "../../components/merchant/merchant.module.css";
import ui from "../../components/public.module.css";
import { API_URL } from "../../lib/api";

interface Merchant {
  id: string;
  name: string;
  type: string;
  description: string | null;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  phone: string | null;
  stripeAccountId: string | null;
}

interface StripeStatus {
  status: "NOT_CONNECTED" | "ONBOARDING_INCOMPLETE" | "READY";
  transfersActive: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  currentlyDue: string[];
}

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
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [loadingMerchant, setLoadingMerchant] = useState(true);
  const [profileError, setProfileError] = useState("");
  const [stripeStatus, setStripeStatus] = useState<StripeStatus | null>(null);
  const [loadingStripeStatus, setLoadingStripeStatus] = useState(true);
  const [connectingStripe, setConnectingStripe] = useState(false);
  const [submittingProfile, setSubmittingProfile] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoadingMerchant(false);
      setProfileError("Vous devez être connecté pour consulter votre commerce.");
      return;
    }

    fetch(`${API_URL}/merchants/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => { if (res.status === 404) return null; if (!res.ok) throw new Error("Profile unavailable"); return res.json(); })
      .then((data) => {
        if (data !== null && !data?.merchant) throw new Error("Profile unavailable");
        if (data?.merchant) {
          setMerchant(data.merchant);
        }
      })
      .catch(() => setProfileError("Impossible de charger votre profil. Actualisez la page avant de continuer."))
      .finally(() => setLoadingMerchant(false));
  }, []);

  useEffect(() => {
    if (!merchant) {
      setLoadingStripeStatus(false);
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      setLoadingStripeStatus(false);
      return;
    }

    setLoadingStripeStatus(true);
    fetch(`${API_URL}/merchants/stripe-status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setStripeStatus(data);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingStripeStatus(false));
  }, [merchant]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingProfile) return;
    setMessage("");

    const token = localStorage.getItem("token");
    if (!token) {
      setMessage("Vous devez être connecté");
      return;
    }

    setSubmittingProfile(true);
    try {
      const res = await fetch(`${API_URL}/merchants`, {
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
      setMerchant(data.merchant);
    } catch {
      setMessage("Impossible de contacter le serveur");
    } finally {
      setSubmittingProfile(false);
    }
  };

  const handleConnectStripe = async () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    setConnectingStripe(true);

    try {
      const res = await fetch(`${API_URL}/merchants/connect-stripe`, {
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
    <MerchantShell title="Mon commerce" description="Votre profil, vos offres et vos paiements : l’essentiel pour votre journée." action={merchant && <Link href="/merchant/new-offer" className={ui.button}>Créer une offre +</Link>}>
      {loadingMerchant ? <p role="status" className={s.notice}>Chargement de votre commerce…</p> : profileError ? <p role="alert" className={s.notice + " " + s.error}>{profileError}</p> : merchant ? <>
        <div className={s.quickLinks}><Link href="/merchant/offers">Mes offres →<small>Consultez vos quantités et disponibilités</small></Link><Link href="/merchant/reservations">Réservations →<small>Accueillez vos clients et validez les récupérations</small></Link></div>
        <div className={s.twoColumns}>
          <section className={s.panel}><div className={s.cardTop}><h2>{merchant.name}</h2><span className={s.badge}>Profil enregistré</span></div><p className={s.muted}>{({ RESTAURANT: "Restaurant", CAFE: "Café", BAKERY: "Boulangerie", GROCERY: "Épicerie", SUPERMARKET: "Grande surface", HOTEL: "Hôtel", OTHER: "Autre" } as Record<string,string>)[merchant.type] || merchant.type}</p>
            {merchant.description && <p className={s.help}>{merchant.description}</p>}
            <dl className={s.facts}><div><dt>Adresse du commerce</dt><dd>{merchant.address}, {merchant.city}, {merchant.province} {merchant.postalCode}</dd></div>{merchant.phone && <div><dt>Téléphone</dt><dd>{merchant.phone}</dd></div>}</dl>
          </section>
          <section id="paiements" className={s.panel + " " + s.payment}><h2>Vos paiements</h2><p className={s.help}>Stripe est notre partenaire de paiement. Configurez votre compte pour recevoir les paiements des clients et les versements admissibles.</p>
            <div className={s.paymentStatus} role="status">{loadingStripeStatus ? "Vérification de votre compte…" : stripeStatus?.status === "READY" ? <span className={s.badge + " " + s.success}>Configuration prête</span> : stripeStatus?.status === "ONBOARDING_INCOMPLETE" ? <span className={s.badge + " " + s.warning}>Configuration ou vérification incomplète</span> : stripeStatus?.status === "NOT_CONNECTED" ? <span className={s.badge}>Paiements non connectés</span> : "Statut momentanément indisponible."}</div>
            {!loadingStripeStatus && stripeStatus?.status !== "READY" && <button onClick={handleConnectStripe} disabled={connectingStripe} className={ui.button}>{connectingStripe ? "Connexion…" : stripeStatus?.status === "ONBOARDING_INCOMPLETE" ? "Continuer la configuration" : "Configurer mes paiements"}</button>}
            <p className={s.help}>Le calendrier des versements dépend de votre compte et de son admissibilité.</p>
          </section>
        </div>
        <section className={s.panel}><h2>Suivez votre activité</h2><p className={s.help}>Consultez les ventes terminées et les montants associés.</p><div className={s.actions}><Link href="/merchant/sales" className={ui.secondary}>Voir mes ventes →</Link><Link href="/offers" className={ui.quiet}>Voir les offres publiques</Link></div></section>
      </> : <div className={s.twoColumns}>
        <section className={s.panel}><h2>Présentez votre commerce</h2><p className={s.help}>Ces informations permettent aux clients de vous identifier et de vous trouver.</p>
          <form onSubmit={handleSubmit} className={s.form} style={{ marginTop: 24 }}>
            <label className={s.field} htmlFor="merchant-name">Nom du commerce<input id="merchant-name" type="text" value={name} onChange={(e) => setName(e.target.value)} required /></label>
            <label className={s.field} htmlFor="merchant-type">Type de commerce<select id="merchant-type" value={type} onChange={(e) => setType(e.target.value)}><option value="RESTAURANT">Restaurant</option><option value="CAFE">Café</option><option value="BAKERY">Boulangerie</option><option value="GROCERY">Épicerie</option><option value="SUPERMARKET">Grande surface</option><option value="HOTEL">Hôtel</option><option value="OTHER">Autre</option></select></label>
            <label className={s.field} htmlFor="merchant-description">Description (optionnel)<textarea id="merchant-description" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
            <label className={s.field} htmlFor="merchant-address">Adresse<input id="merchant-address" type="text" value={address} onChange={(e) => setAddress(e.target.value)} required /></label>
            <div className={s.fieldRow}><label className={s.field} htmlFor="merchant-city">Ville<input id="merchant-city" type="text" value={city} onChange={(e) => setCity(e.target.value)} required /></label><label className={s.field} htmlFor="merchant-province">Province<input id="merchant-province" type="text" value={province} onChange={(e) => setProvince(e.target.value)} required /></label></div>
            <div className={s.fieldRow}><label className={s.field} htmlFor="merchant-postalcode">Code postal<input id="merchant-postalcode" type="text" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} required /></label><label className={s.field} htmlFor="merchant-phone">Téléphone (optionnel)<input id="merchant-phone" type="text" value={phone} onChange={(e) => setPhone(e.target.value)}  /></label></div>
            <button type="submit" disabled={submittingProfile} className={ui.button}>{submittingProfile ? "Création…" : "Créer mon profil"}</button>
          </form>
        </section>
        <aside className={s.panel}><span className={s.badge}>Pour bien commencer</span><h2 style={{ marginTop: 16 }}>Votre parcours commerçant</h2><ol className={s.steps}><li>Enregistrez les coordonnées de votre commerce.</li><li>Complétez la configuration et la vérification des paiements.</li><li>Publiez vos invendus et leurs créneaux de récupération.</li></ol></aside>
      </div>}
      {message && <p role="status" className={s.notice}>{message}</p>}
    </MerchantShell>
  );
}
