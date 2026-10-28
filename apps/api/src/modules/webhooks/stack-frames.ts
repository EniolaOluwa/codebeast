import { MAX_STACK_FRAMES, type StackFrame } from "@repo/types";

/**
 * Deterministic stack-frame extraction, so the planner receives file/line
 * hints without spending model tokens parsing raw traces. Handles both
 * `at function (file:line:col)` and `at file:line:col` shapes.
 */
const FRAME_PATTERN = /at\s+(?:(\S+)\s+\()?([^\s()]+):(\d+):\d+\)?/g;

export function extractStackFrames(
  text: string,
  limit = MAX_STACK_FRAMES,
): StackFrame[] {
  const frames: StackFrame[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(FRAME_PATTERN)) {
    const [, functionName, file, line] = match as unknown as [
      string,
      string | undefined,
      string,
      string,
    ];

    const key = `${file}:${line}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    frames.push({
      file,
      line: Number(line),
      ...(functionName ? { functionName } : {}),
    });

    if (frames.length >= limit) {
      break;
    }
  }

  return frames;
}

/** Dedupes frames across signals, preserving first-seen order. */
export function mergeStackFrames(
  texts: string[],
  limit = MAX_STACK_FRAMES,
): StackFrame[] {
  const merged: StackFrame[] = [];
  const seen = new Set<string>();

  for (const text of texts) {
    for (const frame of extractStackFrames(text, limit)) {
      const key = `${frame.file}:${frame.line ?? ""}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      merged.push(frame);

      if (merged.length >= limit) {
        return merged;
      }
    }
  }

  return merged;
}
