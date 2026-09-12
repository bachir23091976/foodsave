"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bebas_Neue, Space_Grotesk } from "next/font/google";
import { API_URL } from "../lib/api";

const display = Bebas_Neue({ subsets: ["latin"], weight: "400" });
const body = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });

const bg = "#06110C";
const amber = "#FFB100";
const jade = "#17C989";
const dim = "#8FA396";

type ConfirmationResponse = {
  ok: boolean;
  data: {
    order?: { status: string; pickupCode?: string };
    qrCodeImage?: string;
    message?: string;
  };
};

export default function OrderSuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [message, setMessage] = useState("Confirmation en cours...");
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
    setMessage("Confirmation en cours...");
    if (!sessionId) {
      setMessage("Session de paiement introuvable");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      setMessage("Vous devez être connecté");
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
              setMessage("Réservation confirmée !");
              setQrCode(data.qrCodeImage || "");
              setPickupCode(data.order.pickupCode || "");
              break;
            case "CANCELLED":
              setMessage("Réservation annulée");
              break;
            case "COMPLETED":
              setMessage("Réservation déjà récupérée");
              break;
            case "PENDING":
              setMessage("Réservation en attente de confirmation");
              break;
            default:
              setMessage("Statut de la réservation indisponible");
          }
        } else {
          setMessage(data.message || "Erreur lors de la confirmation");
        }
      })
      .catch(() => { if (active) setMessage("Impossible de contacter le serveur"); });
    return () => { active = false; };
  }, [sessionId]);

  return (
    <main className={body.className} style={{ backgroundColor: bg, color: "#F5F1E8", minHeight: "100vh" }}>
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
            Reservation
          </p>
        )}

        <h1 className={display.className} style={{ fontSize: "clamp(1.8rem, 5vw, 3rem)" }}>
          {message.toUpperCase()}
        </h1>

        {(qrCode || pickupCode) && (
          <div
            className="mt-10 rounded-2xl p-8 flex flex-col items-center"
            style={{ backgroundColor: "#0D1912", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            {qrCode && <img src={qrCode} alt="QR Code de récupération" className="w-48 h-48 rounded-xl" style={{ backgroundColor: "#F5F1E8" }} />}
            {pickupCode && <p className="text-sm mt-4 break-all" style={{ color: dim }}>
              Code : <span className="font-bold" style={{ color: amber }}>{pickupCode}</span>
            </p>}
            <p className="text-sm mt-2 text-center max-w-xs" style={{ color: dim }}>
              Montrez ce code au commerçant lors de la récupération.
            </p>
          </div>
        )}

        <a href="/offers" className="mt-8" style={{ color: jade }}>
          Retour aux offres
        </a>
      </div>
    </main>
  );
}
