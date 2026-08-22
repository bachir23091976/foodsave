"use client";

import { useState } from "react";

interface Props {
  url: string | null;
  alt: string;
  variant?: "offer" | "hero";
  merchantType?: string | null;
  className?: string;
}

function TypeIcon({ type, size }: { type: string | null | undefined; size: number }) {
  const s = { width: size, height: size };
  if (type === "BAKERY") {
    return (
      <svg {...s} viewBox="0 0 24 24" fill="none">
        <path d="M4 14c0-5 3-9 8-9s8 4 8 9" stroke="#FFB100" strokeWidth="1.4" opacity="0.85" />
        <path d="M3 14h18l-1.5 6a2 2 0 0 1-2 1.5H6.5A2 2 0 0 1 4.5 20L3 14Z" stroke="#17C989" strokeWidth="1.4" opacity="0.85" />
      </svg>
    );
  }
  if (type === "CAFE") {
    return (
      <svg {...s} viewBox="0 0 24 24" fill="none">
        <path d="M4 9h13v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9Z" stroke="#FFB100" strokeWidth="1.4" opacity="0.85" />
        <path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17" stroke="#17C989" strokeWidth="1.4" opacity="0.85" />
        <path d="M7 5c0 1-1 1-1 2M11 5c0 1-1 1-1 2" stroke="#17C989" strokeWidth="1.2" opacity="0.6" />
      </svg>
    );
  }
  if (type === "GROCERY" || type === "SUPERMARKET") {
    return (
      <svg {...s} viewBox="0 0 24 24" fill="none">
        <path d="M4 8h16l-1.5 11a2 2 0 0 1-2 1.7H7.5a2 2 0 0 1-2-1.7L4 8Z" stroke="#FFB100" strokeWidth="1.4" opacity="0.85" />
        <path d="M8 8V6a4 4 0 0 1 8 0v2" stroke="#17C989" strokeWidth="1.4" opacity="0.85" />
      </svg>
    );
  }
  return (
    <svg {...s} viewBox="0 0 24 24" fill="none">
      <path d="M4 15A8 8 0 0 1 20 15" stroke="#FFB100" strokeWidth="1.4" strokeLinecap="round" opacity="0.85" />
      <path d="M2 15h20" stroke="#17C989" strokeWidth="1.4" strokeLinecap="round" opacity="0.85" />
      <path d="M12 7V5" stroke="#FFB100" strokeWidth="1.4" strokeLinecap="round" opacity="0.85" />
      <circle cx="12" cy="4.3" r="0.9" fill="#17C989" opacity="0.85" />
    </svg>
  );
}

export default function FoodSaveImage({ url, alt, variant = "offer", merchantType = null, className = "" }: Props) {
  const height = variant === "hero" ? "h-72" : "h-40";
  const iconSize = variant === "hero" ? 64 : 36;
  const [imageFailed, setImageFailed] = useState(false);

  if (url && !imageFailed) {
    return (
      <div className={"fs-img-wrap w-full overflow-hidden " + height + " " + className}>
        <img
          src={url}
          alt={alt}
          className="fs-img w-full h-full object-cover"
          onError={() => setImageFailed(true)}
        />
      </div>
    );
  }

  return (
    <div className={"fs-placeholder relative w-full overflow-hidden flex items-center justify-center " + height + " " + className}>
      <div className="fs-blob fs-blob-a" />
      <div className="fs-blob fs-blob-b" />
      <div className="fs-blob fs-blob-c" />
      <div className="fs-icon relative">
        <TypeIcon type={merchantType} size={iconSize} />
      </div>

      <style>{"\n        .fs-placeholder { background: linear-gradient(135deg, #06110C, #16261C); }\n        .fs-blob { position: absolute; border-radius: 9999px; filter: blur(30px); opacity: 0.35; }\n        .fs-blob-a { width: 120px; height: 120px; background: #17C989; top: -30px; left: -20px; animation: fsFloatA 14s ease-in-out infinite; }\n        .fs-blob-b { width: 100px; height: 100px; background: #FFB100; bottom: -20px; right: -10px; animation: fsFloatB 16s ease-in-out infinite; }\n        .fs-blob-c { width: 70px; height: 70px; background: #1F3D2B; top: 30%; right: 30%; animation: fsFloatC 18s ease-in-out infinite; }\n        @keyframes fsFloatA { 0%,100% { transform: translate(0,0); } 50% { transform: translate(15px,10px); } }\n        @keyframes fsFloatB { 0%,100% { transform: translate(0,0); } 50% { transform: translate(-12px,-10px); } }\n        @keyframes fsFloatC { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(8px,-8px) scale(1.08); } }\n        .fs-icon { transition: transform 0.3s ease; }\n        .fs-placeholder:hover .fs-icon { transform: scale(1.08); }\n        .fs-img-wrap { position: relative; }\n        .fs-img { transition: transform 0.4s ease, opacity 0.3s ease; }\n        .fs-img-wrap:hover .fs-img { transform: scale(1.06); }\n        @media (prefers-reduced-motion: reduce) {\n          .fs-blob { animation: none !important; }\n          .fs-icon, .fs-img { transition: none !important; }\n        }\n      "}</style>
    </div>
  );
}
