# design.md: Bug Triage Dashboard

A design system and UI spec for a SaaS that scans Sentry, Slack, Discord and Freshdesk for bug reports, then raises a Jira ticket and a GitHub pull request for each one.

The visual direction follows the Chatbase dashboard: light, quiet, neutral, with a near-black primary action, thin borders, generous whitespace and a left sidebar. The values below are an approximation of that look, not a copy of Chatbase's tokens. Treat them as a starting point and tune them in the browser.

---

## 1. Product context

|                    |                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| **Users**          | Engineering managers, on-call engineers, support leads, QA                                                     |
| **Primary job**    | Review bug reports found automatically, approve or edit them, and send them to Jira and GitHub                 |
| **Secondary jobs** | Connect sources, tune detection rules, audit what the system did                                               |
| **Core objects**   | Source, Signal, Report, Ticket (Jira), Pull Request (GitHub), Rule                                             |
| **Tone**           | Calm, precise, trustworthy. The product touches production code, so the UI should never feel playful or noisy. |

### Object model (drives navigation and naming)

```
Source (Sentry project, Slack channel, Discord channel, Freshdesk group)
  └── Signal (a raw error event or message)
        └── Report (grouped, deduplicated, summarised bug)
              ├── Ticket (Jira issue)
              └── Pull Request (GitHub PR, draft fix)
```

Use these exact words everywhere. Do not mix "issue / ticket / task" or "event / signal / message".

**Naming collision to avoid:** Freshdesk has its own "tickets". In this product, **Ticket always means a Jira ticket**. A Freshdesk item is a **Signal** that the UI labels a **conversation** (for example, "Freshdesk conversation #8841"). Never call it a Freshdesk ticket in the UI.

### Integration model

| Integration                       | Role        | Connections per workspace                                                   |
| --------------------------------- | ----------- | --------------------------------------------------------------------------- |
| Jira                              | Destination | **One** Jira site                                                           |
| GitHub                            | Destination | **One** GitHub account or organisation (many repositories inside it)        |
| Sentry, Slack, Discord, Freshdesk | Sources     | One each at launch (many projects, channels, servers or groups inside each) |

---

## 2. Design principles

1. **Quiet by default.** Neutral surfaces, thin borders, one dark primary action per view. Colour appears only when it carries meaning (status, severity, source).
2. **Show the evidence.** Every Report links back to the original Sentry event or Slack message. A user must be able to verify what the AI concluded in one click.
3. **Human in the loop.** Anything that writes to Jira or GitHub is previewable before the user confirms, unless an auto-approve rule says otherwise. PRs open ready for review and notify reviewers straight away, so the preview step on manual creation is never skipped.
4. **Dense but breathable.** Tables and lists are compact (40 px rows), while page gutters and section gaps stay generous.
5. **Consistent verbs.** The same action keeps the same name across the flow: "Create ticket" produces a toast that says "Ticket created".
6. **One memorable thing.** The Report detail page, with its source evidence beside the generated ticket and PR draft, is the signature view. Everything else stays plain.

---

## 3. Colour

### 3.1 Core palette (light theme)

| Token                  | Hex       | Use                                                   |
| ---------------------- | --------- | ----------------------------------------------------- |
| `--background`         | `#FFFFFF` | App canvas, cards                                     |
| `--surface-muted`      | `#FAFAFA` | Sidebar, table headers, code blocks                   |
| `--surface-hover`      | `#F4F4F5` | Row and item hover, ghost button hover                |
| `--border`             | `#E4E4E7` | Default borders, dividers                             |
| `--border-strong`      | `#D4D4D8` | Input borders, focused containers                     |
| `--foreground`         | `#09090B` | Headings, primary text, primary button fill           |
| `--foreground-muted`   | `#52525B` | Body secondary text                                   |
| `--foreground-subtle`  | `#71717A` | Captions, placeholders, table meta                    |
| `--primary`            | `#09090B` | Primary button background                             |
| `--primary-foreground` | `#FAFAFA` | Text on primary                                       |
| `--accent`             | `#2563EB` | Links, focus ring, selected-state indicator, progress |
| `--accent-soft`        | `#EFF6FF` | Selected row tint, info banners                       |

### 3.2 Semantic colours

