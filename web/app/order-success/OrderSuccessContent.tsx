"use client";
import LanguageSelector from "../lib/i18n/LanguageSelector";
import { useLocale } from "../lib/i18n/LocaleProvider";


import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import s from "../components/public.module.css";
import { API_URL } from "../lib/api";




const bg = "#faf8f2";
const amber = "#d8ee97";
const jade = "#215d43";
const dim = "#59685e";

type ConfirmationResponse = {
  ok: boolean;
  data: {
    order?: { status: string; pickupCode?: string };
    qrCodeImage?: string;
    message?: string;
  };
};

export default function OrderSuccessContent() {
  const { t, message: msg } = useLocale();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [message, setMessage] = useState("ui.confirming_your_reservation");
  const [qrCode, setQrCode] = useState("");
  const [pickupCode, setPickupCode] = useState("");
  const confirmation = useRef<{
    sessionId: string;
    token: string;
    response: Promise<ConfirmationResponse>;
  } | null>(null);

  useEffect(() => {
    let active = true;
    setQrCode("");
    setPickupCode("");
    setMessage("ui.confirming_your_reservation");
    if (!sessionId) {
      setMessage("ui.payment_session_not_found");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      setMessage("ui.you_must_be_signed_in");
      return;
    }

    // Reuse an in-flight request during effect replay; never retry confirmation here.
    if (confirmation.current?.sessionId !== sessionId || confirmation.current.token !== token) {
      confirmation.current = {
        sessionId, token,
        response: fetch(`${API_URL}/orders/confirm`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ sessionId }),
        }).then(async (res) => ({ ok: res.ok, data: await res.json() })),
      };
    }
    confirmation.current.response
      .then(({ ok, data }) => {
        if (!active) return;
        setQrCode("");
        setPickupCode("");
        if (ok && data.order) {
          switch (data.order.status) {
            case "CONFIRMED":
              setMessage("ui.reservation_confirmed");
              setQrCode(data.qrCodeImage || "");
              setPickupCode(data.order.pickupCode || "");
              break;
            case "CANCELLED":
              setMessage("ui.reservation_cancelled");
              break;
            case "COMPLETED":
              setMessage("ui.reservation_already_picked_up");
              break;
            case "PENDING":
              setMessage("ui.reservation_awaiting_confirmation");
              break;
            default:
              setMessage("ui.reservation_status_unavailable");
          }
        } else {
          setMessage(data.message || "ui.unable_to_confirm_the_reservation");
        }
      })
      .catch(() => { if (active) setMessage("ui.unable_to_contact_the_server"); });
    return () => { active = false; };
  }, [sessionId]);

  return (
    <main className={s.page + " " + s.accountPage} style={{ backgroundColor: bg, color: "#183e32", minHeight: "100vh" }}>
      <div className="flex justify-end p-4"><LanguageSelector /></div>
      <div className="flex flex-col items-center justify-center min-h-screen px-6 py-16 text-center">
        {qrCode ? (
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-6"
            style={{ backgroundColor: "rgba(23,201,137,0.15)", border: "1px solid rgba(23,201,137,0.4)" }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M5 13l4 4L19 7" stroke={jade} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        ) : (
          <p className="text-xs tracking-[0.4em] uppercase mb-4" style={{ color: jade }}>
            {t("ui.reservation")}</p>
        )}

        <h1 className={s.heading} style={{ fontSize: "clamp(1.8rem, 5vw, 3rem)" }}>
          {msg(message).toUpperCase()}
        </h1>

        {(qrCode || pickupCode) && (
          <div
            className="mt-10 rounded-2xl p-8 flex flex-col items-center"
            style={{ backgroundColor: "#ffffff", border: "1px solid #dce2d8" }}
          >
            {qrCode && <img src={qrCode} alt={t("ui.pickup_qr_code")} className="w-48 h-48 rounded-xl" style={{ backgroundColor: "#ffffff" }} />}
            {pickupCode && <p className="text-sm mt-4 break-all" style={{ color: dim }}>
              {t("ui.code")}{" "}<span className="font-bold" style={{ color: "#215d43" }}>{pickupCode}</span>
            </p>}
            <p className="text-sm mt-2 text-center max-w-xs" style={{ color: dim }}>
              {t("ui.show_this_code_to_the_merchant_when_you_pick")}</p>
          </div>
        )}

        <a href="/offers" className="mt-8" style={{ color: jade }}>
          {t("ui.back_to_offers")}</a>
      </div>
    </main>
  );
}
