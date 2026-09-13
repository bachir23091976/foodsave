"use client";
import { useLocale } from "../lib/i18n/LocaleProvider";
import Link from "next/link";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import s from "../components/public.module.css";

export default function PartnerPage() {
  const { t, text: tr, number } = useLocale();
  return <main className={s.page}>
    <Navbar />
    <div className={s.partnerHero}><section className={s.container + " " + s.hero}>
      <div><p className={s.eyebrow}>{t("ui.for_ottawa_businesses")}</p><h1 className={s.title}>{t("ui.your_surplus")}<br /><em>{t("ui.new_possibilities")}</em></h1><p className={s.lede}>{t("ui.turn_surplus_into_revenue_and_introduce_your_business_to")}</p><div className={s.actions}><Link href="/register-merchant" className={s.button}>{t("ui.register_my_business_")}</Link><a href="#parcours-commercant" className={s.quiet}>{t("ui.how_it_works")}</a></div></div>
      <aside className={s.partnerBoard}><p className={s.eyebrow}>{t("ui.a_tool_for_your_everyday_work")}</p><h2>{t("ui.from_surplus_on_display")}<br />{t("ui.to_pickup_in_store")}</h2><ol><li>{t("ui.introduce_your_business")}</li><li>{t("ui.publish_your_available_offers")}</li><li>{t("ui.welcome_customers")}</li></ol><p style={{ marginTop: 22, color: "#d2dfcc", fontSize: 13 }}>{t("ui.restaurants_bakeries_cafes_grocery_stores")}</p></aside>
    </section></div>
    <section className={s.container + " " + s.section}><div className={s.sectionHead}><h2 className={s.heading}>{t("ui.good_for_your_business")}<br />{t("ui.good_for_your_neighbourhood")}</h2></div><div className={s.grid3}>{[
      [t("ui.attract_new_customers"), t("ui.make_your_offers_visible_to_people_exploring_local_businesses")],
      [t("ui.reduce_food_waste"), t("ui.offer_your_remaining_products_at_reduced_prices_instead_of")],
      [t("ui.publish_with_ease"), t("ui.describe_the_contents_price_quantity_and_pickup_window_of")],
    ].map(([title,description]) => <article key={title} className={s.benefit}><h3>{tr(title)}</h3><p>{tr(description)}</p></article>)}</div></section>
    <section id="parcours-commercant" className={s.band} style={{ scrollMarginTop: 90 }}><div className={s.container + " " + s.section}><p className={s.eyebrow}>{t("ui.your_partner_journey")}</p><h2 className={s.heading}>{t("ui.stay_in_control_of_your_offers")}</h2><div className={s.grid3}>{[
      ["01", t("ui.prepare_your_account"), t("ui.create_your_merchant_account_complete_your_profile_and_set")],
      ["02", t("ui.publish_your_surplus"), t("ui.add_an_offer_customers_review_the_details_then_reserve")],
      ["03", t("ui.validate_pickup_2"), t("ui.when_the_customer_arrives_scan_their_qr_or_enter")],
    ].map(([n,title,description]) => <article key={n} className={s.step}><span className={s.number}>{n}</span><h3>{tr(title)}</h3><p>{tr(description)}</p></article>)}</div></div></section>
    <section className={s.container + " " + s.promise}><div><p className={s.eyebrow}>{t("ui.payments_made_simple")}</p><h2 className={s.heading}>{t("ui.secure_payments_with_stripe")}</h2></div><div><p className={s.muted}>{t("ui.stripe_is_our_payment_partner_it_secures_customer_payments")}</p><p className={s.muted} style={{ marginTop: 16 }}>{t("ui.account_setup_and_verification_must_be_complete_payouts_remain")}</p><Link href="/merchant/profile" className={s.quiet}>{t("ui.set_up_my_payments_")}</Link></div></section>
    <section className={s.container + " " + s.section}><div className={s.faq}><h2 className={s.heading}>{t("ui.before_you_get_started")}</h2><details><summary>{t("ui.what_information_should_i_prepare")}</summary><p>{t("ui.your_business_name_contact_details_and_description_followed_by")}</p></details><details><summary>{t("ui.how_does_the_customer_pick_up_their_reservation")}</summary><p>{t("ui.they_visit_your_business_during_the_pickup_window_with")}</p></details><details><summary>{t("ui.have_a_question_about_foodsave")}</summary><p>{t("ui.email_us_at")}{" "}<a href="mailto:info@foodsave.ca">info@foodsave.ca</a>.</p></details></div></section>
    <section className={s.container + " " + s.section}><div className={s.merchantCta}><div><h2 className={s.heading}>{t("ui.ready_to_give_your_surplus")}<br />{t("ui.a_second_chance")}</h2><p>{t("ui.your_next_step_create_your_merchant_account")}</p></div><Link href="/register-merchant" className={s.button}>{t("ui.become_a_partner_")}</Link></div></section>
    <Footer />
  </main>;
}
