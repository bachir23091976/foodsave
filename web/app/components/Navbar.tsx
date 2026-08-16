"use client";

import Link from "next/link";
import { useState } from "react";

const bg = "#06110C";
const amber = "#FFB100";
const jade = "#17C989";

const NAV_LINKS = [
  { href: "/", label: "Accueil" },
  { href: "/offers", label: "Offres" },
  { href: "/partner", label: "Devenir partenaire" },
  { href: "/register", label: "S'inscrire" },
  { href: "/#contact", label: "Contact" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50" style={{ backgroundColor: "rgba(6,17,12,0.92)", backdropFilter: "blur(8px)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg" style={{ color: "#F5F1E8" }}>
          Food<span style={{ color: amber }}>Save</span>
        </Link>

        <div className="hidden md:flex items-center gap-7 text-sm" style={{ color: "#8FA396" }}>
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-white">
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/offers"
            className="hidden md:inline px-5 py-2 rounded-full font-bold uppercase tracking-wide text-xs"
            style={{ backgroundColor: amber, color: bg }}
          >
            Voir les offres
          </Link>

          <button
            type="button"
            className="md:hidden flex items-center justify-center w-10 h-10 rounded-full shrink-0"
            style={{ border: "1px solid rgba(255,255,255,0.15)", color: "#F5F1E8", backgroundColor: "transparent" }}
            aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {open && (
        <div
          id="mobile-nav"
          className="md:hidden px-6 pb-6 flex flex-col gap-1 text-sm"
          style={{ color: "#8FA396", borderTop: "1px solid rgba(255,255,255,0.08)" }}
        >
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="py-3 hover:text-white"
              style={{ color: "#8FA396" }}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}

          <Link
            href="/offers"
            onClick={() => setOpen(false)}
            className="mt-2 text-center rounded-full px-5 py-3 font-bold uppercase tracking-wide text-xs"
            style={{ backgroundColor: amber, color: bg }}
          >
            Voir les offres
          </Link>
        </div>
      )}
    </nav>
  );
}
