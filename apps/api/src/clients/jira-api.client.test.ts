import { describe, expect, it } from "vitest";

import {
  adfToText,
  type FetchLike,
  type FetchResponseLike,
  JiraApiClient,
  toAdf,
} from "./jira-api.client.ts";

interface RecordedCall {
  url: string;
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  };
}

function makeClient(
  options: {
    integrationMissing?: boolean;
    credentialsMissing?: boolean;
    config?: Record<string, unknown>;
    responses?: { status?: number; body: unknown }[];
  } = {},
) {
  const calls: RecordedCall[] = [];
  const queued = [...(options.responses ?? [])];

  const fetchFn: FetchLike = async (url, init) => {
    calls.push({ url, ...(init ? { init } : {}) });
    const next = queued.shift() ?? { status: 200, body: {} };
    const status = next.status ?? 200;

    const response: FetchResponseLike = {
      ok: status < 400,
      status,
      json: async () => next.body,
      text: async () => JSON.stringify(next.body),
    };

    return response;
  };

  const integration = options.integrationMissing
    ? null
    : {
        id: "integration_1",
        config: options.config ?? {
          siteUrl: "https://acme.atlassian.net",
          projectKey: "ENG",
          issueType: "Bug",
          jql: "project = ENG ORDER BY created DESC",
        },
        secrets: "encrypted",
      };

  const prisma = {
    withTenant: async (_tenantId: string, fn: (tx: unknown) => unknown) =>
      fn({
        integration: { findFirst: async () => integration },
      }),
  };

  const integrations = {
    getSecrets: (): Record<string, string> =>
      options.credentialsMissing
        ? {}
        : { email: "bot@acme.co", apiToken: "jira-token" },
  };

  return {
    client: new JiraApiClient(prisma as never, integrations as never, fetchFn),
    calls,
  };
}

describe("JiraApiClient.createIssue", () => {
  it("posts an ADF description with basic auth and returns the key", async () => {
    const { client, calls } = makeClient({
      responses: [{ body: { key: "ENG-5" } }],
    });

    const created = await client.createIssue({
      tenantId: "tenant_1",
      summary: "Export broken",
      description: "Line one\nLine two",
    });

    expect(created).toEqual({
      key: "ENG-5",
      url: "https://acme.atlassian.net/browse/ENG-5",
      projectKey: "ENG",
      issueType: "Bug",
    });

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe("https://acme.atlassian.net/rest/api/3/issue");
    expect(call.init?.method).toBe("POST");
    expect(call.init?.headers?.authorization).toBe(
      `Basic ${Buffer.from("bot@acme.co:jira-token").toString("base64")}`,
    );

    const body = JSON.parse(call.init!.body!) as {
      fields: {
        project: { key: string };
        issuetype: { name: string };
        summary: string;
        description: { type: string; content: unknown[] };
      };
    };
    expect(body.fields.project).toEqual({ key: "ENG" });
    expect(body.fields.issuetype).toEqual({ name: "Bug" });
    expect(body.fields.summary).toBe("Export broken");
    expect(body.fields.description.type).toBe("doc");
    expect(body.fields.description.content).toHaveLength(2);
  });

  it("fails loudly without an integration, config or credentials", async () => {
    await expect(
      makeClient({ integrationMissing: true }).client.createIssue({
        tenantId: "tenant_1",
        summary: "x",
        description: "y",
      }),
    ).rejects.toThrow(/No Jira integration/);

    await expect(
      makeClient({
        config: { siteUrl: "https://acme.atlassian.net" },
      }).client.createIssue({
        tenantId: "tenant_1",
        summary: "x",
        description: "y",
      }),
    ).rejects.toThrow(/project key/);

    await expect(
      makeClient({ credentialsMissing: true }).client.createIssue({
        tenantId: "tenant_1",
        summary: "x",
        description: "y",
      }),
    ).rejects.toThrow(/email and apiToken/);
  });

  it("surfaces Jira API errors with the status", async () => {
    const { client } = makeClient({
      responses: [{ status: 400, body: { errorMessages: ["bad field"] } }],
    });

    await expect(
      client.createIssue({
        tenantId: "tenant_1",
        summary: "x",
        description: "y",
      }),
    ).rejects.toThrow(/failed \(400\)/);
  });
});

describe("JiraApiClient.scan", () => {
  it("searches with the configured JQL and maps results to plain text", async () => {
    const { client, calls } = makeClient({
      responses: [
        {
          body: {
            issues: [
              {
                key: "ENG-1",
                fields: {
                  summary: "Old bug",
                  description: {
                    type: "doc",
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: "Steps to reproduce" }],
                      },
                    ],
                  },
                  created: "2026-10-01T10:00:00.000Z",
                },
              },
              { fields: { summary: "missing key is skipped" } },
            ],
          },
        },
      ],
    });

    const scanned = await client.scan({ tenantId: "tenant_1" });

    expect(scanned).toEqual([
      {
        key: "ENG-1",
        summary: "Old bug",
        description: "Steps to reproduce",
        url: "https://acme.atlassian.net/browse/ENG-1",
        created: "2026-10-01T10:00:00.000Z",
      },
    ]);

    const call = calls[0]!;
    expect(call.url).toBe("https://acme.atlassian.net/rest/api/3/search/jql");
    const body = JSON.parse(call.init!.body!) as {
      jql: string;
      maxResults: number;
    };
    expect(body.jql).toBe("project = ENG ORDER BY created DESC");
    expect(body.maxResults).toBe(25);
  });

  it("falls back to an open-project JQL when none is configured", async () => {
    const { client, calls } = makeClient({
      config: {
        siteUrl: "https://acme.atlassian.net",
        projectKey: "ENG",
      },
      responses: [{ body: { issues: [] } }],
    });

    await client.scan({ tenantId: "tenant_1" });

    const body = JSON.parse(calls[0]!.init!.body!) as { jql: string };
    expect(body.jql).toContain('project = "ENG"');
    expect(body.jql).toContain("statusCategory != Done");
  });
});

describe("ADF helpers", () => {
  it("renders plain text to paragraphs and back", () => {
    const adf = toAdf("line one\nline two");

    expect(adfToText(adf)).toBe("line one\nline two");
  });

  it("tolerates strings and nested documents", () => {
    expect(adfToText("plain")).toBe("plain");
    expect(adfToText(null)).toBe("");
    expect(
      adfToText({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "hello" },
              { type: "text", text: "world" },
            ],
          },
        ],
      }),
    ).toBe("hello\nworld");
  });
});
