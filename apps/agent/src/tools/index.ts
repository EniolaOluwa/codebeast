import { listDirectory } from "./list-directory.ts";
import { readFileTool } from "./read-file.ts";
import { searchCode } from "./search-code.ts";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export const EXPLORATION_TOOLS: ToolDefinition[] = [
  {
    name: "list_directory",
    description: "List files and directories under a relative path.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path (default .)" },
      },
    },
  },
  {
    name: "read_file",
    description: "Read a file with optional 1-based line range.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        start: { type: "integer" },
        end: { type: "integer" },
      },
      required: ["path"],
    },
  },
  {
    name: "search_code",
    description: "Ripgrep-style search across the repo.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string" },
        glob: { type: "string" },
      },
      required: ["pattern"],
    },
  },
];

export async function runExplorationTool(
  root: string,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  switch (name) {
    case "list_directory":
      return listDirectory(root, String(args.path ?? "."));
    case "read_file":
      return readFileTool(
        root,
        String(args.path ?? ""),
        typeof args.start === "number" ? args.start : undefined,
        typeof args.end === "number" ? args.end : undefined,
      );
    case "search_code":
      return searchCode(
        root,
        String(args.pattern ?? ""),
        typeof args.glob === "string" ? args.glob : undefined,
      );
    default:
      return `unknown tool: ${name}`;
  }
}

export { listDirectory, readFileTool, searchCode };
