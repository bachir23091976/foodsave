"use client";

import { useLocale } from "../lib/i18n/LocaleProvider";
import { useEffect, useState } from "react";
import { API_URL } from "../lib/api";

interface Reward {
  id: string;
  code: string;
  discountCad: number;
}

export default function LoyaltyBanner() {
  const { count } = useLocale();
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
          {count("loyalty.count", "loyalty.countPlural", rewards.length)}
        </p>
      )}
      {ordersUntilNext !== null && ordersUntilNext > 0 && (
        <p className="text-sm text-green-700 mt-1">
          {count("loyalty.next", "loyalty.nextPlural", ordersUntilNext)}
        </p>
      )}
    </div>
  );
}