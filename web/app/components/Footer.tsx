"use client";

import Link from "next/link";

const amber = "#FFB100";
const dim = "#8FA396";

export default function Footer() {
  return (
    <footer id="contact" className="border-t px-6 py-14" style={{ borderColor: "rgba(255,255,255,0.08)", backgroundColor: "#06110C", color: "#F5F1E8" }}>
      <div className="max-w-6xl mx-auto grid md:grid-cols-4 gap-10 text-sm">
        <div>
          <p className="font-bold text-lg mb-2">
            Food<span style={{ color: amber }}>Save</span>
          </p>
          <p style={{ color: dim }}>
            Marketplace anti-gaspillage alimentaire a Ottawa. Sauvez de la nourriture, economisez de l argent.
          </p>
        </div>

        <div>
          <p className="font-bold mb-3">Navigation</p>
          <div className="flex flex-col gap-2" style={{ color: dim }}>
            <Link href="/" className="hover:text-white">Accueil</Link>
            <Link href="/offers" className="hover:text-white">Offres</Link>
            <Link href="/register-merchant" className="hover:text-white">Devenir partenaire</Link>
          </div>
        </div>

        <div>
          <p className="font-bold mb-3">Contact</p>
          <div className="flex flex-col gap-2" style={{ color: dim }}>
            <span>Ottawa, Ontario</span>
            <span>info@foodsave.ca</span>
          </div>
        </div>

        <div>
          <p className="font-bold mb-3">Legal</p>
          <div className="flex flex-col gap-2" style={{ color: dim }}>
            <span>Conditions d utilisation</span>
            <span>Politique de confidentialite</span>
          </div>
        </div>
      </div>

      <p className="text-center mt-10 text-xs" style={{ color: dim }}>
        FoodSave - Ottawa, Canada
      </p>
    </footer>
  );
}
