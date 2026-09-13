"use client";

import { useEffect, useRef } from "react";
import s from "./public.module.css";

export default function ScrollReveal({
  children,
  index = 0,
  className = "",
}: {
  children: React.ReactNode;
  index?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!element || motion.matches || !("IntersectionObserver" in window)) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          element.classList.add(s.revealEntered);
          obs.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        animationDelay: (index % 3) * 0.05 + "s",
      }}
    >
      {children}
    </div>
  );
}
