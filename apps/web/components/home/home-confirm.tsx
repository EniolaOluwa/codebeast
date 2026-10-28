"use client";

import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { useRef } from "react";

gsap.registerPlugin(useGSAP);

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function HomeConfirm() {
  const rootRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root || prefersReducedMotion()) return;

      const slips = root.querySelectorAll<HTMLElement>("[data-slip]");
      const confirm = root.querySelector<HTMLElement>("[data-confirm]");
      const tl = gsap.timeline({ repeat: -1 });
      tl.set(slips, { opacity: 0.28 });
      if (confirm) tl.set(confirm, { opacity: 0.4, scale: 1 });
      tl.to(slips, {
        opacity: 1,
        duration: 0.28,
        stagger: 0.35,
        ease: "power3.out",
      });
      if (confirm) {
        tl.to(confirm, {
          opacity: 1,
          scale: 0.97,
          duration: 0.16,
          ease: "power3.out",
        });
        tl.to(confirm, { scale: 1, duration: 0.2, ease: "power3.out" });
      }
      tl.to({}, { duration: 1 });
      tl.to([slips, confirm], {
        opacity: 0.3,
        duration: 0.35,
        ease: "power3.out",
      });
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef} className="home-confirm" aria-hidden="true">
      <div className="home-confirm-evidence">
        <p className="home-stage-label">Evidence</p>
        <p className="home-report-title">Checkout 500 on Apple Pay</p>
        <p className="home-report-meta">3 signals · needs review</p>
      </div>
      <div className="home-confirm-outs">
        <p className="home-signal" data-slip>
          Ticket preview
        </p>
        <p className="home-signal" data-slip>
          Pull request preview
        </p>
        <p className="home-confirm-action" data-confirm>
          Confirm
        </p>
      </div>
    </div>
  );
}
