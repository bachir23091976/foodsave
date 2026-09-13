"use client";
import { useLocale } from "../lib/i18n/LocaleProvider";


import { useEffect, useState } from "react";
import s from "../components/public.module.css";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import ScrollReveal from "../components/ScrollReveal";
import { API_URL } from "../lib/api";




const bg = "#faf8f2";
const amber = "#d8ee97";
const jade = "#215d43";
const dim = "#59685e";

export default function ReferralPage() {
  const { t, text: tr, count } = useLocale();
  const [referralCode, setReferralCode] = useState("");
  const [referralCount, setReferralCount] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    fetch(`${API_URL}/users/referral`, {
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
    <main className={s.page + " " + s.accountPage} style={{ backgroundColor: bg, color: "#183e32", minHeight: "100vh" }}>
      <Navbar />

      <section className="px-6 pt-16 pb-6 text-center">
        <p className="text-xs tracking-[0.4em] uppercase mb-3" style={{ color: jade }}>
          {t("ui.referrals")}</p>
        <h1 className={s.heading} style={{ fontSize: "clamp(2.4rem, 6vw, 4.5rem)", lineHeight: 1 }}>
          {t("ui.invite_a_friend")}<br />
          <span style={{ color: "#215d43" }}>{t("ui.share_your_code")}</span>
        </h1>
        <p className="mt-4 max-w-md mx-auto" style={{ color: dim }}>
          {t("ui.share_your_referral_code_with_a_friend_when_they")}</p>
      </section>

      <ScrollReveal index={0} className="max-w-sm mx-auto px-6">
        <div
          className="rounded-2xl p-8 text-center"
          style={{ backgroundColor: "#ffffff", border: "1px solid rgba(23,201,137,0.3)" }}
        >
          <p className="text-sm mb-2" style={{ color: dim }}>{t("ui.your_referral_code")}</p>
          <p className={s.heading} style={{ fontSize: "2.4rem", color: jade, letterSpacing: "0.05em" }}>
            {referralCode || "..."}
          </p>
          <button
            onClick={handleCopy}
            className="mt-5 rounded-full px-8 py-3 font-bold uppercase tracking-wide text-sm"
            style={{ backgroundColor: amber, color: "#183e32" }}
          >
            {copied ? t("ui.copied") : t("ui.copy_code")}
          </button>
        </div>
      </ScrollReveal>

      <ScrollReveal index={1} className="text-center mt-8 px-6">
        <p style={{ color: dim }}>
          {count("referrals.count", "referrals.countPlural", referralCount)}
        </p>
      </ScrollReveal>

      <section className="px-6 py-20 max-w-3xl mx-auto">
        <div className="grid md:grid-cols-2 gap-8">
          {[
            ["1", t("ui.share_your_code_2"), t("ui.send_your_personal_code_to_a_friend_by_message")],
            ["2", t("ui.track_your_referrals"), t("ui.find_the_number_of_referrals_associated_with_your_code")],
          ].map(([n, title, text], i) => (
            <ScrollReveal key={n} index={i}>
              <div className="text-center">
                <div
                  className="mx-auto mb-4 w-14 h-14 rounded-full flex items-center justify-center font-bold"
                  style={{ backgroundColor: "#faf8f2", border: "1px solid rgba(23,201,137,0.4)", color: jade }}
                >
                  {n}
                </div>
                <p className="font-bold text-lg mb-1">{tr(title)}</p>
                <p style={{ color: dim }}>{tr(text)}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      <Footer />
    </main>
  );
}
