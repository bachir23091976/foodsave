"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bebas_Neue, Space_Grotesk } from "next/font/google";

const display = Bebas_Neue({ subsets: ["latin"], weight: "400" });
const body = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });

const bg = "#06110C";
const amber = "#FFB100";
const jade = "#17C989";
const dim = "#8FA396";

export default function OrderSuccessPage() {
  return (
    <Suspense fallback={null}>
      <OrderSuccessContent />
    </Suspense>
  );
}

function OrderSuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [message, setMessage] = useState("Confirmation en cours...");
  const [qrCode, setQrCode] = useState("");
  const [pickupCode, setPickupCode] = useState("");

  useEffect(() => {
    if (!sessionId) {
      setMessage("Session de paiement introuvable");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      setMessage("Vous devez être connecté");
      return;
    }

    fetch("http://localhost:4000/orders/confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ sessionId }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.order) {
          setMessage("Réservation confirmée !");
          setQrCode(data.qrCodeImage);
          setPickupCode(data.order.pickupCode);
        } else {
          setMessage(data.message || "Erreur lors de la confirmation");
        }
      })
      .catch(() => setMessage("Impossible de contacter le serveur"));
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

        {qrCode && (
          <div
            className="mt-10 rounded-2xl p-8 flex flex-col items-center"
            style={{ backgroundColor: "#0D1912", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <img src={qrCode} alt="QR Code de récupération" className="w-48 h-48 rounded-xl" style={{ backgroundColor: "#F5F1E8" }} />
            <p className="text-sm mt-4" style={{ color: dim }}>
              Code : <span className="font-bold" style={{ color: amber }}>{pickupCode}</span>
            </p>
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
