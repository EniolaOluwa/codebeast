"use client";

import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { useRef } from "react";

gsap.registerPlugin(useGSAP);

const SOURCES = [
  { name: "Sentry", kind: "Error" },
  { name: "Slack", kind: "Message" },
  { name: "Discord", kind: "Message" },
  { name: "Freshdesk", kind: "Conversation" },
] as const;

const DESTINATIONS = [
  { name: "Jira ticket", kind: "Ticket" },
  { name: "GitHub PR", kind: "Pull request" },
] as const;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function HomePipeline() {
  const rootRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root || prefersReducedMotion()) return;

      const lamps = root.querySelectorAll<HTMLElement>("[data-lamp]");
      const beams = root.querySelectorAll<HTMLElement>("[data-beam]");
      const packets = root.querySelectorAll<HTMLElement>("[data-packet]");
      const report = root.querySelector<HTMLElement>("[data-node='report']");
      const chips = root.querySelectorAll<HTMLElement>("[data-chip]");
      const outs = root.querySelectorAll<HTMLElement>("[data-out]");
      const lock = root.querySelector<HTMLElement>("[data-lock]");
      const status = root.querySelector<HTMLElement>("[data-status]");

      const play = (vertical: boolean) => {
        const tl = gsap.timeline({
          repeat: -1,
          defaults: { ease: "none" },
        });

        tl.set(lamps, { opacity: 0.28 });
        tl.set(
          beams,
          vertical ? { scaleY: 0, scaleX: 1 } : { scaleX: 0, scaleY: 1 },
        );
        tl.set(packets, { opacity: 0, x: 0, y: 0 });
        tl.set(chips, { opacity: 0.2, y: 4 });
        tl.set(outs, { opacity: 0.35 });
        if (lock) tl.set(lock, { opacity: 1 });
        if (status) tl.set(status, { opacity: 0.55 });
        if (report) tl.set(report, { opacity: 0.85 });

        tl.to(lamps, {
          opacity: 1,
          duration: 0.22,
          stagger: 0.12,
          ease: "power3.out",
        });

        beams.forEach((beam, index) => {
          const packet = packets[index];
          const rail = beam.parentElement;
          const grow = vertical ? { scaleY: 1 } : { scaleX: 1 };
          const travel = rail
            ? vertical
              ? { y: Math.max(rail.offsetHeight - 8, 0) }
              : { x: Math.max(rail.offsetWidth - 8, 0) }
            : vertical
              ? { y: 24 }
              : { x: 40 };
          tl.to(
            beam,
            { ...grow, duration: 0.9 },
            index === 0 ? ">+0.05" : ">-0.2",
          );
          if (packet) {
            tl.fromTo(
              packet,
              { opacity: 0, x: 0, y: 0 },
              { opacity: 1, ...travel, duration: 0.9, ease: "none" },
              "<",
            );
            tl.to(packet, { opacity: 0, duration: 0.12 }, ">-0.12");
          }
        });

        tl.to(
          chips,
          {
            opacity: 1,
            y: 0,
            duration: 0.22,
            stagger: 0.08,
            ease: "power3.out",
          },
          "-=0.55",
        );
        if (report) {
          tl.to(report, { opacity: 1, duration: 0.2, ease: "power3.out" }, "<");
        }
        if (status) {
          tl.to(status, { opacity: 1, duration: 0.2, ease: "power3.out" }, "<");
        }
        if (lock) {
          tl.to(lock, { opacity: 0, duration: 0.18, ease: "power3.out" });
        }
        tl.to(outs, {
          opacity: 1,
          duration: 0.22,
          stagger: 0.1,
          ease: "power3.out",
        });
        tl.to({}, { duration: 1.4 });
        tl.to([lamps, chips, outs, report, status], {
          opacity: 0.45,
          duration: 0.35,
          ease: "power3.out",
        });
        return tl;
      };

      const mm = gsap.matchMedia();
      mm.add("(min-width: 801px)", () => play(false));
      mm.add("(max-width: 800px)", () => play(true));
      return () => mm.revert();
    },
    { scope: rootRef },
  );

  return (
    <div
      ref={rootRef}
      className="home-pipeline"
      aria-label="How CodeBeast turns signals into a pull request"
    >
      <div className="home-pipeline-head">
        <p className="home-stage-label">Live path</p>
        <p className="home-pipeline-title">
          From error tracker to pull request
        </p>
      </div>

      <div className="home-pipeline-body">
        <div className="home-stage" data-node="sources">
          <p className="home-stage-label">Watch</p>
          <ul className="home-stage-list">
            {SOURCES.map((source) => (
              <li key={source.name} className="home-signal">
                <span
                  className="home-signal-lamp"
                  data-lamp
                  aria-hidden="true"
                />
                <span className="home-signal-copy">
                  <span className="home-signal-name">{source.name}</span>
                  <span className="home-signal-kind">{source.kind}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="home-stage-rail" aria-hidden="true">
          <span className="home-stage-beam" data-beam />
          <span className="home-stage-packet" data-packet />
        </div>

        <div className="home-stage home-stage--report" data-node="report">
          <div className="home-report-top">
            <p className="home-stage-label">Triaged report</p>
            <p className="home-report-status" data-status>
              needs review
            </p>
          </div>
          <p className="home-report-title">Checkout 500 on Apple Pay</p>
          <p className="home-report-meta">3 signals linked</p>
          <div className="home-report-chips">
            <span className="home-report-chip" data-chip>
              Sentry
            </span>
            <span className="home-report-chip" data-chip>
              Slack
            </span>
            <span className="home-report-chip" data-chip>
              Freshdesk
            </span>
          </div>
        </div>

        <div className="home-stage-rail" aria-hidden="true">
          <span className="home-stage-beam" data-beam />
          <span
            className="home-stage-packet home-stage-packet--warm"
            data-packet
          />
        </div>

        <div className="home-stage" data-node="destinations">
          <div className="home-report-top">
            <p className="home-stage-label">Ready to write</p>
            <p className="home-pipeline-lock" data-lock>
              waits for you
            </p>
          </div>
          <ul className="home-stage-list">
            {DESTINATIONS.map((destination) => (
              <li key={destination.name} className="home-signal" data-out>
                <span
                  className="home-signal-lamp home-signal-lamp--warm"
                  aria-hidden="true"
                />
                <span className="home-signal-copy">
                  <span className="home-signal-name">{destination.name}</span>
                  <span className="home-signal-kind">{destination.kind}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
