"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import s from "./public.module.css";

const NAV_LINKS = [
  { href: "/", label: "Accueil" },
  { href: "/offers", label: "Offres" },
  { href: "/#comment-ca-marche", label: "Comment ça marche" },
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
    <nav className={s.nav} aria-label="Navigation principale" onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
      <div className={s.navInner}>
        <Link href="/" className={s.logo} aria-label="FoodSave — Accueil"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect width="32" height="32" rx="10" fill="#215d43" /><path d="M15 25C5 23 6 12 10 10c6 0 9 5 8 10 1-8 7-10 10-9 0 9-6 14-13 14Z" fill="#d8ee97" /></svg>FoodSave</Link>
        <div className={s.navLinks}>{NAV_LINKS.map(link => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined}>{link.label}</Link>)}</div>
        <div className={s.navActions}>
          {!isLoggedIn && <Link href="/login">Se connecter</Link>}
          {isLoggedIn && <Link href={isMerchant ? "/merchant/profile" : "/reservations"}>{isMerchant ? "Mon commerce" : "Mes réservations"}</Link>}
          {isLoggedIn && <button type="button" onClick={handleLogout}>Se déconnecter</button>}
          <Link href="/offers" className={s.button}>Voir les offres</Link>
        </div>
        <button type="button" className={s.menuButton} aria-label={open ? "Fermer le menu" : "Ouvrir le menu"} aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen(v => !v)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={open ? "M6 6l12 12M18 6L6 18" : "M4 7h16M4 12h16M4 17h16"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
      </div>
      {open && <div id="mobile-nav" className={s.mobileMenu}>
        {NAV_LINKS.map(link => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined} onClick={() => setOpen(false)}>{link.label}</Link>)}
        {!isLoggedIn && <><Link href="/login" onClick={() => setOpen(false)}>Se connecter</Link><Link href="/register" onClick={() => setOpen(false)}>Créer un compte</Link></>}
        {isLoggedIn && <><Link href={isMerchant ? "/merchant/profile" : "/reservations"} onClick={() => setOpen(false)}>{isMerchant ? "Espace commerçant" : "Mes réservations"}</Link><button type="button" onClick={handleLogout}>Se déconnecter</button></>}
        <Link href={CONTACT_LINK.href} onClick={() => setOpen(false)}>{CONTACT_LINK.label}</Link>
        <Link href="/offers" className={s.button} onClick={() => setOpen(false)}>Voir les offres</Link>
      </div>}
    </nav>
  );
}
