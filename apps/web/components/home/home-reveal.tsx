"use client";

import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { type ReactNode, useRef } from "react";

gsap.registerPlugin(useGSAP);

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function HomeReveal({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root || prefersReducedMotion()) return;

      const targets = root.querySelectorAll<HTMLElement>(
        "h1, .home-lede, .home-hero-cta, .home-pipeline",
      );
      gsap.fromTo(
        targets,
        { opacity: 0, y: 8 },
        {
          opacity: 1,
          y: 0,
          duration: 0.45,
          stagger: 0.05,
          ease: "power3.out",
          clearProps: "transform",
        },
      );
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef} className="home-hero home-container">
      {children}
    </div>
  );
}