Each status uses a soft background, a stronger text colour, and a 1 px border so it still reads without colour.

| Meaning                     | Background | Text      | Border    |
| --------------------------- | ---------- | --------- | --------- |
| Success / Merged / Resolved | `#F0FDF4`  | `#15803D` | `#BBF7D0` |
| Warning / Needs review      | `#FFFBEB`  | `#B45309` | `#FDE68A` |
| Danger / Critical / Failed  | `#FEF2F2`  | `#B91C1C` | `#FECACA` |
| Info / In progress          | `#EFF6FF`  | `#1D4ED8` | `#BFDBFE` |
| Neutral / Ignored / Closed  | `#F4F4F5`  | `#52525B` | `#E4E4E7` |

### 3.3 Dark theme

| Token                  | Hex       |
| ---------------------- | --------- |
| `--background`         | `#09090B` |
| `--surface-muted`      | `#111113` |
| `--surface-hover`      | `#18181B` |
| `--border`             | `#27272A` |
| `--border-strong`      | `#3F3F46` |
| `--foreground`         | `#FAFAFA` |
| `--foreground-muted`   | `#A1A1AA` |
| `--foreground-subtle`  | `#71717A` |
| `--primary`            | `#FAFAFA` |
| `--primary-foreground` | `#09090B` |
| `--accent`             | `#60A5FA` |

Semantic colours in dark mode use the same hue at 12% opacity for the background, the 400-weight shade for text, and 25% opacity for the border.

### 3.4 Source colours

Source logos appear in their own colours inside a 20 px square neutral chip. Do not tint buttons, rows or headers with brand colours.

| Source    | Chip treatment                       |
| --------- | ------------------------------------ |
| Sentry    | Official logo on `--surface-muted`   |
| Slack     | Official logo on `--surface-muted`   |
| Jira      | Official logo on `--surface-muted`   |
| GitHub    | Official mark, inverted in dark mode |
| Discord   | Official mark on `--surface-muted`   |
| Freshdesk | Official mark on `--surface-muted`   |

---

## 4. Typography

**Family:** Inter (variable), with fallback `ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`.
**Monospace:** `"Geist Mono", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace`. Use it only for stack traces, code, diffs, commit SHAs, issue keys (e.g. `ENG-1234`) and file paths.

Use sentence case everywhere. Avoid all-caps labels.

| Role          | Size / Line height | Weight | Tracking | Use                        |
| ------------- | ------------------ | ------ | -------- | -------------------------- |
| Page title    | 24 / 32            | 600    | -0.02em  | Top of each page           |
| Section title | 18 / 28            | 600    | -0.01em  | Card and panel titles      |
| Subsection    | 15 / 24            | 600    | 0        | Group headings in settings |
| Body          | 14 / 22            | 400    | 0        | Default text               |
| Body strong   | 14 / 22            | 500    | 0        | Row titles, labels         |
| Small         | 13 / 20            | 400    | 0        | Table cells, helper text   |
| Caption       | 12 / 16            | 400    | 0        | Timestamps, counts, badges |
| Code          | 13 / 20            | 400    | 0        | Mono blocks                |

Rules:

- Body line length stays under 75 characters in prose areas (report summaries, descriptions).
- Numbers in tables use `font-variant-numeric: tabular-nums`.
- Left-align all text. Right-align numeric columns only.

---

## 5. Spacing, radius, elevation

### Spacing scale (4 px base)

`4, 8, 12, 16, 20, 24, 32, 40, 48, 64`

- Page padding: 32 px desktop, 16 px mobile.
- Gap between sections: 32 px.
- Card padding: 20 px (16 px for compact cards).
- Form field vertical gap: 16 px.

### Radius

| Token           | Value   | Use                                   |
| --------------- | ------- | ------------------------------------- |
| `--radius-sm`   | 6 px    | Badges, small chips, checkboxes       |
| `--radius-md`   | 8 px    | Buttons, inputs, selects, menu items  |
| `--radius-lg`   | 12 px   | Cards, panels, dialogs                |
| `--radius-full` | 9999 px | Avatars, toggle switches, status dots |

Do not use one radius for everything. The hierarchy above is intentional.

### Elevation

Flat by default. Borders do the work.

