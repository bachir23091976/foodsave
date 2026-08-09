"use client";

import { useEffect, useState } from "react";

interface Sale {
  id: string;
  title: string;
  totalPrice: number;
  commission: number;
  net: number;
  date: string;
}

interface Summary {
  totalSales: number;
  totalRevenue: number;
  totalCommission: number;
  totalNet: number;
}

export default function MerchantSalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setError("Vous devez etre connecte");
      setLoading(false);
      return;
    }

    fetch("http://localhost:4000/merchants/sales", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        setSales(data.sales || []);
        setSummary(data.summary || null);
        setLoading(false);
      })
      .catch(() => {
        setError("Impossible de charger vos ventes");
        setLoading(false);
      });
  }, []);

  const formatDate = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleDateString("fr-CA", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-3xl font-bold text-green-700 mb-6 text-center">
        Mes ventes
      </h1>

      {loading && <p className="text-center text-gray-500">Chargement...</p>}
      {error && <p className="text-center text-red-600">{error}</p>}

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto mb-8">
          <div className="border rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-green-700">{summary.totalSales}</p>
            <p className="text-sm text-gray-500">Ventes completees</p>
          </div>
          <div className="border rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-green-700">{summary.totalRevenue.toFixed(2)} $</p>
            <p className="text-sm text-gray-500">Chiffre d&apos;affaires</p>
          </div>
          <div className="border rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-orange-600">{summary.totalCommission.toFixed(2)} $</p>
            <p className="text-sm text-gray-500">Commission FoodSave</p>
          </div>
          <div className="border rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-blue-700">{summary.totalNet.toFixed(2)} $</p>
            <p className="text-sm text-gray-500">Montant net recu</p>
          </div>
        </div>
      )}

      {!loading && sales.length === 0 && (
        <p className="text-center text-gray-500">Aucune vente completee pour le moment.</p>
      )}

      <div className="grid gap-3 max-w-2xl mx-auto">
        {sales.map((sale) => (
          <div key={sale.id} className="border border-gray-200 rounded-lg p-4 flex justify-between items-center">
            <div>
              <p className="font-semibold">{sale.title}</p>
              <p className="text-xs text-gray-400">{formatDate(sale.date)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Total : {sale.totalPrice.toFixed(2)} $</p>
              <p className="text-sm text-orange-600">Commission : -{sale.commission.toFixed(2)} $</p>
              <p className="text-sm font-semibold text-blue-700">Net : {sale.net.toFixed(2)} $</p>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}