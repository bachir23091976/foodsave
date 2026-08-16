"use client";

import { useEffect, useState } from "react";
import { API_URL } from "../lib/api";

interface Reward {
  id: string;
  code: string;
  discountCad: number;
}

export default function LoyaltyBanner() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [ordersUntilNext, setOrdersUntilNext] = useState<number | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    fetch(`${API_URL}/loyalty`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        setRewards(data.rewards || []);
        setOrdersUntilNext(data.ordersUntilNextReward ?? null);
      })
      .catch(() => {});
  }, []);

  if (rewards.length === 0 && ordersUntilNext === null) {
    return null;
  }

  return (
    <div className="max-w-2xl mx-auto mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
      {rewards.length > 0 && (
        <p className="text-green-800 font-semibold">
          🎁 Vous avez {rewards.length} récompense{rewards.length > 1 ? "s" : ""} de fidélité disponible{rewards.length > 1 ? "s" : ""} ({rewards[0].discountCad}% de réduction) !
        </p>
      )}
      {ordersUntilNext !== null && ordersUntilNext > 0 && (
        <p className="text-sm text-green-700 mt-1">
          Plus que {ordersUntilNext} commande{ordersUntilNext > 1 ? "s" : ""} avant votre prochaine récompense !
        </p>
      )}
    </div>
  );
}