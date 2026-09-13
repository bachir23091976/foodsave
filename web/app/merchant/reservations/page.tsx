"use client";
import { useLocale } from "../../lib/i18n/LocaleProvider";


import { useEffect, useRef, useState } from "react";
import MerchantShell from "../../components/merchant/MerchantShell";
import s from "../../components/merchant/merchant.module.css";
import ui from "../../components/public.module.css";
import { API_URL } from "../../lib/api";

interface MerchantOrder {
  id: string;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
  totalPrice: number;
  pickupCode: string;
  cancellationReason?: string | null;
  createdAt: string;
  offer: {
    id: string;
    title: string;
    pickupEnd: string;
  };
  user: {
    firstName: string;
    lastName: string;
    email: string;
  };
}

export default function MerchantReservationsPage() {
  const { t, message: msg, money, number, intlLocale } = useLocale();
  const [orders, setOrders] = useState<MerchantOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [listError, setListError] = useState("");

  const [manualCode, setManualCode] = useState("");
  const [validating, setValidating] = useState(false);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [validateMessage, setValidateMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const loadOrders = () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoadingOrders(false);
      return;
    }

    setLoadingOrders(true);
    fetch(`${API_URL}/orders/merchant`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.message || "ui.unable_to_load_reservations");
        }
        return data;
      })
      .then((data) => {
        setOrders(data.orders || []);
        setListError("");
      })
      .catch((err) => setListError(err?.message || "ui.unable_to_load_reservations"))
      .finally(() => setLoadingOrders(false));
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const handleValidate = async (codeParam?: string) => {
    const code = (codeParam ?? manualCode).trim();
    if (!code) return;

    setValidating(true);
    setValidateMessage(null);

    const token = localStorage.getItem("token");
    if (!token) {
      setValidateMessage({ type: "error", text: "ui.you_must_be_signed_in" });
      setValidating(false);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/orders/validate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ pickupCode: code }),
      });

      const data = await res.json();

      if (!res.ok) {
        setValidateMessage({ type: "error", text: data.message || "ui.unable_to_validate_the_reservation" });
        setValidating(false);
        return;
      }

      setValidateMessage({ type: "success", text: "ui.reservation_validated_successfully" });
      setManualCode("");
      loadOrders();
    } catch {
      setValidateMessage({ type: "error", text: "ui.unable_to_contact_the_server" });
    } finally {
      setValidating(false);
    }
  };

  const handleMerchantCancel = async (orderId: string) => {
    const reason = window.prompt(
      t("ui.reason_sold_out_business_closed_incorrect_offer_preparation_issue")
    );
    if (!reason || reason.trim().length < 3) return;

    const confirmed = window.confirm(
      t("ui.cancel_this_order_and_fully_refund_the_customer")
    );
    if (!confirmed) return;

    const token = localStorage.getItem("token");
    if (!token) {
      setValidateMessage({ type: "error", text: "ui.you_must_be_signed_in" });
      return;
    }

    setCancelingId(orderId);
    setValidateMessage(null);

    try {
      const res = await fetch(`${API_URL}/orders/merchant/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orderId, reason: reason.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setValidateMessage({
          type: "error",
          text: data.message || "ui.unable_to_cancel_the_order",
        });
        return;
      }

      setValidateMessage({ type: "success", text: data.message });
      loadOrders();
    } catch {
      setValidateMessage({ type: "error", text: "ui.unable_to_contact_the_server" });
    } finally {
      setCancelingId(null);
    }
  };

  const stopScan = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setScanning(false);
  };

  const startScan = async () => {
    setScanError("");
    setValidateMessage(null);

    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setScanError("ui.camera_scanning_is_not_available_on_this_device_or");
      return;
    }
    setScanning(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const { default: jsQR } = await import("jsqr");

      const tick = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;

        if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d");

          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);

            if (code && code.data) {
              const scannedValue = code.data;
              stopScan();
              setManualCode(scannedValue);
              handleValidate(scannedValue);
              return;
            }
          }
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setScanError("ui.unable_to_access_the_camera_permission_denied_or_unavailable");
      stopScan();
    }
  };

  useEffect(() => {
    return () => {
      stopScan();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatDateTime = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleString(intlLocale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };
  const now = Date.now();
  const toRecover = orders.filter(
    (o) =>
      o.status === "CONFIRMED" &&
      new Date(o.offer.pickupEnd).getTime() >= now
  );
  const expired = orders.filter(
    (o) => o.status === "CONFIRMED" && new Date(o.offer.pickupEnd).getTime() < now
  );
  const recovered = orders.filter((o) => o.status === "COMPLETED");
  const cancelled = orders.filter((o) => o.status === "CANCELLED");

  return (
    <MerchantShell title={t("ui.reservations")} description={t("ui.welcome_your_customers_and_validate_pickup_with_a_qr")}>
      <section className={s.panel + " " + s.scanner} aria-label={t("ui.validate_a_pickup")}>
        <div className={s.scanArea}><h2>{t("ui.scan_qr_code")}</h2><p className={s.help}>{t("ui.hold_the_customers_code_in_front_of_the_camera")}</p>
          {scanning ? <><video ref={videoRef} muted playsInline /><canvas ref={canvasRef} hidden /><button type="button" onClick={stopScan} className={ui.secondary}>{t("ui.stop_scanning")}</button></> : <button type="button" onClick={startScan} className={ui.button}>{t("ui.scan_qr_code")}</button>}
          {scanError && <p role="alert" className={s.notice + " " + s.error}>{msg(scanError)}</p>}
        </div>
        <div><h2>{t("ui.or_enter_the_code")}</h2><p className={s.help}>{t("ui.customers_can_also_show_you_their_reservation_code")}</p>
          <label className={s.field} htmlFor="manual-pickup-code" style={{ marginTop: 18 }}>{t("ui.reservation_code")}</label>
          <div className={s.manualEntry}><input id="manual-pickup-code" type="text" placeholder={t("ui.paste_or_enter_the_code")} value={manualCode} onChange={(e) => setManualCode(e.target.value)} className={s.codeInput} /><button type="button" onClick={() => handleValidate()} disabled={validating || !manualCode.trim()} className={ui.button}>{validating ? t("ui.validating") : t("ui.validate")}</button></div>
        </div>
      </section>
      {validateMessage && <p role="status" className={s.notice + (validateMessage.type === "error" ? " " + s.error : "")}>{msg(validateMessage.text)}</p>}
      {loadingOrders && <p role="status" className={s.notice}>{t("ui.loading_reservations")}</p>}
      {listError && <p role="alert" className={s.notice + " " + s.error}>{msg(listError)}</p>}
      {!loadingOrders && !listError && <>
        {[
          { title: t("ui.awaiting_pickup"), orders: toRecover },
          { title: t("ui.pickup_window_ended"), orders: expired },
        ].map(group => <section key={group.title}>
          <h2 className={s.groupTitle}>{group.title} ({group.orders.length})</h2>
          {group.orders.length === 0 ? <div className={s.empty}><p>{t("ui.no_reservations_in_this_category")}</p></div> : <div className={s.cards}>{group.orders.map(order => <article key={order.id} className={s.card + " " + s.reservation}>
            <div className={s.cardTop}><h3>{order.offer.title}</h3><strong>{money(order.totalPrice)}</strong></div>
            <span className={s.badge + " " + s.warning}>{t("ui.confirmed_awaiting_pickup")}</span>
            <p className={s.help}>{order.user.firstName} {order.user.lastName}</p><p className={s.help}>{t("ui.reserved_on")}{" "}{formatDateTime(order.createdAt)} {t("ui._pickup_ends")}{" "}{formatDateTime(order.offer.pickupEnd)}</p>
            <div className={s.codeRow}><code>{order.pickupCode}</code><button type="button" onClick={() => handleValidate(order.pickupCode)} className={ui.secondary}>{t("ui.validate_pickup")}</button></div>
            <div className={s.actions}><button type="button" onClick={() => handleMerchantCancel(order.id)} disabled={cancelingId === order.id} className={s.dangerButton}>{cancelingId === order.id ? t("ui.cancelling") : t("ui.cancel_and_refund")}</button></div>
          </article>)}</div>}
        </section>)}
        {[
          { title: t("ui.already_picked_up_2"), orders: recovered, label: t("ui.picked_up"), tone: s.success },
          { title: t("ui.cancelled"), orders: cancelled, label: t("ui.cancelled_2"), tone: s.danger },
        ].map(group => <section key={group.title}><h2 className={s.groupTitle}>{group.title} ({group.orders.length})</h2>
          {group.orders.length === 0 ? <div className={s.empty}><p>{t("ui.no_reservations_in_this_category")}</p></div> : <div className={s.cards}>{group.orders.map(order => <article key={order.id} className={s.card}>
            <div className={s.cardTop}><h3>{order.offer.title}</h3><span className={s.badge + " " + group.tone}>{group.label}</span></div><p className={s.help}>{order.user.firstName} {order.user.lastName} · {money(order.totalPrice)}</p><p className={s.help}>{t("ui.reserved_on")}{" "}{formatDateTime(order.createdAt)}</p>
            {order.status === "CANCELLED" && order.cancellationReason && <p className={s.help}>{t("ui.reason")}{" "}{order.cancellationReason}</p>}
          </article>)}</div>}
        </section>)}
      </>}
    </MerchantShell>
  );
}
