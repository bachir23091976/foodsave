"use client";

import { useEffect, useRef, useState } from "react";
import { Bebas_Neue, Space_Grotesk } from "next/font/google";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import { API_URL } from "../../lib/api";

const display = Bebas_Neue({ subsets: ["latin"], weight: "400" });
const body = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });

const bg = "#06110C";
const amber = "#FFB100";
const jade = "#17C989";
const dim = "#8FA396";

interface MerchantOrder {
  id: string;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
  totalPrice: number;
  pickupCode: string;
  createdAt: string;
  offer: {
    id: string;
    title: string;
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

  const toRecover = orders.filter((o) => o.status !== "COMPLETED");
  const recovered = orders.filter((o) => o.status === "COMPLETED");

  return (
    <main className={body.className} style={{ backgroundColor: bg, color: "#F5F1E8", minHeight: "100vh" }}>
      <Navbar />

      <section className="px-6 pt-14 pb-6 text-center">
        <p className="text-xs tracking-[0.4em] uppercase mb-3" style={{ color: jade }}>
          Espace commerçant
        </p>
        <h1 className={display.className} style={{ fontSize: "clamp(2.2rem, 6vw, 4rem)" }}>
          RÉSERVATIONS
        </h1>
        <p className="mt-3 max-w-md mx-auto" style={{ color: dim }}>
          Scannez le QR code du client ou saisissez le code de réservation pour valider une récupération.
        </p>
      </section>

      <div className="max-w-md mx-auto px-6 mb-10">
        <div
          className="rounded-2xl p-5"
          style={{ backgroundColor: "#0D1912", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          {scanning ? (
            <div className="flex flex-col gap-3">
              <div className="relative rounded-xl overflow-hidden" style={{ backgroundColor: "#000" }}>
                <video ref={videoRef} className="w-full h-auto" muted playsInline />
              </div>
              <canvas ref={canvasRef} className="hidden" />
              <button
                onClick={stopScan}
                className="rounded-full px-6 py-3 font-bold uppercase tracking-wide text-sm"
                style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "#F5F1E8" }}
              >
                Arrêter le scan
              </button>
            </div>
          ) : (
            <button
              onClick={startScan}
              className="w-full rounded-full px-6 py-3 font-bold uppercase tracking-wide text-sm"
              style={{ backgroundColor: jade, color: bg }}
            >
              Scanner le QR code
            </button>
          )}

          {scanError && <p className="text-sm mt-3" style={{ color: "#FF6B6B" }}>{scanError}</p>}

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px" style={{ backgroundColor: "rgba(255,255,255,0.1)" }} />
            <span className="text-xs uppercase tracking-wide" style={{ color: dim }}>ou</span>
            <div className="flex-1 h-px" style={{ backgroundColor: "rgba(255,255,255,0.1)" }} />
          </div>

          <label htmlFor="manual-pickup-code" className="sr-only">Code de réservation</label>
          <div className="flex gap-2">
            <input
              id="manual-pickup-code"
              type="text"
              placeholder="Coller ou saisir le code de réservation"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              className="rounded-full px-5 py-3 outline-none flex-1 text-sm"
              style={{ backgroundColor: "#06110C", border: "1px solid rgba(255,255,255,0.15)", color: "#F5F1E8" }}
            />
            <button
              onClick={() => handleValidate()}
              disabled={validating || !manualCode.trim()}
              className="rounded-full px-6 font-bold uppercase tracking-wide text-xs"
              style={{ backgroundColor: amber, color: bg, opacity: validating || !manualCode.trim() ? 0.6 : 1 }}
            >
              {validating ? "..." : "Valider"}
            </button>
          </div>

          {validateMessage && (
            <p
              className="text-sm mt-3 font-bold"
              style={{ color: validateMessage.type === "success" ? jade : "#FF6B6B" }}
            >
              {validateMessage.type === "success" ? "✓ " : ""}
              {validateMessage.text}
            </p>
          )}
        </div>
      </div>

      {loadingOrders && <p className="text-center" style={{ color: dim }}>Chargement des réservations...</p>}
      {listError && <p className="text-center" style={{ color: "#FF6B6B" }}>{listError}</p>}

      {!loadingOrders && !listError && (
        <div className="max-w-2xl mx-auto px-6 pb-20">
          <h2 className="text-sm uppercase tracking-wide font-bold mb-3" style={{ color: amber }}>
            À récupérer ({toRecover.length})
          </h2>
          {toRecover.length === 0 ? (
            <p className="text-sm mb-8" style={{ color: dim }}>Aucune réservation en attente de récupération.</p>
          ) : (
            <div className="grid gap-3 mb-10">
              {toRecover.map((order) => (
                <div
                  key={order.id}
                  className="rounded-2xl p-4"
                  style={{ backgroundColor: "#0D1912", border: "1px solid rgba(255,177,0,0.3)" }}
                >
                  <div className="flex justify-between items-start mb-1">
                    <p className="font-bold">{order.offer.title}</p>
                    <span className="font-bold" style={{ color: amber }}>{order.totalPrice.toFixed(2)} $</span>
                  </div>
                  <p className="text-sm" style={{ color: dim }}>
                    {order.user.firstName} {order.user.lastName}
                  </p>
                  <p className="text-xs mt-1" style={{ color: dim, opacity: 0.7 }}>
                    Réservé le {formatDateTime(order.createdAt)}
                  </p>
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <code
                      className="text-xs px-2 py-1 rounded flex-1 truncate"
                      style={{ backgroundColor: "#06110C", color: "#F5F1E8" }}
                    >
                      {order.pickupCode}
                    </code>
                    <button
                     onClick={() => handleValidate(order.pickupCode)}
                      className="text-xs px-3 py-1 rounded-full font-bold uppercase whitespace-nowrap"
                      style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "#F5F1E8" }}
                    >
                      Utiliser
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <h2 className="text-sm uppercase tracking-wide font-bold mb-3" style={{ color: jade }}>
            Déjà récupérées ({recovered.length})
          </h2>
          {recovered.length === 0 ? (
            <p className="text-sm" style={{ color: dim }}>Aucune réservation récupérée pour le moment.</p>
          ) : (
            <div className="grid gap-3">
              {recovered.map((order) => (
                <div
                  key={order.id}
                  className="rounded-2xl p-4"
                  style={{ backgroundColor: "#0D1912", border: "1px solid rgba(23,201,137,0.2)", opacity: 0.75 }}
                >
                  <div className="flex justify-between items-start mb-1">
                    <p className="font-bold">{order.offer.title}</p>
                    <span className="font-bold" style={{ color: jade }}>{order.totalPrice.toFixed(2)} $</span>
                  </div>
                  <p className="text-sm" style={{ color: dim }}>
                    {order.user.firstName} {order.user.lastName}
                  </p>
                  <p className="text-xs mt-1" style={{ color: dim, opacity: 0.7 }}>
                    Réservé le {formatDateTime(order.createdAt)}
                  </p>
                  <p className="text-xs mt-1 font-bold" style={{ color: jade }}>✓ Récupérée</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Footer />
    </main>
  );
}
