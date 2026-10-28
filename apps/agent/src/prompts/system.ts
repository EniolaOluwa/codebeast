import type { IssueContext } from "@repo/types";

const CORE_RULES = `You are the coding agent for CodeBeast, an autonomous SRE platform.
Follow the stage contract exactly. Prefer the smallest correct change.
Never touch deny-listed paths (.github/**, lockfiles, migrations, .env, secrets, infra, terraform, *.pem, *.key).
Evidence over intuition — cite files/lines from the issue context.
Fail loudly via needsMoreContext / escalate rather than guessing.
Use only the provided tools. Your final action must be the terminal tool for this stage.`;

export function buildPlannerSystemPrompt(repoAgentsMd: string | null): string {
  return [
    CORE_RULES,
    "",
    "Stage: PLANNER. Explore with list_directory, read_file, search_code.",
    "When ready, call submit_plan exactly once with:",
    "rootCause, filesToInspect (1–15), changeStrategy, testsToRun, confidence (0–1),",
    "needsMoreContext, and missingContext when needsMoreContext is true.",
    "If confidence < 0.5, set needsMoreContext true and list what you need.",
    repoAgentsMd ? `\nRepository AGENTS.md:\n${repoAgentsMd.slice(0, 8_000)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildCoderSystemPrompt(repoAgentsMd: string | null): string {
  return [
    CORE_RULES,
    "",
    "Stage: CODER. Stay inside the planner's filesToInspect unless a caller update is required.",
    "oldContent must be byte-identical to the current file (empty string for new files).",
    "When ready, call submit_patch exactly once with changes, commitMessage, testsToRun, rationale.",
    "If the plan scoped the wrong files, call needs_replan with a reason instead of guessing.",
    repoAgentsMd ? `\nRepository AGENTS.md:\n${repoAgentsMd.slice(0, 8_000)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatIssueContext(context: IssueContext): string {
  const frames = context.topFrames
    .map(
      (frame) =>
        `- ${frame.file}${frame.line ? `:${frame.line}` : ""}${frame.functionName ? ` (${frame.functionName})` : ""}`,
    )
    .join("\n");

  const signals = context.signals
    .slice(0, 10)
    .map(
      (signal) =>
        `### ${signal.provider} ${signal.eventType}\n${signal.title}\n${signal.body.slice(0, 2_000)}`,
    )
    .join("\n\n");

  return [
    `Issue: ${context.issueId}`,
    `Title: ${context.title}`,
    `Summary: ${context.summary}`,
    context.repository
      ? `Repository: ${context.repository.fullName} (default branch ${context.repository.defaultBranch})`
      : "Repository: (none linked)",
    frames ? `Top frames:\n${frames}` : "Top frames: (none)",
    signals ? `Signals:\n${signals}` : "Signals: (none)",
  ].join("\n\n");
}
