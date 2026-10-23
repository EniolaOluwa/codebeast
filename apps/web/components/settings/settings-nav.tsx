"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/components/ui/cn";

const ITEMS = [
  { href: "/settings", label: "Workspace" },
  { href: "/settings/members", label: "Members" },
  { href: "/settings/api-keys", label: "API keys" },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Settings" className="flex gap-1">
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm transition-colors duration-[120ms]",
            pathname === item.href
              ? "bg-surface-hover font-medium text-foreground"
              : "text-foreground-muted hover:text-foreground",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