| Level | Style                                                    | Use                                  |
| ----- | -------------------------------------------------------- | ------------------------------------ |
| 0     | `1px solid var(--border)`                                | Cards, tables, inputs                |
| 1     | `0 1px 2px rgba(9,9,11,0.06)`                            | Hovered cards that are clickable     |
| 2     | `0 8px 24px rgba(9,9,11,0.10), 0 0 0 1px var(--border)`  | Popovers, dropdowns, command palette |
| 3     | `0 16px 48px rgba(9,9,11,0.16), 0 0 0 1px var(--border)` | Dialogs                              |

No gradients on surfaces. No glassmorphism.

---

## 6. Layout

### 6.1 App shell

```
┌──────────────┬──────────────────────────────────────────────────┐
│ Workspace ▾  │  Page title                    [Secondary][Primary]│
│              │  Short description                                │
│ Overview     ├──────────────────────────────────────────────────┤
│ Reports      │                                                    │
│ Sources      │   Content (max-width 1200px, left-aligned)         │
│ Rules        │                                                    │
│ Activity     │                                                    │
│              │                                                    │
│ ──────────── │                                                    │
│ Settings     │                                                    │
│ Help         │                                                    │
│ ◯ User       │                                                    │
└──────────────┴──────────────────────────────────────────────────┘
```

- **Sidebar:** 240 px wide, `--surface-muted` background, 1 px right border. Collapses to a 56 px icon rail below 1100 px and to a drawer below 768 px.
- **Top of sidebar:** workspace switcher (avatar, name, chevron).
- **Nav item:** 36 px tall, 8 px radius, 16 px icon (1.5 px stroke, Lucide), 14 px label. Active item has `--background` fill, 1 px border and `--foreground` text. Inactive items use `--foreground-muted` with `--surface-hover` on hover.
- **Bottom of sidebar:** Settings, Help, user menu.
- **Content area:** `--background`. Content is left-aligned with a max width of 1200 px. Tables may go full width.
- **Page header:** title and optional one-line description on the left, actions on the right. Primary action is always the rightmost button.

### 6.2 Grid

12-column grid, 24 px gutters, inside the content area. Stat cards use 4 columns each (3 across), panels use 6 or 8 columns.

---

## 7. Navigation and information architecture

| Nav item     | Purpose                                                            | Badge                           |
| ------------ | ------------------------------------------------------------------ | ------------------------------- |
| **Overview** | Health of the pipeline, recent reports, quick stats                | none                            |
| **Reports**  | Inbox of detected bugs awaiting action; the main working surface   | count of "Needs review"         |
| **Sources**  | Connect and manage Sentry, Slack, chat platforms                   | dot if a source is disconnected |
| **Rules**    | What to detect, how to group, when to auto-create tickets and PRs  | none                            |
| **Activity** | Audit log of every action taken (human or automated)               | none                            |
| **Settings** | Workspace, members, integrations (Jira, GitHub), billing, API keys | none                            |

Jira and GitHub are destinations, so they live under Settings → Integrations and appear as chips on reports. Sentry, Slack, Discord and Freshdesk are inputs, so they live under Sources. Because each workspace has one Jira site and one GitHub account, there is no account switcher anywhere in the UI.

---

## 8. Pages

### 8.1 Overview

Purpose: tell the user in five seconds whether the pipeline is healthy and what needs attention.

```
Overview                                            [Last 7 days ▾]

┌ Reports found ┐ ┌ Tickets created ┐ ┌ PRs opened ┐
│ 142           │ │ 98              │ │ 31         │
│ +12% vs prev  │ │ 69% of reports  │ │ 22% merged │
└───────────────┘ └─────────────────┘ └────────────┘

┌ Reports over time ─────────────────────┐ ┌ Needs review ──────┐
│  line chart, 3 series                   │ │ 6 reports          │
│  (found / ticketed / PR opened)         │ │ list of 5 + link   │
└─────────────────────────────────────────┘ └────────────────────┘

┌ Source health ───────────────────────────────────────────────────┐
│ Sentry   Connected   last sync 2 min ago      ● Healthy          │
│ Slack    Connected   last sync 40 sec ago     ● Healthy          │
│ Discord  Connected   last sync 1 min ago      ● Healthy          │
│ Freshdesk Error      key revoked              ● Reconnect        │
└──────────────────────────────────────────────────────────────────┘
```

