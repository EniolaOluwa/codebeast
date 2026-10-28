"use client";

import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { useRef } from "react";

gsap.registerPlugin(useGSAP);

const GLYPHS = "{}[]()<>/=+-*;:.01#&$%";
const CELL = 28;
const MARK_EVERY = 6;
const FILL = 0.34;
const POINTER_RADIUS = 170;
const WAVE_BAND = 46;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function randomGlyph(): number {
  return Math.floor(Math.random() * GLYPHS.length);
}

interface Palette {
  ink: string;
  cool: string;
  accent: string;
  rule: string;
  mono: string;
}

function readPalette(el: Element): Palette {
  const style = getComputedStyle(el);
  const read = (name: string) => style.getPropertyValue(name).trim();
  return {
    ink: read("--color-muted"),
    cool: read("--color-cool"),
    accent: read("--color-accent"),
    rule: read("--color-rule-2"),
    mono: read("--font-outlier") || "monospace",
  };
}

export function HomeField() {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useGSAP(
    (_context, contextSafe) => {
      const root = rootRef.current;
      const canvas = canvasRef.current;
      if (!root || !canvas || !contextSafe) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const palette = readPalette(root);
      const still = prefersReducedMotion();

      let cols = 0;
      let rows = 0;
      let width = 0;
      let height = 0;
      let glyph = new Uint8Array(0);
      let occupied = new Uint8Array(0);
      let base = new Float32Array(0);
      let heat = new Float32Array(0);
      let tone = new Uint8Array(0);
      let vignette = new Float32Array(0);

      const pointer = { x: -9999, y: -9999, strength: 0 };
      const wave = { x: 0, y: 0, r: 0, strength: 0 };

      const build = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        cols = Math.ceil(width / CELL) + 1;
        rows = Math.ceil(height / CELL) + 1;
        const total = cols * rows;
        glyph = new Uint8Array(total);
        occupied = new Uint8Array(total);
        base = new Float32Array(total);
        heat = new Float32Array(total);
        tone = new Uint8Array(total);
        vignette = new Float32Array(total);

        const cx = width / 2;
        const cy = height * 0.42;
        for (let r = 0; r < rows; r += 1) {
          for (let c = 0; c < cols; c += 1) {
            const i = r * cols + c;
            glyph[i] = randomGlyph();
            occupied[i] = Math.random() < FILL ? 1 : 0;
            base[i] = 0.05 + Math.random() * 0.11;
            const dx = (c * CELL - cx) / (width * 0.5);
            const dy = (r * CELL - cy) / (height * 0.6);
            const d = Math.sqrt(dx * dx + dy * dy);
            const edge = Math.min(1, Math.max(0, (d - 0.28) / 0.7));
            const bottom = Math.min(
              1,
              Math.max(0, (height - r * CELL) / (height * 0.35)),
            );
            vignette[i] = edge * bottom;
          }
        }
      };

      const draw = (dt: number) => {
        ctx.clearRect(0, 0, width, height);
        ctx.font = `12px ${palette.mono}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const decay = Math.pow(0.9, dt / 16.67);
        const offset = CELL / 2;

        for (let r = 0; r < rows; r += 1) {
          for (let c = 0; c < cols; c += 1) {
            const i = r * cols + c;
            const x = c * CELL + offset;
            const y = r * CELL + offset;

            let near = 0;
            if (pointer.strength > 0.01) {
              const d = Math.hypot(x - pointer.x, y - pointer.y);
              near = Math.max(0, 1 - d / POINTER_RADIUS) * pointer.strength;
              near *= near;
            }

            if (wave.strength > 0.01) {
              const ring = Math.abs(
                Math.hypot(x - wave.x, y - wave.y) - wave.r,
              );
              const hit = Math.max(0, 1 - ring / WAVE_BAND) * wave.strength;
              if (hit > heat[i]!) {
                heat[i] = hit;
                tone[i] = 0;
                if (Math.random() < 0.35) glyph[i] = randomGlyph();
              }
            }

            const h = heat[i]!;
            if (!occupied[i] && h < 0.04 && near < 0.2) continue;

            if (!still && Math.random() < 0.0015 + near * 0.06 + h * 0.08) {
              glyph[i] = randomGlyph();
            }

            const resting = occupied[i] ? base[i]! * vignette[i]! : 0;
            const alpha = Math.min(1, resting + near * 0.5 + h * 0.85);
            if (alpha < 0.015) {
              heat[i] = h * decay;
              continue;
            }

            if (h > near && h > 0.06) {
              ctx.fillStyle = tone[i] ? palette.accent : palette.cool;
            } else if (near > 0.08) {
              ctx.fillStyle = palette.cool;
            } else {
              ctx.fillStyle = palette.ink;
            }
            ctx.globalAlpha = alpha;
            ctx.fillText(GLYPHS[glyph[i]!]!, x, y);
            heat[i] = h * decay;
          }
        }

        ctx.strokeStyle = palette.rule;
        ctx.lineWidth = 1;
        for (let r = MARK_EVERY; r < rows; r += MARK_EVERY) {
          for (let c = MARK_EVERY; c < cols; c += MARK_EVERY) {
            const i = r * cols + c;
            const x = c * CELL;
            const y = r * CELL;
            let near = 0;
            if (pointer.strength > 0.01) {
              const d = Math.hypot(x - pointer.x, y - pointer.y);
              near =
                Math.max(0, 1 - d / (POINTER_RADIUS * 1.4)) * pointer.strength;
            }
            const alpha = 0.22 * (0.35 + vignette[i]! * 0.65) + near * 0.5;
            ctx.globalAlpha = Math.min(1, alpha);
            const arm = 4 + near * 3;
            ctx.beginPath();
            ctx.moveTo(x - arm, y + 0.5);
            ctx.lineTo(x + arm, y + 0.5);
            ctx.moveTo(x + 0.5, y - arm);
            ctx.lineTo(x + 0.5, y + arm);
            ctx.stroke();
          }
        }

        ctx.globalAlpha = 1;
      };

      build();

      if (still) {
        draw(16.67);
        const onResizeStill = () => {
          build();
          draw(16.67);
        };
        window.addEventListener("resize", onResizeStill);
        return () => window.removeEventListener("resize", onResizeStill);
      }

      const spawnTrace = () => {
        if (!cols || !rows) return;
        const horizontal = Math.random() < 0.6;
        const length = 8 + Math.floor(Math.random() * 12);
        const warm = Math.random() < 0.55;
        const step = horizontal ? 1 : cols;
        const limit = horizontal ? cols : rows;
        const startAlong = Math.floor(
          Math.random() * Math.max(1, limit - length),
        );
        const lane = Math.floor(Math.random() * (horizontal ? rows : cols));
        const start = horizontal
          ? lane * cols + startAlong
          : startAlong * cols + lane;
        if (vignette[start]! < 0.25) return;

        const state = { p: 0 };
        let last = -1;
        gsap.to(state, {
          p: 1,
          duration: 0.9 + length * 0.05,
          ease: "power1.inOut",
          onUpdate: () => {
            const head = Math.floor(state.p * (length - 1));
            for (let k = last + 1; k <= head; k += 1) {
              const i = start + k * step;
              if (i >= heat.length) break;
              heat[i] = 1;
              tone[i] = warm ? 1 : 0;
              glyph[i] = randomGlyph();
            }
            last = head;
          },
        });
      };

      let traceCall: gsap.core.Tween | null = null;
      const traceLoop = () => {
        spawnTrace();
        traceCall = gsap.delayedCall(1.4 + Math.random() * 1.8, traceLoop);
      };
      traceCall = gsap.delayedCall(0.6, traceLoop);

      const tick = (_time: number, deltaTime: number) => draw(deltaTime);
      gsap.ticker.add(tick);

      const pointerX = gsap.quickTo(pointer, "x", {
        duration: 0.35,
        ease: "power3.out",
      });
      const pointerY = gsap.quickTo(pointer, "y", {
        duration: 0.35,
        ease: "power3.out",
      });

      const onMove = contextSafe((event: PointerEvent) => {
        if (pointer.strength < 0.01) {
          pointer.x = event.clientX;
          pointer.y = event.clientY;
        }
        pointerX(event.clientX);
        pointerY(event.clientY);
        gsap.to(pointer, { strength: 1, duration: 0.4, overwrite: "auto" });
      });

      const onLeave = contextSafe(() => {
        gsap.to(pointer, { strength: 0, duration: 0.6, overwrite: "auto" });
      });

      const onDown = contextSafe((event: PointerEvent) => {
        wave.x = event.clientX;
        wave.y = event.clientY;
        gsap.killTweensOf(wave);
        gsap.fromTo(
          wave,
          { r: 0, strength: 1 },
          {
            r: Math.max(width, height) * 0.45,
            strength: 0,
            duration: 1.2,
            ease: "power2.out",
          },
        );
      });

      let resizeCall: gsap.core.Tween | null = null;
      const onResize = contextSafe(() => {
        resizeCall?.kill();
        resizeCall = gsap.delayedCall(0.15, build);
      });

      const finePointer = window.matchMedia(
        "(hover: hover) and (pointer: fine)",
      ).matches;
      if (finePointer) {
        window.addEventListener("pointermove", onMove);
        document.documentElement.addEventListener("pointerleave", onLeave);
      }
      window.addEventListener("pointerdown", onDown);
      window.addEventListener("resize", onResize);

      return () => {
        traceCall?.kill();
        resizeCall?.kill();
        gsap.ticker.remove(tick);
        window.removeEventListener("pointermove", onMove);
        document.documentElement.removeEventListener("pointerleave", onLeave);
        window.removeEventListener("pointerdown", onDown);
        window.removeEventListener("resize", onResize);
      };
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef} className="home-field" aria-hidden="true">
      <canvas ref={canvasRef} className="home-field-canvas" />
    </div>
  );
}
