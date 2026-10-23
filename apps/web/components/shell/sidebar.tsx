"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { logoutAction } from "@/app/(dashboard)/actions";
import { cn } from "@/components/ui/cn";

import { ThemeToggle } from "./theme-toggle";

const NAV = [
  { href: "/overview", label: "Overview" },
  { href: "/issues", label: "Reports" },
  { href: "/sources", label: "Sources" },
  { href: "/rules", label: "Rules" },
  { href: "/settings", label: "Settings" },
];

function navItemClass(active: boolean): string {
  return cn(
    "flex h-9 items-center rounded-md px-3 text-sm transition-colors duration-[120ms] ease-out",
    active
      ? "border border-border bg-background font-medium text-foreground"
      : "text-foreground-muted hover:bg-surface-hover hover:text-foreground",
  );
}

export function Sidebar({
  userLabel,
  role,
}: {
  userLabel: string;
  role: string;
}) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-surface-muted md:flex">
      <div className="flex h-14 items-center px-4 text-sm font-semibold tracking-[-0.01em]">
        CodeBeast
      </div>

      <nav aria-label="Primary" className="flex-1 space-y-1 px-2">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={navItemClass(
              pathname === item.href || pathname.startsWith(`${item.href}/`),
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium">{userLabel}</p>
          <p className="text-xs text-foreground-subtle capitalize">
            {role.toLowerCase()}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <form action={logoutAction}>
            <button
              type="submit"
              aria-label="Sign out"
              className="grid size-8 place-items-center rounded-md text-foreground-muted transition-colors duration-[120ms] hover:bg-surface-hover hover:text-foreground"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="m16 17 5-5-5-5" />
                <path d="M21 12H9" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

/** Horizontal nav for below-md screens (design.md §6.1 collapses). */
export function MobileNav() {
  const pathname = usePathname();

  return (
    <div className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-border bg-background px-4 md:hidden">
      <span className="mr-2 text-sm font-semibold">CodeBeast</span>
      <nav aria-label="Primary" className="flex flex-1 items-center gap-1">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-md px-2 py-1 text-[13px]",
              pathname === item.href || pathname.startsWith(`${item.href}/`)
                ? "bg-surface-hover font-medium text-foreground"
                : "text-foreground-muted",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <form action={logoutAction}>
        <button
          type="submit"
          className="rounded-md px-2 py-1 text-[13px] text-foreground-muted"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