- Stat cards: 14 px label in `--foreground-muted`, 28 px / 600 value, 12 px delta in semantic colour. No icons, no gradients.
- Charts: single hue family. Use `--foreground` for the main series, `--accent` for the second, `#A1A1AA` for the third. Thin 1.5 px lines, light grid in `--border`, no fill under lines.

### 8.2 Reports (inbox)

Purpose: triage. This is where users spend most of their time.

```
Reports                                       [Export] [New report]

[Search reports...]  [Status ▾] [Source ▾] [Severity ▾]   Sort: Newest ▾

☐ Title                        Source   Severity  Status        Ticket     PR        Found
─────────────────────────────────────────────────────────────────────────────────────────
☐ Checkout 500 on Apple Pay    ⬡ ⬡ 3    Critical  Needs review  —          —         4m ago
☐ Avatar upload fails >5MB     💬 2     High      PR open       ENG-2041   #482      1h ago
☐ Dark mode flicker on Safari  ⬡        Low       Ignored       —          —         3h ago
```

- **Table:** 40 px rows, header on `--surface-muted`, 1 px row dividers, hover `--surface-hover`. No zebra stripes.
- **Source column:** stacked 20 px source chips, with a count if more than 3 signals are grouped.
- **Severity:** badge with a dot. Critical (danger), High (warning), Medium (info), Low (neutral).
- **Status values:** `Needs review`, `Ticket created`, `PR open`, `Merged`, `Ignored`, `Failed`.
- **Ticket column:** Jira key in mono, as a link with an external-link icon on hover.
- **PR column:** `#482` with state badge (Open, Merged, Closed). PRs are created ready for review, so `Draft` appears only if a reviewer converts the PR on GitHub.
- **Bulk actions:** selecting rows reveals a bar pinned above the table: `3 selected · Create tickets · Ignore · Merge duplicates`.
- **Row click:** opens the Report detail page.
- **Pagination:** footer with `1–25 of 142`, rows-per-page select, prev/next ghost buttons.

### 8.3 Report detail (signature view)

Purpose: verify the evidence, edit the generated output, and ship.

```
← Reports

Checkout 500 on Apple Pay                      [Ignore] [Create ticket ▾]
Critical · Needs review · Found 4 minutes ago

┌ Evidence ──────────────────────────┐ ┌ Generated output ─────────────┐
│ Summary                            │ │ [Jira ticket] [GitHub PR]      │
│ Plain-language summary written by  │ │                                │
│ the AI, 3–4 sentences.             │ │ Title      [editable input]    │
│                                    │ │ Project    [ENG ▾]  Type [Bug▾]│
│ Signals (3)                        │ │ Priority   [High ▾]            │
│ ⬡ Sentry  TypeError at pay.ts:88   │ │ Assignee   [Auto-suggest ▾]    │
│    142 events · 61 users           │ │ Description                    │
│ 💬 Slack #support  "apple pay..."  │ │ [rich text editor]             │
│ 💬 Freshdesk conversation #8841    │ │                                │
│                                    │ │ ─────────────────────────────  │
│ Stack trace                        │ │ Preview of what will be sent   │
│ [mono code block, collapsible]     │ │                                │
│                                    │ │ [Save draft]   [Create ticket] │
│ Possible cause                     │ └────────────────────────────────┘
│ file path chips + confidence       │
└────────────────────────────────────┘
```

- **Layout:** two columns, 7/5 split, stacking on tablet.
- **Evidence panel:** each signal is a row with source chip, short excerpt and an "Open in Sentry", "Open in Slack", "Open in Discord" or "Open in Freshdesk" link.
  - Slack and Discord messages show the author avatar, channel name (and server name for Discord).
  - Freshdesk conversations show requester, group and priority. Customer emails and names are masked by default, with a `Show details` toggle for users who have permission.
