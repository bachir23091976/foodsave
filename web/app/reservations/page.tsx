"use client";

import { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import { API_URL } from "../lib/api";

interface Order {
  id: string;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
  totalPrice: number;
  pickupCode: string;
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
  CANCELLED: "Annul\u00e9e",
};

export default function ReservationsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      setError("Vous devez etre connecte pour voir vos reservations");
      setLoading(false);
      return;
    }

    fetch(`${API_URL}/orders/mine`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Erreur");
        setOrders(data.orders || []);
      })
      .catch(() => setError("Impossible de charger vos reservations"))
      .finally(() => setLoading(false));
  }, []);

  const formatDateTime = (iso: string) =>
    new Date(iso).toLocaleString("fr-CA", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const handleCancel = async (orderId: string) => {
    const confirmed = window.confirm(
      "Voulez-vous annuler cette commande ? Le remboursement sera envoye vers votre moyen de paiement initial."
    );
    if (!confirmed) return;

    const token = localStorage.getItem("token");
    if (!token) {
      setMessage("Vous devez etre connecte");
      return;
    }

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

      setOrders((current) =>
        current.map((order) =>
          order.id === orderId ? { ...order, status: "CANCELLED" } : order
        )
      );
      setMessage(data.message);
    } catch {
      setMessage("Impossible de contacter le serveur");
    } finally {
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
      {message && <p className="text-center px-6 mb-4" style={{ color: "#FFB100" }}>{message}</p>}

      {!loading && !error && orders.length === 0 && (
        <p className="text-center" style={{ color: "#8FA396" }}>
          Vous n'avez encore aucune reservation.
        </p>
      )}

      <div className="grid gap-4 max-w-2xl mx-auto px-6 pb-20">
        {orders.map((order) => (
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
              <span style={{ color: "#37D67A" }}>{statusLabels[order.status]}</span>
            </div>

            <p>{order.offer.merchant.name} - {order.offer.merchant.city}</p>
            <p style={{ color: "#8FA396" }}>
              Recuperation : {formatDateTime(order.offer.pickupStart)} - {formatDateTime(order.offer.pickupEnd)}
            </p>
            <p>Prix : <strong>{order.totalPrice.toFixed(2)} $</strong></p>
            <p>
              Code de recuperation : <strong style={{ color: "#FFB100" }}>{order.pickupCode}</strong>
            </p>

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
                    disabled={cancelingId === order.id}
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
