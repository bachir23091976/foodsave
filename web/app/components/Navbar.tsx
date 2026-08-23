"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const bg = "#06110C";
const amber = "#FFB100";
const jade = "#17C989";

const NAV_LINKS = [
  { href: "/", label: "Accueil" },
  { href: "/offers", label: "Offres" },
  { href: "/partner", label: "Devenir partenaire" },
];

const CONTACT_LINK = { href: "/#contact", label: "Contact" };

// Decodes only the payload segment of a JWT, client-side, to read the
// role claim for a UI decision (which nav links to show). This is NOT a
// signature check and must never be treated as one -- it never touches
// JWT_SECRET (which only exists on the backend) and proves nothing about
// authenticity. The actual authorization check still happens server-side
// on every request via the authenticate middleware. If the token is
// absent, malformed, not a 3-part JWT, or its payload isn't valid
// base64url/JSON, this returns null instead of throwing.
function decodeJwtPayload(token: string): { role?: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = window.atob(padded);
    const json = decodeURIComponent(
      Array.prototype.map
        .call(binary, (c: string) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );

    const payload = JSON.parse(json);
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isMerchant, setIsMerchant] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // Re-read the token on every route change so the Navbar picks up a login
  // that just happened (router.push from /login to /offers) or a logout
  // redirect, without needing a full page reload.
  useEffect(() => {
    const token = localStorage.getItem("token");
    setIsLoggedIn(!!token);
   const role = token ? decodeJwtPayload(token)?.role : null;
setIsMerchant(!!token && (role === "MERCHANT" || role === "ADMIN"));
  }, [pathname]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    setOpen(false);
    router.push("/login");
  };

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
          {!isLoggedIn && (
            <>
              <Link href="/login" className="hover:text-white">
                Se connecter
              </Link>
              <Link href="/register" className="hover:text-white">
                S&apos;inscrire
              </Link>
            </>
          )}
          {isMerchant && (
            <Link href="/merchant/profile" className="hover:text-white">
              Espace commerçant
            </Link>
          )}
          {isLoggedIn && (
            <button
              type="button"
              onClick={handleLogout}
              className="hover:text-white"
              style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "#8FA396", cursor: "pointer" }}
            >
              Se déconnecter
            </button>
          )}
          <Link href={CONTACT_LINK.href} className="hover:text-white">
            {CONTACT_LINK.label}
          </Link>
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
          {!isLoggedIn && (
            <>
              <Link
                href="/login"
                className="py-3 hover:text-white"
                style={{ color: "#8FA396" }}
                onClick={() => setOpen(false)}
              >
                Se connecter
              </Link>
              <Link
                href="/register"
                className="py-3 hover:text-white"
                style={{ color: "#8FA396" }}
                onClick={() => setOpen(false)}
              >
                S&apos;inscrire
              </Link>
            </>
          )}
          {isMerchant && (
            <Link
              href="/merchant/profile"
              className="py-3 hover:text-white"
              style={{ color: "#8FA396" }}
              onClick={() => setOpen(false)}
            >
              Espace commerçant
            </Link>
          )}
          {isLoggedIn && (
            <button
              type="button"
              onClick={handleLogout}
              className="py-3 px-0 w-full text-left hover:text-white"
              style={{ background: "none", border: "none", font: "inherit", color: "#8FA396", cursor: "pointer" }}
            >
              Se déconnecter
            </button>
          )}
          <Link
            href={CONTACT_LINK.href}
            className="py-3 hover:text-white"
            style={{ color: "#8FA396" }}
            onClick={() => setOpen(false)}
          >
            {CONTACT_LINK.label}
          </Link>

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
