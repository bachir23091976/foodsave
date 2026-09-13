"use client";
import { useLocale } from "../lib/i18n/LocaleProvider";


import LanguageSelector from "../lib/i18n/LanguageSelector";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import s from "./public.module.css";

const NAV_LINKS = [
  { href: "/", label: "ui.home" },
  { href: "/offers", label: "ui.offers" },
  { href: "/#comment-ca-marche", label: "ui.how_it_works" },
  { href: "/partner", label: "ui.become_a_partner" },
];

const CONTACT_LINK = { href: "/#contact", label: "ui.contact" };

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
  const { t, text: tr } = useLocale();
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
    <nav className={s.nav} aria-label={t("ui.main_navigation")} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
      <div className={s.navInner}>
        <Link href="/" className={s.logo + " " + s.logoCompact} aria-label={t("ui.foodsave_home")}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path d="M5 18C2 9 9 4 20 3c1 11-4 18-13 16M4 21 15 10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg><span className={s.logoName}><span>Food</span><span className={s.logoSave}>Save</span></span></Link>
        <div className={s.navLinks}>{NAV_LINKS.map(link => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined}>{tr(link.label)}</Link>)}</div>
        <div className={s.navActions}>
          {!isLoggedIn && <Link href="/login">{t("ui.sign_in")}</Link>}
          {isLoggedIn && <Link href={isMerchant ? "/merchant/profile" : "/reservations"}>{isMerchant ? t("ui.my_business") : t("ui.my_reservations")}</Link>}
          {isLoggedIn && <button type="button" onClick={handleLogout}>{t("ui.sign_out")}</button>}
          <Link href="/offers" className={s.button}>{t("ui.view_offers")}</Link>
        </div>
        <LanguageSelector />
        <button type="button" className={s.menuButton} aria-label={open ? t("ui.close_menu") : t("ui.open_menu")} aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen(v => !v)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={open ? "M6 6l12 12M18 6L6 18" : "M4 7h16M4 12h16M4 17h16"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
      </div>
      {open && <div id="mobile-nav" className={s.mobileMenu}>
        {NAV_LINKS.map(link => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined} onClick={() => setOpen(false)}>{tr(link.label)}</Link>)}
        {!isLoggedIn && <><Link href="/login" onClick={() => setOpen(false)}>{t("ui.sign_in")}</Link><Link href="/register" onClick={() => setOpen(false)}>{t("ui.create_an_account")}</Link></>}
        {isLoggedIn && <><Link href={isMerchant ? "/merchant/profile" : "/reservations"} onClick={() => setOpen(false)}>{isMerchant ? t("ui.merchant_workspace") : t("ui.my_reservations")}</Link><button type="button" onClick={handleLogout}>{t("ui.sign_out")}</button></>}
        <Link href={CONTACT_LINK.href} onClick={() => setOpen(false)}>{tr(CONTACT_LINK.label)}</Link>
        <Link href="/offers" className={s.button} onClick={() => setOpen(false)}>{t("ui.view_offers")}</Link>
      </div>}
    </nav>
  );
}
