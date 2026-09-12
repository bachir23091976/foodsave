"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Navbar from "../components/Navbar";
import { API_URL } from "../lib/api";

interface Order {
  id: string;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
  totalPrice: number;
  pickupCode: string;
  cancellationReason?: string | null;
  customerCancellationRefund?: { refundStatus: string; updatedAt: string } | null;
  createdAt: string;
  offer: {
    title: string;
    pickupStart: string;
    pickupEnd: string;
    merchant: {
      name: string;
      address: string;
      city: string;
    };
  };
}

const statusLabels: Record<Order["status"], string> = {
  PENDING: "En attente",
  CONFIRMED: "\u00c0 r\u00e9cup\u00e9rer",
  COMPLETED: "D\u00e9j\u00e0 r\u00e9cup\u00e9r\u00e9e",
  CANCELLED: "Réservation annulée",
};

const refundLabels: Record<string, string> = {
  SUCCEEDED: "Remboursement effectué",
  PENDING: "Remboursement en attente",
  REQUIRES_ACTION: "Remboursement incomplet — vérification nécessaire",
  UNKNOWN: "Résultat du remboursement en cours de vérification",
  FAILED: "Remboursement nécessitant une vérification",
  CANCELED: "Remboursement nécessitant une vérification",
  NEEDS_REVIEW: "Remboursement nécessitant une vérification",
};

export default function ReservationsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const cancellationInFlight = useRef(false);
  const readVersion = useRef(0);

  const loadOrders = useCallback(async () => {
    const version = ++readVersion.current;
    setLoading(true);
    setError("");
    const token = localStorage.getItem("token");

    if (!token) {
      setError("Vous devez etre connecte pour voir vos reservations");
      setOrders([]);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/orders/mine`, {
        headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.orders)) throw new Error("Invalid reservation response");
      if (version === readVersion.current) setOrders(data.orders);
    } catch {
      if (version === readVersion.current) {
        setOrders([]);
        setError("Impossible de vérifier vos réservations. Actualisez leur état avant toute autre action.");
      }
    } finally {
      if (version === readVersion.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  const formatDateTime = (iso: string) =>
    new Date(iso).toLocaleString("fr-CA", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const handleCancel = async (orderId: string) => {
    if (cancellationInFlight.current) return;
    const confirmed = window.confirm(
      "Voulez-vous annuler cette commande ? Le remboursement sera envoye vers votre moyen de paiement initial."
    );
    if (!confirmed) return;

    const token = localStorage.getItem("token");
    if (!token) {
      setMessage("Vous devez etre connecte");
      return;
    }

    cancellationInFlight.current = true;
    ++readVersion.current;
    setLoading(false);
    setCancelingId(orderId);
    setMessage("");

    try {
      const res = await fetch(`${API_URL}/orders/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orderId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.message || "Impossible d'annuler la commande");
        return;
      }

      setMessage(data.message);
    } catch {
      setMessage("Impossible de contacter le serveur");
    } finally {
      await loadOrders();
      cancellationInFlight.current = false;
      setCancelingId(null);
    }
  };

  return (
    <main style={{ backgroundColor: "#06110C", color: "#F5F1E8", minHeight: "100vh" }}>
      <Navbar />

      <section className="px-6 pt-14 pb-6 text-center">
        <p className="text-xs tracking-[0.4em] uppercase mb-3" style={{ color: "#37D67A" }}>
          Mes achats FoodSave
        </p>
        <h1 className="text-4xl font-bold">MES RESERVATIONS</h1>
      </section>

      {loading && <p className="text-center">Chargement...</p>}
      {error && <p className="text-center" style={{ color: "#FF6B6B" }}>{error}</p>}
      {error && <button type="button" onClick={() => void loadOrders()} disabled={loading || cancelingId !== null} className="block mx-auto my-4">Actualiser les réservations</button>}
      {message && <p className="text-center px-6 mb-4" style={{ color: "#FFB100" }}>{message}</p>}

      {!loading && !error && orders.length === 0 && (
        <p className="text-center" style={{ color: "#8FA396" }}>
          Vous n'avez encore aucune reservation.
        </p>
      )}

      <div className="grid gap-4 max-w-2xl mx-auto px-6 pb-20">
        {!loading && !error && orders.map((order) => (
          <article
            key={order.id}
            className="rounded-2xl p-5 grid gap-2"
            style={{
              backgroundColor: "#0D1912",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <div className="flex justify-between gap-3">
              <h2 className="font-bold text-lg">{order.offer.title}</h2>
              <span style={{ color: "#37D67A" }}>{cancelingId === order.id ? "Vérification de la réservation…" : statusLabels[order.status]}</span>
            </div>

            <p>{order.offer.merchant.name} - {order.offer.merchant.city}</p>
            <p style={{ color: "#8FA396" }}>
              Recuperation : {formatDateTime(order.offer.pickupStart)} - {formatDateTime(order.offer.pickupEnd)}
            </p>
            <p>Prix : <strong>{order.totalPrice.toFixed(2)} $</strong></p>
            {order.status === "CONFIRMED" && cancelingId !== order.id && <p>
              Code de recuperation : <strong style={{ color: "#FFB100" }}>{order.pickupCode}</strong>
            </p>}

            {order.status === "CANCELLED" && order.customerCancellationRefund && (
              <p role="status">{refundLabels[order.customerCancellationRefund.refundStatus] || "État du remboursement non disponible"}</p>
            )}

            {order.status === "CANCELLED" && order.cancellationReason && (
              <p className="text-sm" style={{ color: "#FF6B6B" }}>
                Motif : {order.cancellationReason}
              </p>
            )}

            {order.status === "CONFIRMED" && (
              Date.now() < new Date(order.offer.pickupStart).getTime() - 60 * 60 * 1000 ? (
                <>
                  <p className="text-sm" style={{ color: "#8FA396" }}>
                    Annulation possible jusqu'a{" "}
                    {formatDateTime(
                      new Date(
                        new Date(order.offer.pickupStart).getTime() - 60 * 60 * 1000
                      ).toISOString()
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleCancel(order.id)}
                    disabled={cancelingId !== null}
                    className="mt-2 self-start rounded-full px-5 py-2 text-sm font-bold"
                    style={{
                      backgroundColor: "rgba(255,107,107,0.12)",
                      color: "#FF6B6B",
                      border: "1px solid rgba(255,107,107,0.35)",
                    }}
                  >
                    {cancelingId === order.id ? "Annulation..." : "Annuler la commande"}
                  </button>
                </>
              ) : (
                <p className="text-sm" style={{ color: "#FF6B6B" }}>
                  Delai d'annulation depasse
                </p>
              )
            )}
          </article>
        ))}
      </div>
    </main>
  );
}
