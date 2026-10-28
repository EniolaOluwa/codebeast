import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => cleanup());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  })),
  headers: vi.fn(() => new Map()),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "--font-inter", className: "font-inter" }),
  JetBrains_Mono: () => ({
    variable: "--font-jetbrains",
    className: "font-jetbrains",
  }),
  Host_Grotesk: () => ({
    variable: "--font-home-display",
    className: "font-home-display",
  }),
  Atkinson_Hyperlegible_Mono: () => ({
    variable: "--font-home-mono",
    className: "font-home-mono",
  }),
}));

vi.mock("gsap", () => {
  const tween = {
    to: vi.fn(),
    fromTo: vi.fn(),
    set: vi.fn(),
    quickTo: vi.fn(() => vi.fn()),
    timeline: vi.fn(() => ({
      to: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
    })),
    registerPlugin: vi.fn(),
  };
  return { gsap: tween, default: tween };
});

vi.mock("@gsap/react", () => ({
  useGSAP: vi.fn(),
}));
