"use client";
import { useLocale } from "./lib/i18n/LocaleProvider";


import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import FoodSaveImage from "./components/FoodSaveImage";
import PublicArt from "./components/PublicArt";
import s from "./components/public.module.css";
import { API_URL } from "./lib/api";

interface Offer {
  id: string; title: string; imageUrl: string | null; originalPrice: number; discountedPrice: number;
  merchant: { name: string; city: string; type?: string };
}

export default function Home() {
  const { t, text: tr, money, number } = useLocale();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    fetch(API_URL + "/offers")
      .then((res) => { if (!res.ok) throw new Error("Offers unavailable"); return res.json(); })
      .then((data) => setOffers((data.offers || []).slice(0, 3)))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  return <main className={s.page}>
    <Navbar />
    <section className={s.container + " " + s.hero}>
      <div>
        <p className={s.eyebrow}>{t("ui.less_waste_more_flavour_ottawa")}</p>
        <h1 className={s.title}>{t("ui.save_good_food_2")}<br /><em>{t("ui.pay_less")}</em></h1>
        <p className={s.lede}>{t("ui.discover_surplus_food_from_businesses_near_you_at_reduced")}</p>
        <div className={s.actions}><Link href="/offers" className={s.button}>{t("ui.view_offers_near_me")}<span aria-hidden="true">↗</span></Link></div>
        <p className={s.note}>{t("ui.local_businesses_instore_pickup_a_small_step_that_matters")}</p>
      </div>
      <div className={s.art}><PublicArt /><p className={s.artCaption}>{t("ui.good_food_is_too_good_to_waste")}</p></div>
    </section>

    <section id="comment-ca-marche" className={s.band} style={{ scrollMarginTop: 90 }}>
      <div className={s.container + " " + s.section}>
        <div className={s.sectionHead}><div><p className={s.eyebrow}>{t("ui.simple_from_browsing_to_pickup")}</p><h2 className={s.heading}>{t("ui.how_it_works")}</h2></div><p className={s.muted}>{t("ui.three_steps_one_good_habit")}</p></div>
        <div className={s.grid3}>
          {[
            ["01", t("ui.discover"), t("ui.explore_offers_and_check_whats_included_the_price_and")],
            ["02", t("ui.reserve_2"), t("ui.choose_an_offer_sign_in_and_pay_online_to")],
            ["03", t("ui.pick_up"), t("ui.once_confirmed_show_your_qr_or_code_at_the")],
          ].map(([n,title,description]) => <article className={s.step} key={n}><span className={s.number}>{n}</span><h3>{tr(title)}</h3><p>{tr(description)}</p></article>)}
        </div>
      </div>
    </section>

    <section className={s.container + " " + s.promise}>
      <div><p className={s.eyebrow}>{t("ui.the_foodsave_difference")}</p><h2 className={s.heading}>{t("ui.no_unwelcome_surprises_2")}</h2><p className={s.lede}>{t("ui.your_next_meal_deserves_more_than_a_question_mark")}</p></div>
      <ul className={s.checklist}><li>{t("ui.check_the_offer_details_before_paying")}</li><li>{t("ui.compare_the_original_and_reduced_prices")}</li><li>{t("ui.check_the_business_and_your_pickup_window")}</li></ul>
    </section>

    <section className={s.container + " " + s.section}>
      <div className={s.sectionHead}><div><p className={s.eyebrow}>{t("ui.neighbourhood_discoveries")}</p><h2 className={s.heading}>{t("ui.tonight_close_to_home")}</h2></div><Link href="/offers" className={s.quiet}>{t("ui.all_offers_")}</Link></div>
      {loading && <p role="status" className={s.empty}>{t("ui.finding_available_offers_2")}</p>}
      {error && <p role="alert" className={s.alert}>{t("ui.offers_are_temporarily_unavailable_check_the_offers_page")}</p>}
      {!loading && !error && offers.length === 0 && <div className={s.empty}><h3>{t("ui.theres_always_something_new_to_discover")}</h3><p>{t("ui.no_offers_right_now_new_offers_may_appear_throughout")}</p></div>}
      <div className={s.offerGrid}>{offers.map((offer) => <article key={offer.id} className={s.card}>
        <FoodSaveImage url={offer.imageUrl} alt={offer.title} variant="offer" merchantType={offer.merchant.type} />
        <div className={s.cardBody}><h3>{offer.title}</h3><p className={s.merchant}>{offer.merchant.name} · {offer.merchant.city}</p><p className={s.price}><strong>{money(offer.discountedPrice)}</strong><del>{money(offer.originalPrice)}</del></p><Link href="/offers" className={s.secondary}>{t("ui.explore_offers_")}</Link></div>
      </article>)}</div>
    </section>

    <section className={s.container + " " + s.section} aria-label={t("ui.the_benefits_of_foodsave")}>
      <div className={s.grid3}>{[
        [t("ui.save_money"), t("ui.good_products_at_reduced_prices_to_help_your_budget")],
        [t("ui.support_local_businesses"), t("ui.discover_the_businesses_that_bring_your_neighbourhood_to_life")],
        [t("ui.reduce_food_waste"), t("ui.give_surplus_food_a_new_home_your_plate")],
      ].map(([title,description]) => <article key={title} className={s.benefit}><h3>{tr(title)}</h3><p>{tr(description)}</p></article>)}</div>
    </section>
    <section className={s.container + " " + s.section}><div className={s.merchantCta}><div><h2 className={s.heading}>{t("ui.your_surplus_can_still")}<br />{t("ui.have_value")}</h2><p>{t("ui.introduce_your_business_to_new_customers_in_ottawa")}</p></div><Link href="/partner" className={s.button}>{t("ui.become_a_partner_")}</Link></div></section>
    <div className={s.container + " " + s.trust}><span>{t("ui._ottawa_canada")}</span><span>{t("ui._prices_and_pickup_windows_shown_before_reservation")}</span><span>✉ <a href="mailto:info@foodsave.ca">info@foodsave.ca</a></span></div>
    <Footer />
  </main>;
}
