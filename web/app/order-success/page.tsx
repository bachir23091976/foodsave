"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function OrderSuccessPage() {
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
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-2xl font-bold text-green-700 mb-4">{message}</h1>

      {qrCode && (
        <>
          <img src={qrCode} alt="QR Code de récupération" className="w-48 h-48" />
          <p className="text-sm text-gray-500 mt-2">Code : {pickupCode}</p>
          <p className="text-sm text-gray-600 mt-2 text-center">
            Montrez ce code au commerçant lors de la récupération.
          </p>
        </>
      )}

      <a href="/offers" className="mt-6 text-green-700 underline">
        Retour aux offres
      </a>
    </main>
  );
}