- **Generated output panel:** tabs for Jira ticket and GitHub PR. The PR tab shows repository, base branch, new branch name (mono), PR title, description, reviewers (pre-filled from CODEOWNERS where available), changed files list, and a diff viewer. A one-line notice sits above the create button: `This PR opens ready for review and will notify reviewers.`
- **Confidence:** show a small label ("High confidence" or "Low confidence, review carefully") next to the possible cause and the PR tab. Never show a bare percentage without a label.
- **Primary action:** `Create ticket` is the dark primary button. The chevron opens a menu: `Create ticket and open PR`, `Create ticket only`, `Open PR only`.
- **After creation:** the output panel becomes read-only and shows the linked Jira key and PR number as chips, The ticket has an `Undo` text button for 30 seconds. A PR cannot be quietly undone because reviewers may already be notified, so its action reads `Close PR` and asks for confirmation.

### 8.4 Sources

Purpose: connect and monitor inputs.

- Page is a grid of source cards (3 across) with logo, name, one-line description and a `Connect` button. Connected sources show a green status dot and `Manage`.
- Clicking `Manage` opens a detail page with tabs: `Overview`, `Scope`, `Sync history`, `Settings`.
- **Scope examples:**
  - Sentry: projects and environments.
  - Slack: channels (multi-select with search), with an option to include public channels only.
  - Discord: servers, then channels within each (multi-select with search).
  - Freshdesk: groups and conversation priorities, plus a minimum age so brand-new conversations are not picked up mid-triage.
- **Launch sources:** Sentry, Slack, Discord and Freshdesk. The Sources grid shows these four; further sources appear later as a "Coming soon" row only if the roadmap is public.
- **Repository mapping:** each source scope can map to a GitHub repository (`Sentry project web-app → acme/web-app`). Unmapped scopes still create Jira tickets but cannot open PRs, and the UI says so.
- **Sync history:** table with time, items scanned, signals found, errors.
- Connection flows differ by source, and each ends with a confirmation step that lists exactly what access was granted:
  - Sentry and Slack: OAuth in a popup.
  - Discord: bot invite in a popup. The person installing needs Manage Server permission, so show a "Send this link to a server admin" option for everyone else.
  - Freshdesk: Freshdesk domain plus API key in a dialog, with a `Test connection` button before saving.

### 8.5 Rules

Purpose: control what becomes a report and what happens next.

- Two sections: **Detection** (what counts as a bug report) and **Automation** (what to do with it).
- Each rule is a card with a name, a plain-language sentence (`When a Sentry issue affects more than 50 users, create a Jira ticket in ENG`), an enable switch and an overflow menu.
- Rule builder uses a vertical IF / THEN form with dropdowns, not a node graph.
- Auto-creation of tickets or PRs is **off by default** and gated behind an explicit confirmation dialog.
- Because PRs open ready for review, a rule that opens PRs must set: target repository, base branch, reviewers (or `Use CODEOWNERS`), a minimum confidence level, and a daily PR limit (default 5). The rule cannot be enabled until all five are set.
- The confirmation dialog for a PR rule says in plain terms: `This rule will open PRs that are ready for review and notify your reviewers.`
- Include a dry-run: `Test this rule against the last 7 days` shows how many reports it would have matched.

### 8.6 Activity

Chronological log table: time, actor (user or `Automation`), action, target, result. Filterable. Each row expands to show the request payload sent to Jira or GitHub.

### 8.7 Settings

Left sub-navigation inside the content area (200 px): `General`, `Members`, `Integrations`, `Billing`, `API keys`. Forms are single-column, max 560 px wide, with a sticky footer containing `Save changes` and `Cancel` when the form is dirty.

**Integrations page:** two cards only, Jira and GitHub.

- Not connected: logo, one line on what it does, `Connect`.
- Connected: site or organisation name, connected-by and date, `Manage`, `Disconnect`. No account switcher and no "add another account" action.
- Jira `Manage`: default project, issue type, field mappings.
- GitHub `Manage`: repositories the app can access (multi-select), default base branch, default reviewers.
- If a user tries to connect a second account, show: `This workspace already has a Jira site connected. Disconnect it first to connect a different one.`

---

## 9. Components

### Buttons

