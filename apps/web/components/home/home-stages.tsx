"use client";

import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { useRef } from "react";

gsap.registerPlugin(useGSAP);

const STEPS = [
  {
    title: "Triage the noise",
    body: "Sentry errors, Slack threads, Discord alerts, and Freshdesk conversations become one report with the evidence attached.",
    figure: "triage",
  },
  {
    title: "Plan the smallest fix",
    body: "An AI engineer finds the root cause in your repo and writes the smallest correct change, with every claim linked to a signal.",
    figure: "patch",
  },
  {
    title: "Validate, then hand it to you",
    body: "Tests, lint, and type-check gate the patch. You preview the Jira ticket and GitHub pull request, then confirm.",
    figure: "validate",
  },
] as const;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function HomeStages() {
  const rootRef = useRef<HTMLOListElement>(null);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root || prefersReducedMotion()) return;

      const dots = root.querySelectorAll<HTMLElement>("[data-merge]");
      gsap.to(dots, {
        x: (index) => (index < 2 ? 28 : -28),
        opacity: 0.35,
        duration: 1.6,
        ease: "power3.inOut",
        yoyo: true,
        repeat: -1,
        stagger: 0.08,
      });

      const scan = root.querySelector<HTMLElement>("[data-scan]");
      if (scan) {
        gsap.fromTo(
          scan,
          { y: 0 },
          { y: 52, duration: 2.2, ease: "none", repeat: -1, yoyo: true },
        );
      }

      const gates = root.querySelectorAll<HTMLElement>("[data-gate]");
      const pr = root.querySelector<HTMLElement>("[data-pr]");
      const gateTl = gsap.timeline({ repeat: -1 });
      gateTl.set(gates, { opacity: 0.3 });
      if (pr) gateTl.set(pr, { opacity: 0.25, scale: 0.96 });
      gateTl.to(gates, {
        opacity: 1,
        duration: 0.22,
        stagger: 0.18,
        ease: "power3.out",
      });
      if (pr) {
        gateTl.to(pr, {
          opacity: 1,
          scale: 1,
          duration: 0.28,
          ease: "power3.out",
        });
      }
      gateTl.to({}, { duration: 0.9 });
      gateTl.to([gates, pr], {
        opacity: 0.3,
        duration: 0.3,
        ease: "power3.out",
      });
    },
    { scope: rootRef },
  );

  return (
    <ol ref={rootRef} className="home-stages">
      {STEPS.map((step, index) => (
        <li
          key={step.title}
          className={
            index % 2 === 1
              ? "home-stage-row home-stage-row--flip"
              : "home-stage-row"
          }
        >
          <div className="home-stage-copy">
            <span className="home-step-index">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3>{step.title}</h3>
            <p className="home-step-body">{step.body}</p>
          </div>
          <div className="home-figure" aria-hidden="true">
            {step.figure === "triage" ? <TriageFigure /> : null}
            {step.figure === "patch" ? <PatchFigure /> : null}
            {step.figure === "validate" ? <ValidateFigure /> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function TriageFigure() {
  return (
    <div className="fig fig-triage">
      <span className="fig-dot" data-merge />
      <span className="fig-dot" data-merge />
      <span className="fig-core">Report</span>
      <span className="fig-dot" data-merge />
      <span className="fig-dot" data-merge />
    </div>
  );
}

function PatchFigure() {
  return (
    <div className="fig fig-patch">
      <span className="fig-line" />
      <span className="fig-line fig-line--add" />
      <span className="fig-line fig-line--add" />
      <span className="fig-line" />
      <span className="fig-scan" data-scan />
    </div>
  );
}

function ValidateFigure() {
  return (
    <div className="fig fig-validate">
      <span className="fig-gate" data-gate>
        Tests
      </span>
      <span className="fig-gate" data-gate>
        Lint
      </span>
      <span className="fig-gate" data-gate>
        Types
      </span>
      <span className="fig-pr" data-pr>
        Pull request
      </span>
    </div>
  );
}
