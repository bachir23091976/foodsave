"use client";

import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");

    try {
      const res = await fetch("http://localhost:4000/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.message || "Une erreur est survenue");
        return;
      }

      localStorage.setItem("token", data.token);
      setMessage(`Bienvenue, ${data.user.firstName} !`);
    } catch {
      setMessage("Impossible de contacter le serveur");
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold text-green-700 mb-6">Se connecter</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-sm">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border border-gray-300 rounded p-2"
          required
        />
        <input
          type="password"
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border border-gray-300 rounded p-2"
          required
        />
        <button
          type="submit"
          className="bg-green-700 text-white rounded p-2 font-semibold hover:bg-green-800"
        >
          Se connecter
        </button>
      </form>

      {message && <p className="mt-4 text-gray-700">{message}</p>}
    </main>
  );
}