| Variant     | Style                                                            | Use                                                |
| ----------- | ---------------------------------------------------------------- | -------------------------------------------------- |
| Primary     | `--primary` fill, `--primary-foreground` text                    | One per view: Create ticket, Save changes, Connect |
| Secondary   | `--background` fill, 1 px `--border-strong`, `--foreground` text | Cancel, Export, Open in Sentry                     |
| Ghost       | transparent, `--surface-hover` on hover                          | Toolbar and row actions                            |
| Destructive | `#DC2626` fill, white text                                       | Delete source, Disconnect, Revoke key              |
| Link        | `--accent` text, underline on hover                              | Inline navigation                                  |

Sizes: `sm` 32 px, `md` 36 px (default), `lg` 40 px. Horizontal padding 12/14/16 px. Radius 8 px. 14 px / 500 text. Loading state replaces the label with a 14 px spinner and keeps the width fixed. Disabled state is 50% opacity with `not-allowed` cursor.

### Inputs

36 px tall, 8 px radius, 1 px `--border-strong`, 12 px horizontal padding, 14 px text. Focus: 2 px `--accent` ring at 30% opacity plus an `--accent` border. Error: `--danger` border plus an inline message below in 13 px. Labels sit above in 14 px / 500; helper text sits below in 13 px `--foreground-subtle`.

### Select, combobox, multi-select

Same height and border as inputs. Menus use elevation 2 and 8 px radius, with 32 px items and a check icon for the selected value.

### Badges

22 px tall, 6 px radius, 12 px / 500 text, 8 px horizontal padding, optional 6 px status dot. Use the semantic palette in section 3.2.

### Tabs

Underline style. 40 px tall, 14 px / 500, the active tab has a 2 px `--foreground` underline. Do not use pill tabs except for the segmented control on the Report detail output panel.

### Cards

`--background`, 1 px `--border`, 12 px radius, 20 px padding. Optional header row with title on the left and an action on the right, separated from the body by a 1 px divider only when the body is a list or table.

### Tables

See 8.2. Sticky header, horizontally scrollable on small screens, with the first column pinned.

### Dialogs and sheets

- Dialog: 480 px (small), 640 px (medium). 12 px radius, elevation 3, 24 px padding, 50% black overlay with no blur.
- Destructive confirmations require the user to type the resource name.
- Side sheet (480 px) for quick previews of a report from the inbox.

### Toasts

Bottom-right, 360 px, 1 px border, elevation 2, 8 px radius. Contains a one-line message and an optional action link. Auto-dismiss after 5 seconds, except errors, which persist.

### Command palette

`⌘K` opens a palette with search across reports, Jira keys, PR numbers and actions.

### Code and diff blocks

`--surface-muted` background, 1 px border, 8 px radius, 13 px mono. Diff lines use `#F0FDF4` (added) and `#FEF2F2` (removed) backgrounds with a 2 px left border in the matching text colour. Include a copy button on hover.

### Icons

Lucide, 16 px in navigation and controls, 20 px in empty states, 1.5 px stroke, `currentColor`.

---

## 10. States

### Loading

Skeleton rows and blocks in `--surface-hover` with a slow 1.5 s shimmer. Never show a full-page spinner. Show the page header immediately.

### Empty

One icon in a 40 px neutral circle, one line saying what is missing and why, one button saying what to do.

| Where               | Message                                                                         | Action           |
| ------------------- | ------------------------------------------------------------------------------- | ---------------- |
| Reports, no sources | No sources connected yet. Connect Sentry or Slack to start finding bug reports. | Connect a source |
| Reports, all clear  | No reports need review. New ones appear here as they are found.                 | none             |
| Rules               | No rules yet. Rules decide which signals become reports.                        | Create rule      |

### Error

Plain, specific, with a fix. Errors do not apologise.

- Good: `Couldn't create the Jira ticket. The ENG project requires a component. Add one and try again.`
- Bad: `Oops! Something went wrong.`

Source and integration failures show an inline banner on the affected page and a dot on the sidebar item.

### Partial success

When a Report creates a ticket but the PR fails, show both results explicitly (`Ticket ENG-2041 created`, `PR failed: branch already exists`) with a `Retry PR` action. Do not show a single generic failure.

---

## 11. Content and copy

