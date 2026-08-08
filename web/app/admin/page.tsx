"use client";

import { useEffect, useState } from "react";

interface Stats {
  userCount: number;
  merchantCount: number;
  offerCount: number;
  orderCount: number;
}

interface PendingMerchant {
  id: string;
  name: string;
  city: string;
  type: string;
  owner: { email: string; firstName: string; lastName: string };
}

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [pending, setPending] = useState<PendingMerchant[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadData = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setError("Vous devez être connecté");
      return;
    }

    try {
      const statsRes = await fetch("http://localhost:4000/admin/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const statsData = await statsRes.json();

      if (!statsRes.ok) {
        setError(statsData.message || "Accès refusé");
        return;
      }

      setStats(statsData.stats);

      const pendingRes = await fetch("http://localhost:4000/admin/merchants/pending", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const pendingData = await pendingRes.json();
      setPending(pendingData.merchants || []);
    } catch {
      setError("Impossible de contacter le serveur");
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleApprove = async (merchantId: string) => {
    const token = localStorage.getItem("token");
    setMessage("");

    try {
      const res = await fetch("http://localhost:4000/admin/merchants/approve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ merchantId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.message || "Erreur");
        return;
      }

      setMessage("Commerce approuvé !");
      loadData();
    } catch {
      setMessage("Erreur lors de l'approbation");
    }
  };

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-red-600">{error}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-3xl font-bold text-green-700 mb-6 text-center">
        Dashboard Administrateur
      </h1>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto mb-8">
          <div className="border rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-green-700">{stats.userCount}</p>
            <p className="text-sm text-gray-500">Utilisateurs</p>
          </div>
          <div className="border rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-green-700">{stats.merchantCount}</p>
            <p className="text-sm text-gray-500">Commerces</p>
          </div>
          <div className="border rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-green-700">{stats.offerCount}</p>
            <p className="text-sm text-gray-500">Offres</p>
          </div>
          <div className="border rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-green-700">{stats.orderCount}</p>
            <p className="text-sm text-gray-500">Commandes</p>
          </div>
        </div>
      )}

      <h2 className="text-xl font-semibold mb-4 max-w-2xl mx-auto">
        Commerces en attente d&apos;approbation
      </h2>

      {message && <p className="text-center text-green-700 mb-4">{message}</p>}

      <div className="grid gap-3 max-w-2xl mx-auto">
        {pending.length === 0 && (
          <p className="text-center text-gray-500">Aucun commerce en attente</p>
        )}
        {pending.map((merchant) => (
          <div key={merchant.id} className="border rounded-lg p-4 flex justify-between items-center">
            <div>
              <p className="font-semibold">{merchant.name}</p>
              <p className="text-sm text-gray-500">
                {merchant.type} — {merchant.city}
              </p>
              <p className="text-sm text-gray-400">
                {merchant.owner.firstName} {merchant.owner.lastName} ({merchant.owner.email})
              </p>
            </div>
            <button
              onClick={() => handleApprove(merchant.id)}
              className="bg-green-700 text-white rounded px-4 py-2 font-semibold hover:bg-green-800"
            >
              Approuver
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}