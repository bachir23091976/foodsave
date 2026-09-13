"use client";
import { useLocale } from "../../lib/i18n/LocaleProvider";


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
  const { t, message: msg } = useLocale();
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
      setProfileError("ui.sign_in_to_view_your_business");
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
      .catch(() => setProfileError("ui.unable_to_load_your_profile_refresh_the_page_before"))
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
      setMessage("ui.you_must_be_signed_in");
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
        setMessage(data.message || "ui.something_went_wrong");
        return;
      }

      setMessage("ui.business_profile_created_successfully");
      setMerchant(data.merchant);
    } catch {
      setMessage("ui.unable_to_contact_the_server");
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
        setMessage(data.message || "ui.unable_to_connect_to_stripe");
      }
    } catch {
      setMessage("ui.unable_to_contact_the_server");
    } finally {
      setConnectingStripe(false);
    }
  };

  return (
    <MerchantShell title={t("ui.my_business")} description={t("ui.your_profile_offers_and_payments_everything_you_need_for")} action={merchant && <Link href="/merchant/new-offer" className={ui.button}>{t("ui.create_an_offer_")}</Link>}>
      {loadingMerchant ? <p role="status" className={s.notice}>{t("ui.loading_your_business")}</p> : profileError ? <p role="alert" className={s.notice + " " + s.error}>{msg(profileError)}</p> : merchant ? <>
        <div className={s.quickLinks}><Link href="/merchant/offers">{t("ui.my_offers_")}<small>{t("ui.check_your_quantities_and_availability")}</small></Link><Link href="/merchant/reservations">{t("ui.reservations_")}<small>{t("ui.welcome_customers_and_validate_pickups")}</small></Link></div>
        <div className={s.twoColumns}>
          <section className={s.panel}><div className={s.cardTop}><h2>{merchant.name}</h2><span className={s.badge}>{t("ui.profile_saved")}</span></div><p className={s.muted}>{({ RESTAURANT: t("ui.restaurant"), CAFE: t("ui.cafe"), BAKERY: t("ui.bakery"), GROCERY: t("ui.grocery"), SUPERMARKET: t("ui.supermarket"), HOTEL: t("ui.hotel"), OTHER: t("ui.other") } as Record<string,string>)[merchant.type] || merchant.type}</p>
            {merchant.description && <p className={s.help}>{merchant.description}</p>}
            <dl className={s.facts}><div><dt>{t("ui.business_address")}</dt><dd>{merchant.address}, {merchant.city}, {merchant.province} {merchant.postalCode}</dd></div>{merchant.phone && <div><dt>{t("ui.phone")}</dt><dd>{merchant.phone}</dd></div>}</dl>
          </section>
          <section id="paiements" className={s.panel + " " + s.payment}><h2>{t("ui.your_payments")}</h2><p className={s.help}>{t("ui.stripe_is_our_payment_partner_set_up_your_account")}</p>
            <div className={s.paymentStatus} role="status">{loadingStripeStatus ? t("ui.checking_your_account") : stripeStatus?.status === "READY" ? <span className={s.badge + " " + s.success}>{t("ui.setup_ready")}</span> : stripeStatus?.status === "ONBOARDING_INCOMPLETE" ? <span className={s.badge + " " + s.warning}>{t("ui.setup_or_verification_incomplete")}</span> : stripeStatus?.status === "NOT_CONNECTED" ? <span className={s.badge}>{t("ui.payments_not_connected")}</span> : t("ui.status_temporarily_unavailable")}</div>
            {!loadingStripeStatus && stripeStatus?.status !== "READY" && <button onClick={handleConnectStripe} disabled={connectingStripe} className={ui.button}>{connectingStripe ? t("merchant.connecting") : stripeStatus?.status === "ONBOARDING_INCOMPLETE" ? t("ui.continue_setup") : t("ui.set_up_my_payments")}</button>}
            <p className={s.help}>{t("ui.payout_timing_depends_on_your_account_and_its_eligibility")}</p>
          </section>
        </div>
        <section className={s.panel}><h2>{t("ui.track_your_activity")}</h2><p className={s.help}>{t("ui.view_completed_sales_and_their_amounts")}</p><div className={s.actions}><Link href="/merchant/sales" className={ui.secondary}>{t("ui.view_my_sales_")}</Link><Link href="/offers" className={ui.quiet}>{t("ui.view_public_offers")}</Link></div></section>
      </> : <div className={s.twoColumns}>
        <section className={s.panel}><h2>{t("ui.introduce_your_business")}</h2><p className={s.help}>{t("ui.these_details_help_customers_recognize_and_find_your_business")}</p>
          <form onSubmit={handleSubmit} className={s.form} style={{ marginTop: 24 }}>
            <label className={s.field} htmlFor="merchant-name">{t("ui.business_name")}<input id="merchant-name" type="text" value={name} onChange={(e) => setName(e.target.value)} required /></label>
            <label className={s.field} htmlFor="merchant-type">{t("ui.business_type")}<select id="merchant-type" value={type} onChange={(e) => setType(e.target.value)}><option value="RESTAURANT">{t("ui.restaurant")}</option><option value="CAFE">{t("ui.cafe")}</option><option value="BAKERY">{t("ui.bakery")}</option><option value="GROCERY">{t("ui.grocery")}</option><option value="SUPERMARKET">{t("ui.supermarket")}</option><option value="HOTEL">{t("ui.hotel")}</option><option value="OTHER">{t("ui.other")}</option></select></label>
            <label className={s.field} htmlFor="merchant-description">{t("ui.description_optional")}<textarea id="merchant-description" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
            <label className={s.field} htmlFor="merchant-address">{t("ui.address")}<input id="merchant-address" type="text" value={address} onChange={(e) => setAddress(e.target.value)} required /></label>
            <div className={s.fieldRow}><label className={s.field} htmlFor="merchant-city">{t("ui.city")}<input id="merchant-city" type="text" value={city} onChange={(e) => setCity(e.target.value)} required /></label><label className={s.field} htmlFor="merchant-province">{t("ui.province")}<input id="merchant-province" type="text" value={province} onChange={(e) => setProvince(e.target.value)} required /></label></div>
            <div className={s.fieldRow}><label className={s.field} htmlFor="merchant-postalcode">{t("ui.postal_code")}<input id="merchant-postalcode" type="text" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} required /></label><label className={s.field} htmlFor="merchant-phone">{t("ui.phone_optional")}<input id="merchant-phone" type="text" value={phone} onChange={(e) => setPhone(e.target.value)}  /></label></div>
            <button type="submit" disabled={submittingProfile} className={ui.button}>{submittingProfile ? t("ui.creating") : t("ui.create_my_profile")}</button>
          </form>
        </section>
        <aside className={s.panel}><span className={s.badge}>{t("ui.getting_started")}</span><h2 style={{ marginTop: 16 }}>{t("ui.your_merchant_journey")}</h2><ol className={s.steps}><li>{t("ui.save_your_businesss_contact_details")}</li><li>{t("ui.complete_payment_setup_and_verification")}</li><li>{t("ui.publish_your_surplus_and_pickup_windows")}</li></ol></aside>
      </div>}
      {message && <p role="status" className={s.notice}>{msg(message)}</p>}
    </MerchantShell>
  );
}