- Sentence case for all UI text, including buttons and menu items.
- Reserve "ticket" for Jira. Freshdesk items are "conversations".
- Buttons name the action: `Create ticket`, `Open PR`, `Save changes`, `Connect Slack`. Never `Submit` or `OK`.
- Keep the same verb across button, confirmation and toast: `Create ticket` → `Ticket created`.
- Refer to the user's things in plain terms: "channels", "projects", "repositories", not "scopes" or "payloads" (except in the audit log).
- Timestamps are relative under 24 hours (`4m ago`) and absolute afterwards (`Oct 23, 14:05`), with the full timestamp in a tooltip.
- AI-generated text is always labelled as such where a user can edit it (`Generated by AI. Review before sending.`) in 13 px `--foreground-subtle`.
- Avoid exclamation marks, emoji and marketing language inside the app.

---

## 12. Motion

- Default transition: 120 ms `ease-out` for colour, border and background changes.
- Menus, popovers, dialogs: 160 ms fade plus 4 px translate.
- Sidebar collapse: 200 ms width transition.
- New report arriving in the inbox: the row fades in with a brief `--accent-soft` highlight that fades over 2 s.
- No entrance animations on page load, no scroll-triggered effects, no hover lift on cards.
- Respect `prefers-reduced-motion`: remove translate and shimmer, keep opacity changes.

---

## 13. Accessibility and responsiveness

- Text contrast at least 4.5:1 for body, 3:1 for large text and UI borders. Verify `--foreground-subtle` on `--surface-muted`.
- Visible focus ring on every interactive element (2 px `--accent`, 2 px offset).
- Status is never conveyed by colour alone: always pair with text or icon.
- All icon-only buttons have an `aria-label` and a tooltip.
- Tables use real `<table>` semantics, with sortable headers announcing sort state.
- Keyboard: `J/K` to move through reports, `Enter` to open, `C` to create ticket, `I` to ignore, `⌘K` for the palette, `?` for the shortcut list.
- Breakpoints: `sm 640`, `md 768`, `lg 1024`, `xl 1280`. Below `md`, tables convert to stacked list items showing title, severity, status and time; the Report detail columns stack with the generated output below the evidence.
- Minimum touch target 40 px on mobile.

---

## 14. Implementation notes

**Recommended stack:** Next.js, Tailwind CSS, shadcn/ui (its defaults already match this aesthetic), Lucide icons, Recharts for charts, TanStack Table for the reports table.

### CSS tokens

```css
:root {
  --background: #ffffff;
  --surface-muted: #fafafa;
  --surface-hover: #f4f4f5;
  --border: #e4e4e7;
  --border-strong: #d4d4d8;
  --foreground: #09090b;
  --foreground-muted: #52525b;
  --foreground-subtle: #71717a;
  --primary: #09090b;
  --primary-foreground: #fafafa;
  --accent: #2563eb;
  --accent-soft: #eff6ff;

  --success-bg: #f0fdf4;
  --success-fg: #15803d;
  --success-border: #bbf7d0;
  --warning-bg: #fffbeb;
  --warning-fg: #b45309;
  --warning-border: #fde68a;
  --danger-bg: #fef2f2;
  --danger-fg: #b91c1c;
  --danger-border: #fecaca;
  --info-bg: #eff6ff;
  --info-fg: #1d4ed8;
  --info-border: #bfdbfe;

  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;

  --font-sans:
    "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: "Geist Mono", "JetBrains Mono", ui-monospace, Menlo, monospace;
}

:root.dark {
  --background: #09090b;
  --surface-muted: #111113;
  --surface-hover: #18181b;
  --border: #27272a;
  --border-strong: #3f3f46;
  --foreground: #fafafa;
  --foreground-muted: #a1a1aa;
  --foreground-subtle: #71717a;
  --primary: #fafafa;
  --primary-foreground: #09090b;
  --accent: #60a5fa;
  --accent-soft: #172554;
}
```

### Tailwind mapping (excerpt)

```js
// tailwind.config.js
theme: {
  extend: {
    colors: {
      background: "var(--background)",
      muted: "var(--surface-muted)",
      border: "var(--border)",
      foreground: "var(--foreground)",
      primary: { DEFAULT: "var(--primary)", foreground: "var(--primary-foreground)" },
      accent: { DEFAULT: "var(--accent)", soft: "var(--accent-soft)" },
    },
    borderRadius: { sm: "6px", md: "8px", lg: "12px" },
    fontFamily: { sans: ["var(--font-sans)"], mono: ["var(--font-mono)"] },
  },
}
```

