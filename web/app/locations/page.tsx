"use client";

import { useEffect, useState } from "react";
import { Bebas_Neue, Space_Grotesk } from "next/font/google";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import ScrollReveal from "../components/ScrollReveal";

const display = Bebas_Neue({ subsets: ["latin"], weight: "400" });
const body = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });

const bg = "#06110C";
const amber = "#FFB100";
const jade = "#17C989";
const dim = "#8FA396";

const inputStyle = {
  backgroundColor: "#0D1912",
  border: "1px solid rgba(255,255,255,0.15)",
  color: "#F5F1E8",
};

interface SavedLocation {
  id: string;
  label: string;
  address: string;
}

export default function LocationsPage() {
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const loadLocations = () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    fetch("http://localhost:4000/locations", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setLocations(data.locations || []))
      .catch(() => {});
  };

  useEffect(() => {
    loadLocations();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    const token = localStorage.getItem("token");
    if (!token) {
      setMessage("Vous devez être connecté");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("http://localhost:4000/locations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ label, address }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.message || "Erreur");
        setLoading(false);
        return;
      }

      setMessage("Adresse enregistrée !");
      setLabel("");
      setAddress("");
      loadLocations();
    } catch {
      setMessage("Impossible de contacter le serveur");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (locationId: string) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    await fetch("http://localhost:4000/locations/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ locationId }),
    });

    loadLocations();
  };

  return (
    <main className={body.className} style={{ backgroundColor: bg, color: "#F5F1E8", minHeight: "100vh" }}>
      <Navbar />

      <section className="px-6 pt-14 pb-6 text-center">
        <p className="text-xs tracking-[0.4em] uppercase mb-3" style={{ color: jade }}>
          A proximite
        </p>
        <h1 className={display.className} style={{ fontSize: "clamp(2.2rem, 6vw, 4rem)" }}>
          MES ADRESSES
        </h1>
        <p className="mt-3 max-w-md mx-auto" style={{ color: dim }}>
          Enregistrez vos adresses pour recevoir une alerte des qu une offre apparait pres de chez vous.
        </p>
      </section>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-sm mx-auto px-6 mb-10">
        <input
          type="text"
          placeholder="Nom (ex: Domicile, Travail)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="rounded-full px-5 py-3 outline-none"
          style={inputStyle}
          required
        />
        <input
          type="text"
          placeholder="Adresse"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="rounded-full px-5 py-3 outline-none"
          style={inputStyle}
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-full px-6 py-3 font-bold uppercase tracking-wide text-sm"
          style={{ backgroundColor: amber, color: bg, opacity: loading ? 0.6 : 1 }}
        >
          {loading ? "Enregistrement..." : "Enregistrer cette adresse"}
        </button>
      </form>

      {message && <p className="text-center mb-4" style={{ color: dim }}>{message}</p>}

      <div className="w-full max-w-sm mx-auto px-6 pb-20 flex flex-col gap-3">
        {locations.map((loc, index) => (
          <ScrollReveal key={loc.id} index={index}>
            <div
              className="flex justify-between items-center rounded-2xl p-4"
              style={{ backgroundColor: "#0D1912", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <div>
                <p className="font-bold">{loc.label}</p>
                <p className="text-sm" style={{ color: dim }}>{loc.address}</p>
              </div>
              <button
                onClick={() => handleDelete(loc.id)}
                className="text-sm"
                style={{ color: "#FF6B6B" }}
              >
                Supprimer
              </button>
            </div>
          </ScrollReveal>
        ))}
      </div>

      <Footer />
    </main>
  );
}
