"use client";

import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { useRef, useState } from "react";

gsap.registerPlugin(useGSAP);

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function HomeGate() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;

      const shutter = root.querySelector<HTMLElement>("[data-shutter]");
      const outs = root.querySelectorAll<HTMLElement>("[data-out]");
      const stamp = root.querySelector<HTMLElement>("[data-stamp]");
      const button = root.querySelector<HTMLElement>("[data-confirm-btn]");

      if (prefersReducedMotion()) {
        if (shutter) shutter.style.display = open ? "none" : "";
        gsap.set(outs, { opacity: open ? 1 : 0.4, y: 0 });
        return;
      }

      if (!open) {
        gsap.set(outs, { opacity: 0.35, y: 6 });
        if (shutter)
          gsap.set(shutter, { clipPath: "inset(0 0 0 0)", opacity: 1 });
        if (stamp) gsap.set(stamp, { opacity: 1, y: 0 });
        return;
      }

      const tl = gsap.timeline();
      if (button) {
        tl.fromTo(
          button,
          { scale: 0.97 },
          { scale: 1, duration: 0.16, ease: "power3.out" },
        );
      }
      if (shutter) {
        tl.to(
          shutter,
          {
            clipPath: "inset(0 0 100% 0)",
            duration: 0.45,
            ease: "power3.out",
          },
          0,
        );
      }
      tl.to(
        outs,
        {
          opacity: 1,
          y: 0,
          duration: 0.28,
          stagger: 0.08,
          ease: "power3.out",
        },
        0.12,
      );
      if (stamp) {
        tl.fromTo(
          stamp,
          { opacity: 0.35, y: 6 },
          { opacity: 1, y: 0, duration: 0.28, ease: "power3.out" },
          0.12,
        );
      }
    },
    { scope: rootRef, dependencies: [open], revertOnUpdate: true },
  );

  const onConfirm = () => {
    if (busy || open) return;
    setBusy(true);
    setOpen(true);
    window.setTimeout(() => {
      setOpen(false);
      setBusy(false);
    }, 3200);
  };

  return (
    <div ref={rootRef} className="home-gate">
      <div className="home-gate-board">
        <div className="home-gate-draft">
          <p className="home-stage-label">Draft waiting</p>
          <p className="home-report-title">Checkout 500 on Apple Pay</p>
          <p className="home-report-meta">
            {open ? "Opened for review" : "Ready · not written yet"}
          </p>
          <div className="home-gate-outs">
            <p className="home-signal" data-out>
              Jira ticket
            </p>
            <p className="home-signal" data-out>
              GitHub PR
            </p>
          </div>
          <div
            className="home-gate-shutter"
            data-shutter
            aria-hidden={open ? "true" : "false"}
          >
            <p>Locked until you confirm</p>
          </div>
        </div>

        <div className="home-gate-action">
          <button
            type="button"
            className={
              open || busy
                ? "home-btn home-btn--primary home-gate-btn"
                : "home-btn home-btn--primary home-gate-btn home-gate-btn--invite"
            }
            data-confirm-btn
            data-invite={open || busy ? "false" : "true"}
            disabled={busy || open}
            onClick={onConfirm}
          >
            <span className="home-gate-btn-label">
              {open
                ? "Write unlocked"
                : busy
                  ? "Unlocking…"
                  : "Click to unlock this write"}
            </span>
            {open || busy ? null : (
              <span className="home-gate-btn-hint" aria-hidden="true">
                Try it
              </span>
            )}
          </button>
        </div>

        <p
          className="home-gate-stamp"
          data-stamp
          data-open={open ? "true" : "false"}
        >
          {open
            ? "Opened for review. Nothing deployed or merged."
            : "This demo waits for you. Unlock the draft to see the ticket and PR."}
        </p>
      </div>
    </div>
  );
}
