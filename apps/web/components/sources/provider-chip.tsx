import type { Provider } from "@repo/types";

import { PROVIDER_LABELS } from "@/lib/providers";

/**
 * Neutral 20px chip with the provider's initial (design.md §3.4 wants the
 * official marks; text stands in until logo assets exist).
 */
export function ProviderChip({ provider }: { provider: Provider }) {
  return (
    <span
      title={PROVIDER_LABELS[provider]}
      className="grid size-5 shrink-0 place-items-center rounded-sm border border-border bg-surface-muted text-[10px] font-semibold text-foreground-muted"
    >
      {PROVIDER_LABELS[provider].charAt(0)}
    </span>
  );
}

export function ProviderChips({ providers }: { providers: Provider[] }) {
  return (
    <span className="flex items-center gap-1">
      {providers.map((provider) => (
        <ProviderChip key={provider} provider={provider} />
      ))}
    </span>
  );
}
