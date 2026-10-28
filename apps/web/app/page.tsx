import Link from "next/link";

import { buttonClass } from "@/components/ui/button";

const SOURCES = ["Sentry", "Slack", "Discord", "Freshdesk"];
const DESTINATIONS = ["Jira ticket", "GitHub PR"];

const STEPS = [
  {
    title: "Triage",
    body: "Signals from Sentry, Slack, Discord and Freshdesk are deduplicated and correlated into one report with the evidence attached.",
  },
  {
    title: "Plan & patch",
    body: "An AI engineer traces the root cause in your repository and writes the smallest correct change — every claim linked to a signal.",
  },
  {
    title: "Validate & ship",
    body: "Tests, lint and type-check gate the patch. You preview the ticket and the pull request, then confirm — nothing ships on its own.",
  },
];

const GUARANTEES = [
  "Never deploys or merges — every fix arrives as a pull request ready for review.",
  "Writes to Jira and GitHub happen only after you confirm, unless a rule says otherwise.",
  "Every AI conclusion links back to the original error or message.",
  "Low confidence or protected files escalate to a human instead of guessing.",
];

export default function Home() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-[1120px] items-center justify-between px-6">
        <span className="text-base font-semibold tracking-[-0.02em]">
          CodeBeast
        </span>
        <nav className="flex items-center gap-4">
          <Link
            href="/login"
            className="text-sm text-foreground-muted transition-colors duration-[120ms] hover:text-foreground"
          >
            Sign in
          </Link>
          <Link href="/login" className={buttonClass("primary", "md")}>
            Open the console
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-[1120px] px-6 pt-20 pb-24 text-center">
          <h1 className="mx-auto max-w-[820px] text-[56px] leading-[1.05] font-semibold tracking-[-0.03em] sm:text-[64px]">
            Bugs find you. Now the fixes do too.
          </h1>
          <p className="mx-auto mt-6 max-w-[680px] text-lg leading-7 text-foreground-muted">
            CodeBeast watches your error tracker and support channels, turns
            what it finds into triaged reports, and prepares validated pull
            requests — always as a PR, never a deploy.
          </p>
          <div className="mt-8 flex justify-center">
            <Link href="/login" className={buttonClass("primary", "lg")}>
              Open the console
            </Link>
          </div>

          <div
            aria-label="The CodeBeast pipeline"
            className="mx-auto mt-16 flex max-w-[900px] flex-wrap items-center justify-center gap-x-4 gap-y-6 rounded-lg border border-border bg-surface-muted px-6 py-8"
          >
            <div className="flex flex-wrap items-center justify-center gap-2">
              {SOURCES.map((source) => (
                <span
                  key={source}
                  className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground-muted"
                >
                  <span className="grid size-5 place-items-center rounded-sm border border-border bg-surface-muted text-[10px] font-semibold">
                    {source.charAt(0)}
                  </span>
                  {source}
                </span>
              ))}
            </div>

            <span aria-hidden className="text-foreground-subtle">
              →
            </span>

            <div className="rounded-lg border border-border bg-background px-5 py-4 text-left">
              <p className="text-xs text-foreground-subtle">Report</p>
              <p className="mt-1 text-sm font-medium">
                Checkout 500 on Apple Pay
              </p>
              <p className="mt-0.5 text-xs text-foreground-subtle">
                3 signals · needs review
              </p>
            </div>

            <span aria-hidden className="text-foreground-subtle">
              →
            </span>

            <div className="flex flex-col gap-2">
              {DESTINATIONS.map((destination) => (
                <span
                  key={destination}
                  className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground-muted"
                >
                  {destination}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto max-w-[1120px] px-6 py-24">
            <h2 className="text-4xl font-semibold tracking-[-0.02em]">
              How it works
            </h2>
            <ol className="mt-12 grid gap-10 sm:grid-cols-3">
              {STEPS.map((step, index) => (
                <li key={step.title}>
                  <span className="font-mono text-sm text-foreground-subtle">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-2 text-lg font-semibold">{step.title}</h3>
                  <p className="mt-2 max-w-[46ch] text-sm leading-6 text-foreground-muted">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-t border-border bg-surface-muted">
          <div className="mx-auto max-w-[1120px] px-6 py-24">
            <h2 className="text-4xl font-semibold tracking-[-0.02em]">
              Safe by design
            </h2>
            <ul className="mt-10 grid max-w-[760px] gap-4">
              {GUARANTEES.map((guarantee) => (
                <li
                  key={guarantee}
                  className="flex items-start gap-3 text-sm leading-6 text-foreground-muted"
                >
                  <svg
                    aria-hidden
                    className="mt-0.5 shrink-0 text-success-fg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  {guarantee}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto flex max-w-[1120px] flex-col items-center gap-6 px-6 py-24 text-center">
            <h2 className="max-w-[640px] text-4xl font-semibold tracking-[-0.02em]">
              See it on your own reports
            </h2>
            <p className="max-w-[560px] text-base text-foreground-muted">
              Connect Sentry or Slack, and the first report shows up in the
              console within minutes.
            </p>
            <Link href="/login" className={buttonClass("primary", "lg")}>
              Open the console
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between px-6 py-8 text-[13px] text-foreground-subtle">
          <span>© CodeBeast</span>
          <span>Every fix ships as a pull request.</span>
        </div>
      </footer>
    </div>
  );
}
