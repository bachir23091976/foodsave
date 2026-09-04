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
  CONFIRMED: "A recuperer",
  COMPLETED: "Deja recuperee",
  CANCELLED: "Annulee",
};

export default function ReservationsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
          </article>
        ))}
      </div>
    </main>
  );
}