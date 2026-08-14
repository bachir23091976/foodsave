"use client";

import Link from "next/link";

const bg = "#06110C";
const amber = "#FFB100";
const jade = "#17C989";

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50" style={{ backgroundColor: "rgba(6,17,12,0.92)", backdropFilter: "blur(8px)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg" style={{ color: "#F5F1E8" }}>
          Food<span style={{ color: amber }}>Save</span>
        </Link>

        <div className="hidden md:flex items-center gap-7 text-sm" style={{ color: "#8FA396" }}>
          <Link href="/" className="hover:text-white">Accueil</Link>
          <Link href="/offers" className="hover:text-white">Offres</Link>
          <Link href="/register-merchant" className="hover:text-white">Devenir partenaire</Link>
          <Link href="#apropos" className="hover:text-white">A propos</Link>
          <Link href="#contact" className="hover:text-white">Contact</Link>
        </div>

        <Link
          href="/offers"
          className="px-5 py-2 rounded-full font-bold uppercase tracking-wide text-xs"
          style={{ backgroundColor: amber, color: bg }}
        >
          Voir les offres
        </Link>
      </div>
    </nav>
  );
}
