"use client";
import { useLocale } from "../lib/i18n/LocaleProvider";


import { useCallback, useEffect, useRef, useState } from "react";
import Navbar from "../components/Navbar";
import s from "../components/public.module.css";
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
  PENDING: "ui.pending",
  CONFIRMED: "ui.awaiting_pickup",
  COMPLETED: "ui.already_picked_up",
  CANCELLED: "ui.reservation_cancelled",
};

const refundLabels: Record<string, string> = {
  SUCCEEDED: "ui.refund_completed",
  PENDING: "ui.refund_pending",
  REQUIRES_ACTION: "ui.refund_incomplete_review_needed",
  UNKNOWN: "ui.refund_outcome_under_review",
  FAILED: "ui.refund_requires_review",
  CANCELED: "ui.refund_requires_review",
  NEEDS_REVIEW: "ui.refund_requires_review",
};

export default function ReservationsPage() {
  const { t, text: tr, message: msg, money, number, intlLocale } = useLocale();
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
      setError("ui.sign_in_to_view_your_reservations");
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
        setError("ui.unable_to_verify_your_reservations_refresh_their_status_before");
      }
    } finally {
      if (version === readVersion.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  const formatDateTime = (iso: string) =>
    new Date(iso).toLocaleString(intlLocale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const handleCancel = async (orderId: string) => {
    if (cancellationInFlight.current) return;
    const confirmed = window.confirm(
      t("ui.cancel_this_order_any_refund_will_go_to_your")
    );
    if (!confirmed) return;

    const token = localStorage.getItem("token");
    if (!token) {
      setMessage("ui.you_must_be_signed_in_2");
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
        setMessage(data.message || "ui.unable_to_cancel_the_order");
        return;
      }

      setMessage(data.message);
    } catch {
      setMessage("ui.unable_to_contact_the_server");
    } finally {
      await loadOrders();
      cancellationInFlight.current = false;
      setCancelingId(null);
    }
  };

  return (
    <main className={s.page + " " + s.accountPage} style={{ backgroundColor: "#faf8f2", color: "#183e32", minHeight: "100vh" }}>
      <Navbar />

      <section className="px-6 pt-14 pb-6 text-center">
        <p className="text-xs tracking-[0.4em] uppercase mb-3" style={{ color: "#215d43" }}>
          {t("ui.my_foodsave_purchases")}</p>
        <h1 className="text-4xl font-bold">{t("ui.my_reservations_2")}</h1>
      </section>

      {loading && <p className="text-center">{t("ui.loading")}</p>}
      {error && <p className="text-center" style={{ color: "#9d3529" }}>{msg(error)}</p>}
      {error && <button type="button" onClick={() => void loadOrders()} disabled={loading || cancelingId !== null} className="block mx-auto my-4">{t("ui.refresh_reservations")}</button>}
      {message && <p className="text-center px-6 mb-4" style={{ color: "#215d43" }}>{msg(message)}</p>}

      {!loading && !error && orders.length === 0 && (
        <p className="text-center" style={{ color: "#59685e" }}>
          {t("ui.you_have_no_reservations_yet")}</p>
      )}

      <div className="grid gap-4 max-w-2xl mx-auto px-6 pb-20">
        {!loading && !error && orders.map((order) => (
          <article
            key={order.id}
            className="rounded-2xl p-5 grid gap-2"
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid #dce2d8",
            }}
          >
            <div className="flex justify-between gap-3">
              <h2 className="font-bold text-lg">{order.offer.title}</h2>
              <span style={{ color: "#215d43" }}>{cancelingId === order.id ? t("ui.checking_the_reservation") : tr(statusLabels[order.status])}</span>
            </div>

            <p>{order.offer.merchant.name} - {order.offer.merchant.city}</p>
            <p style={{ color: "#59685e" }}>
              {t("ui.pickup_2")}{" "}{formatDateTime(order.offer.pickupStart)} - {formatDateTime(order.offer.pickupEnd)}
            </p>
            <p>{t("ui.price")}{" "}<strong>{money(order.totalPrice)}</strong></p>
            {order.status === "CONFIRMED" && cancelingId !== order.id && <p>
              {t("ui.pickup_code")}{" "}<strong style={{ color: "#215d43" }}>{order.pickupCode}</strong>
            </p>}

            {order.status === "CANCELLED" && order.customerCancellationRefund && (
              <p role="status">{tr(refundLabels[order.customerCancellationRefund.refundStatus] || t("ui.refund_status_unavailable"))}</p>
            )}

            {order.status === "CANCELLED" && order.cancellationReason && (
              <p className="text-sm" style={{ color: "#9d3529" }}>
                {t("ui.reason")}{" "}{order.cancellationReason}
              </p>
            )}

            {order.status === "CONFIRMED" && (
              Date.now() < new Date(order.offer.pickupStart).getTime() - 60 * 60 * 1000 ? (
                <>
                  <p className="text-sm" style={{ color: "#59685e" }}>
                    {t("ui.cancellation_available_until")}{" "}
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
                      color: "#9d3529",
                      border: "1px solid rgba(255,107,107,0.35)",
                    }}
                  >
                    {cancelingId === order.id ? t("ui.cancelling") : t("ui.cancel_order")}
                  </button>
                </>
              ) : (
                <p className="text-sm" style={{ color: "#9d3529" }}>
                  {t("ui.cancellation_deadline_passed")}</p>
              )
            )}
          </article>
        ))}
      </div>
    </main>
  );
}
