# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Engineering managers, on-call engineers, support leads, and QA. They review bug reports found automatically from error trackers and support channels, then approve or edit what the system proposes before anything is written to Jira or GitHub.

## Product Purpose

CodeBeast turns customer support tickets and Sentry errors into triaged reports and validated pull requests. Success means a human can confirm a small, evidence-linked fix that arrives as a PR ready for review — never as an automatic deploy or merge.

## Positioning

Signals from Sentry, Slack, Discord, and Freshdesk are deduplicated into one report with evidence attached; an AI engineer plans and patches against the repository; tests, lint, and type-check gate the change. Writes to Jira and GitHub happen only after confirmation (unless a rule says otherwise). Low confidence or protected files escalate instead of guessing.

## Operating Context

Console workflows: connect sources, review reports, tune detection and automation rules, audit activity, manage members and API keys. Marketing home page (`/`) is the entry point that drives “Open the console” / sign-in to `/login`. The console (dashboard, auth, settings) keeps its own quiet Chatbase-adjacent visual system documented in `design.md`.

## Capabilities and Constraints

- Core objects: Source, Signal, Report, Ticket (Jira), Pull Request (GitHub), Rule.
- Ticket always means a Jira ticket; Freshdesk items are Signals labeled as conversations.
- Never invents customer logos, metrics, testimonials, or case-study counts on the marketing surface.
- Home page visual system may diverge from the console via a Hallmark-dealt theme scoped under `.home`; console tokens in `@repo/design-tokens` are not rewritten for marketing.

## Brand Commitments

- Product name: CodeBeast.
- Tone for product copy: calm, precise, trustworthy.
- Console identity: light canvas, near-black primary action, thin borders, Inter + JetBrains Mono — locked in `design.md`.
- Marketing home (`/`): Hallmark deal may leave the console palette; `design.md` lock waived for `/` only.

## Evidence on Hand

- Real product claims already on the home page: source names (Sentry, Slack, Discord, Freshdesk), destinations (Jira ticket, GitHub PR), sample report copy (“Checkout 500 on Apple Pay”, “3 signals · needs review”), the four safety guarantees including “Never deploys or merges…”.
- Absent for marketing: customer logos, quotes, uptime or usage metrics, screenshots of the live console (optional later).

## Product Principles

1. Human in the loop — anything that writes to Jira or GitHub is previewable unless a rule says otherwise.
2. Show the evidence — every AI conclusion links back to the original signal.
3. Smallest correct change — patches stay minimal and gated by tests.
4. Quiet trust — the product touches production code; marketing may be more cinematic than the console but must not invent proof.
5. One memorable thing — the Report (and on marketing, the live pipeline that becomes it) is the signature.