### Build order

1. Shared tokens package (section 15), app shell, sidebar, theme
2. Reports table and filters (with mock data)
3. Report detail page (signature view)
4. Sources and connection flow
5. Rules builder
6. Overview and Activity
7. Settings

---

## 15. Marketing site alignment

The public marketing site shares its design tokens with the dashboard so the two read as one product.

### What is shared

- Colours, semantic colours, border and radius tokens
- Font families (Inter and the mono face) and the weights in section 4
- Button, badge, input and link styles
- Icon set (Lucide) and the source and destination logo chips
- Dark theme tokens

### What differs

|                 | Dashboard                               | Marketing site                                                     |
| --------------- | --------------------------------------- | ------------------------------------------------------------------ |
| Display type    | Page title 24 px                        | Hero 56–72 px / 600 / -0.03em; section titles 36–44 px             |
| Body type       | 14 px                                   | 16–18 px                                                           |
| Section spacing | 32 px                                   | 96–128 px                                                          |
| Container       | Left-aligned, max 1200 px               | Centered, max 1120 px, prose max 680 px                            |
| Buttons         | 36 px default                           | 44–48 px                                                           |
| Elevation       | Borders first, shadows only on overlays | Same, with elevation 1 allowed on screenshot frames                |
| Motion          | Minimal, 120–200 ms                     | One orchestrated hero moment on load, otherwise the same restraint |

### Rules for marketing pages

- Use real product UI (the Report detail view, the Reports table) in place of illustrations. The page should show the actual product at work.
- Show the pipeline plainly in the hero or just below it: Sentry, Slack, Discord and Freshdesk on one side, a Report in the middle, a Jira ticket and a GitHub PR on the other.
- One dark primary button per section. No brand-coloured buttons, no gradient washes.
- The integrations strip uses the same neutral logo chips as the Sources grid.
- Copy follows section 11 (sentence case, plain verbs). Use "conversation" for Freshdesk items on the marketing site as well.

### How to share

- Publish a tokens package (for example `@yourco/design-tokens`) in a monorepo. It exports `tokens.css` (the variables in section 14), `tokens.json` (for Style Dictionary or Figma), and a Tailwind preset.
- Put shared components (button, badge, input, source chip, logo set) in a `ui` package that both apps import.
- Neither app hard-codes a hex value. Marketing-only values (display sizes, section spacing) live in a `marketing` extension of the preset, not in the shared core.
- Version the package with semver and update both apps together on any token change.

---

## 16. Do and don't

| Do                                           | Don't                                                     |
| -------------------------------------------- | --------------------------------------------------------- |
| Use one dark primary button per view         | Colour buttons by integration brand                       |
| Show source evidence beside every AI output  | Show AI conclusions without a link to the original signal |
| Keep surfaces white and borders thin         | Add gradients, glows or heavy shadows                     |
| Use mono type only for code, keys and paths  | Use mono for general labels                               |
| Make auto-create opt-in with a clear dry run | Enable auto ticket or PR creation by default              |
| Write specific error messages with a fix     | Write "Something went wrong"                              |

---

## 17. Decisions and open questions

### Decided

| Question                               | Decision                                          |
| -------------------------------------- | ------------------------------------------------- |
| Jira and GitHub accounts per workspace | One each                                          |
| PR state on creation                   | Ready for review (not draft)                      |
| First chat and support sources         | Discord and Freshdesk, alongside Sentry and Slack |
| Marketing site shares tokens           | Yes, via a shared tokens package (section 15)     |

### Still open

- **Freshdesk data handling:** which fields are stored, how long, and whether masking of customer details is a workspace setting or always on.
- **Repository inference:** when a source scope is not mapped to a repository, does the product suggest one, or require manual mapping?
- **GitHub permissions:** what the UI shows when the GitHub app has read access but not write access to a repository.
- **PR safety limits:** whether the default cap of 5 auto-opened PRs per day suits your customers, and whether PR rules should require a human to approve the first N runs.
- **Discord onboarding:** how to guide users who are not server admins (the admin-link flow in section 8.4 is a first proposal).
- **Marketing stack:** which framework the marketing site uses, so the tokens package can ship the right preset.
