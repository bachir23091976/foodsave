"use client";

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
          throw new Error(data?.message || "Impossible de charger les réservations");
        }
        return data;
      })
      .then((data) => {
        setOrders(data.orders || []);
        setListError("");
      })
      .catch((err) => setListError(err?.message || "Impossible de charger les réservations"))
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
      setValidateMessage({ type: "error", text: "Vous devez être connecté" });
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
        setValidateMessage({ type: "error", text: data.message || "Erreur lors de la validation" });
        setValidating(false);
        return;
      }

      setValidateMessage({ type: "success", text: "Réservation validée avec succès !" });
      setManualCode("");
      loadOrders();
    } catch {
      setValidateMessage({ type: "error", text: "Impossible de contacter le serveur" });
    } finally {
      setValidating(false);
    }
  };

  const handleMerchantCancel = async (orderId: string) => {
    const reason = window.prompt(
      "Motif : Produit épuisé, commerce fermé, erreur dans l’offre, problème de préparation, ou autre motif"
    );
    if (!reason || reason.trim().length < 3) return;

    const confirmed = window.confirm(
      "Annuler cette commande et rembourser intégralement le client ?"
    );
    if (!confirmed) return;

    const token = localStorage.getItem("token");
    if (!token) {
      setValidateMessage({ type: "error", text: "Vous devez être connecté" });
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
          text: data.message || "Impossible d'annuler la commande",
        });
        return;
      }

      setValidateMessage({ type: "success", text: data.message });
      loadOrders();
    } catch {
      setValidateMessage({ type: "error", text: "Impossible de contacter le serveur" });
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
      setScanError("Le scan caméra n'est pas disponible sur cet appareil/navigateur");
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
      setScanError("Impossible d'accéder à la caméra (permission refusée ou indisponible)");
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
    return date.toLocaleString("fr-CA", {
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
    <MerchantShell title="Réservations" description="Accueillez vos clients et validez leur récupération avec un QR ou un code de réservation.">
      <section className={s.panel + " " + s.scanner} aria-label="Valider une récupération">
        <div className={s.scanArea}><h2>Scanner le QR code</h2><p className={s.help}>Présentez le code du client devant la caméra. La lecture lance la validation existante.</p>
          {scanning ? <><video ref={videoRef} muted playsInline /><canvas ref={canvasRef} hidden /><button type="button" onClick={stopScan} className={ui.secondary}>Arrêter le scan</button></> : <button type="button" onClick={startScan} className={ui.button}>Scanner le QR code</button>}
          {scanError && <p role="alert" className={s.notice + " " + s.error}>{scanError}</p>}
        </div>
        <div><h2>Ou saisir le code</h2><p className={s.help}>Le client peut aussi vous présenter son code de réservation.</p>
          <label className={s.field} htmlFor="manual-pickup-code" style={{ marginTop: 18 }}>Code de réservation</label>
          <div className={s.manualEntry}><input id="manual-pickup-code" type="text" placeholder="Coller ou saisir le code" value={manualCode} onChange={(e) => setManualCode(e.target.value)} className={s.codeInput} /><button type="button" onClick={() => handleValidate()} disabled={validating || !manualCode.trim()} className={ui.button}>{validating ? "Validation…" : "Valider"}</button></div>
        </div>
      </section>
      {validateMessage && <p role="status" className={s.notice + (validateMessage.type === "error" ? " " + s.error : "")}>{validateMessage.text}</p>}
      {loadingOrders && <p role="status" className={s.notice}>Chargement des réservations…</p>}
      {listError && <p role="alert" className={s.notice + " " + s.error}>{listError}</p>}
      {!loadingOrders && !listError && <>
        {[
          { title: "À récupérer", orders: toRecover },
          { title: "Fenêtre de récupération terminée", orders: expired },
        ].map(group => <section key={group.title}>
          <h2 className={s.groupTitle}>{group.title} ({group.orders.length})</h2>
          {group.orders.length === 0 ? <div className={s.empty}><p>Aucune réservation dans cette catégorie.</p></div> : <div className={s.cards}>{group.orders.map(order => <article key={order.id} className={s.card + " " + s.reservation}>
            <div className={s.cardTop}><h3>{order.offer.title}</h3><strong>{order.totalPrice.toFixed(2)} $</strong></div>
            <span className={s.badge + " " + s.warning}>Confirmée · À récupérer</span>
            <p className={s.help}>{order.user.firstName} {order.user.lastName}</p><p className={s.help}>Réservé le {formatDateTime(order.createdAt)} · Fin du créneau : {formatDateTime(order.offer.pickupEnd)}</p>
            <div className={s.codeRow}><code>{order.pickupCode}</code><button type="button" onClick={() => handleValidate(order.pickupCode)} className={ui.secondary}>Utiliser</button></div>
            <div className={s.actions}><button type="button" onClick={() => handleMerchantCancel(order.id)} disabled={cancelingId === order.id} className={s.dangerButton}>{cancelingId === order.id ? "Annulation…" : "Annuler et rembourser"}</button></div>
          </article>)}</div>}
        </section>)}
        {[
          { title: "Déjà récupérées", orders: recovered, label: "Récupérée", tone: s.success },
          { title: "Annulées", orders: cancelled, label: "Annulée", tone: s.danger },
        ].map(group => <section key={group.title}><h2 className={s.groupTitle}>{group.title} ({group.orders.length})</h2>
          {group.orders.length === 0 ? <div className={s.empty}><p>Aucune réservation dans cette catégorie.</p></div> : <div className={s.cards}>{group.orders.map(order => <article key={order.id} className={s.card}>
            <div className={s.cardTop}><h3>{order.offer.title}</h3><span className={s.badge + " " + group.tone}>{group.label}</span></div><p className={s.help}>{order.user.firstName} {order.user.lastName} · {order.totalPrice.toFixed(2)} $</p><p className={s.help}>Réservé le {formatDateTime(order.createdAt)}</p>
            {order.status === "CANCELLED" && order.cancellationReason && <p className={s.help}>Motif : {order.cancellationReason}</p>}
          </article>)}</div>}
        </section>)}
      </>}
    </MerchantShell>
  );
}
