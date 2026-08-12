"use client";

import { useEffect, useState } from "react";

export default function ReferralPage() {
  const [referralCode, setReferralCode] = useState("");
  const [referralCount, setReferralCount] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    fetch("http://localhost:4000/users/referral", {
      headers: { Authorization: "Bearer " + token },
    })
      .then((res) => res.json())
      .then((data) => {
        setReferralCode(data.referralCode || "");
        setReferralCount(data.referralCount || 0);
      })
      .catch(() => {});
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(referralCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="min-h-screen flex flex-col items-center p-8">
      <h1 className="text-3xl font-bold text-green-700 mb-4">
        Inviter un ami
      </h1>

      <p className="text-center text-gray-600 max-w-sm mb-6">
        Partagez votre code avec un ami. Quand il fait sa premiere commande, vous recevez tous les deux une recompense de fidelite !
      </p>

      <div className="bg-green-50 border border-green-200 rounded-lg p-6 max-w-sm w-full text-center mb-4">
        <p className="text-sm text-gray-500 mb-2">Votre code de parrainage</p>
        <p className="text-2xl font-bold text-green-700 mb-4">{referralCode}</p>
        <button
          onClick={handleCopy}
          className="bg-green-700 text-white rounded p-2 px-6 font-semibold hover:bg-green-800"
        >
          {copied ? "Copie !" : "Copier le code"}
        </button>
      </div>

      <p className="text-gray-600">
        Vous avez deja invite <span className="font-bold text-green-700">{referralCount}</span> ami{referralCount > 1 ? "s" : ""}
      </p>
    </main>
  );
}