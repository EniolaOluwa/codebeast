import { IntegrationsService } from "../modules/integrations/integrations.service.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import type {
  CreatedJiraIssue,
  CreateJiraIssueInput,
  JiraClient,
  ScannedJiraIssue,
} from "./jira.client.ts";

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text?(): Promise<string>;
}

export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<FetchResponseLike>;

interface JiraSettings {
  siteUrl: string;
  projectKey: string;
  issueType: string;
  jql?: string;
  authorization: string;
}

/**
 * Jira Cloud REST client (API v3, ADF descriptions). Credentials come from the
 * tenant's JIRA integration: `config` carries siteUrl/projectKey/issueType/jql,
 * `secrets` carry the account email and API token.
 */
export class JiraApiClient implements JiraClient {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
    private readonly fetchFn: FetchLike = globalThis.fetch as unknown as FetchLike,
  ) {}

  async createIssue(input: CreateJiraIssueInput): Promise<CreatedJiraIssue> {
    const settings = await this.settings(input.tenantId);

    const data = (await this.request(
      `${settings.siteUrl}/rest/api/3/issue`,
      settings,
      {
        method: "POST",
        body: JSON.stringify({
          fields: {
            project: { key: settings.projectKey },
            issuetype: { name: settings.issueType },
            summary: input.summary,
            description: toAdf(input.description),
          },
        }),
      },
    )) as { key?: string };

    if (!data.key) {
      throw new Error("Jira did not return an issue key");
    }

    return {
      key: data.key,
      url: `${settings.siteUrl}/browse/${data.key}`,
      projectKey: settings.projectKey,
      issueType: settings.issueType,
    };
  }

  async scan(input: {
    tenantId: string;
    maxResults?: number;
  }): Promise<ScannedJiraIssue[]> {
    const settings = await this.settings(input.tenantId);
    const jql =
      settings.jql ??
      `project = "${settings.projectKey}" AND statusCategory != Done ORDER BY created DESC`;

    const data = (await this.request(
      `${settings.siteUrl}/rest/api/3/search/jql`,
      settings,
      {
        method: "POST",
        body: JSON.stringify({
          jql,
          maxResults: input.maxResults ?? 25,
          fields: ["summary", "description", "created", "status"],
        }),
      },
    )) as {
      issues?: {
        key?: string;
        fields?: {
          summary?: string;
          description?: unknown;
          created?: string;
        };
      }[];
    };

    return (data.issues ?? [])
      .filter(
        (issue): issue is { key: string; fields?: typeof issue.fields } =>
          typeof issue.key === "string",
      )
      .map((issue) => ({
        key: issue.key,
        summary: issue.fields?.summary ?? issue.key,
        description: adfToText(issue.fields?.description),
        url: `${settings.siteUrl}/browse/${issue.key}`,
        created: issue.fields?.created ?? null,
      }));
  }

  private async settings(tenantId: string): Promise<JiraSettings> {
    const integration = await this.prisma.withTenant(tenantId, (tx) =>
      tx.integration.findFirst({
        where: { tenantId, type: "JIRA", enabled: true },
      }),
    );

    if (!integration) {
      throw new Error("No Jira integration is connected for this workspace");
    }

    const config = (integration.config ?? {}) as {
      siteUrl?: string;
      projectKey?: string;
      issueType?: string;
      jql?: string;
    };

    if (!config.siteUrl || !config.projectKey) {
      throw new Error(
        "The Jira integration needs a site URL and a project key in its config",
      );
    }

    const secrets = this.integrations.getSecrets(integration);

    if (!secrets.email || !secrets.apiToken) {
      throw new Error("The Jira integration needs email and apiToken secrets");
    }

    return {
      siteUrl: config.siteUrl.replace(/\/+$/, ""),
      projectKey: config.projectKey,
      issueType: config.issueType ?? "Bug",
      ...(config.jql ? { jql: config.jql } : {}),
      authorization: `Basic ${Buffer.from(`${secrets.email}:${secrets.apiToken}`).toString("base64")}`,
    };
  }

  private async request(
    url: string,
    settings: JiraSettings,
    init: { method: string; body?: string },
  ): Promise<unknown> {
    const response = await this.fetchFn(url, {
      method: init.method,
      headers: {
        "content-type": "application/json",
        authorization: settings.authorization,
      },
      ...(init.body ? { body: init.body } : {}),
    });

    if (!response.ok) {
      const detail = response.text ? await response.text().catch(() => "") : "";

      throw new Error(
        `Jira API ${init.method} ${url} failed (${response.status}): ${detail.slice(0, 200)}`,
      );
    }

    return response.json();
  }
}

/** Minimal Atlassian Document Format for plain-text descriptions. */
export function toAdf(text: string): Record<string, unknown> {
  const paragraphs = text.split("\n").map((line) =>
    line.trim().length > 0
      ? {
          type: "paragraph",
          content: [{ type: "text", text: line }],
        }
      : { type: "paragraph", content: [] },
  );

  return { type: "doc", version: 1, content: paragraphs };
}

/** Best-effort ADF → plain text (scanned descriptions). */
export function adfToText(node: unknown): string {
  if (typeof node === "string") {
    return node;
  }

  if (Array.isArray(node)) {
    return node.map(adfToText).filter(Boolean).join("\n");
  }

  if (node && typeof node === "object") {
    const record = node as Record<string, unknown>;

    if (record.type === "text" && typeof record.text === "string") {
      return record.text;
    }

    if (Array.isArray(record.content)) {
      return record.content.map(adfToText).filter(Boolean).join("\n");
    }
  }

  return "";
}
