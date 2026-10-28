"use client";

import { type ReactNode, useState } from "react";

import { cn } from "./cn";

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

/** Underline tabs (design.md §9). */
export function Tabs({ tabs }: { tabs: TabItem[] }) {
  const [active, setActive] = useState(tabs[0]?.id);

  return (
    <div>
      <div
        role="tablist"
        className="flex h-10 items-center gap-5 border-b border-border"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={active === tab.id}
            onClick={() => setActive(tab.id)}
            className={cn(
              "h-10 border-b-2 text-sm font-medium transition-colors duration-[120ms] ease-out",
              active === tab.id
                ? "border-foreground text-foreground"
                : "border-transparent text-foreground-muted hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="pt-4">
        {tabs.find((tab) => tab.id === active)?.content}
      </div>
    </div>
  );
}
