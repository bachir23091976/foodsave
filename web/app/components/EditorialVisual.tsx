"use client";

import Image from "next/image";
import { useLocale } from "../lib/i18n/LocaleProvider";
import s from "./public.module.css";

const photos = {
  home: { file: "home-hero", width: 1600, height: 900, alt: "photo.home" },
  boxes: { file: "surplus-boxes", width: 1280, height: 853, alt: "photo.boxes" },
  pickup: { file: "customer-pickup", width: 1280, height: 853, alt: "photo.pickup" },
  merchant: { file: "merchant-onboarding", width: 1280, height: 853, alt: "photo.merchant" },
} as const;

/** Approved illustrative photography, never a partner endorsement or live inventory. */
export default function EditorialVisual({ merchant = false, compact = false, scene, principal = false }: {
  merchant?: boolean; compact?: boolean; scene?: keyof typeof photos; principal?: boolean;
}) {
  const { t } = useLocale();
  const selected = scene || (merchant ? "merchant" : compact ? "boxes" : "home");
  const photo = photos[selected];
  const isHero = principal && selected === "home";
  return <figure className={`${s.photoVisual} ${compact ? s.photoCompact : ""}`}>
    <Image src={`/images/foodsave/foodsave-${photo.file}.webp`} alt={t(photo.alt)}
      width={photo.width} height={photo.height}
      sizes={compact ? "(max-width: 760px) 1px, 400px" : "(max-width: 760px) calc(100vw - 32px), (max-width: 1200px) 46vw, 550px"}
      preload={isHero} loading={isHero ? undefined : "lazy"}
      className={s.photoImage} />
    <figcaption>{t(selected === "merchant" ? "photo.interfaceNote" : "photo.sceneNote")}</figcaption>
  </figure>;
}
