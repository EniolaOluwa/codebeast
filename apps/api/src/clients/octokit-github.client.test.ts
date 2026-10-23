import { describe, expect, it, vi } from "vitest";

import { OctokitGitHubClient } from "./octokit-github.client.ts";

interface RecordedRequest {
  route: string;
  params?: Record<string, unknown>;
}

function makeClient(
  options: {
    installation?: number | null;
    baseSha?: string;
    prNumber?: number;
  } = {},
) {
  const installation =
    options.installation === undefined ? 77 : options.installation;
  const requests: RecordedRequest[] = [];

  const octokit = {
    async request(route: string, params?: Record<string, unknown>) {
      requests.push({ route, params });

      if (route === "GET /repos/{owner}/{repo}/git/ref/{ref}") {
        return { data: { object: { sha: options.baseSha ?? "base-sha" } } };
      }

      if (route === "GET /repos/{owner}/{repo}/contents/{path}") {
        throw new Error("Not Found");
      }

      if (route === "POST /repos/{owner}/{repo}/pulls") {
        return {
          data: {
            number: options.prNumber ?? 7,
            html_url: "https://github.com/acme/web/pull/7",
          },
        };
      }

      return { data: {} };
    },
  };

  const prisma = {
    withTenant: vi.fn(async (_tenantId: string, fn: (tx: unknown) => unknown) =>
      fn({
        gitHubInstallation: {
          findUnique: async () =>
            installation === null ? null : { installationId: installation },
        },
      }),
    ),
  };

  const client = new OctokitGitHubClient(
    prisma as never,
    "12345",
    "private-key-pem",
    {
      appAuthFactory: () => async () => ({ token: "installation-token" }),
      createOctokit: () => octokit,
    },
  );

  return { client, requests };
}

describe("OctokitGitHubClient", () => {
  it("creates a branch, commits files and opens a non-draft PR", async () => {
    const { client, requests } = makeClient();

    const created = await client.createPullRequest({
      tenantId: "tenant_1",
      repository: { fullName: "acme/web", defaultBranch: "main" },
      headBranch: "codebeast/fix-abc123",
      title: "fix: export",
      body: "## Summary\nfix",
      files: [{ path: "src/export.ts", content: "// fixed\n" }],
    });

    expect(created).toEqual({
      number: 7,
      url: "https://github.com/acme/web/pull/7",
      headBranch: "codebeast/fix-abc123",
      baseBranch: "main",
    });

    const routes = requests.map((request) => request.route);
    expect(routes).toEqual([
      "GET /repos/{owner}/{repo}/git/ref/{ref}",
      "POST /repos/{owner}/{repo}/git/refs",
      "GET /repos/{owner}/{repo}/contents/{path}",
      "PUT /repos/{owner}/{repo}/contents/{path}",
      "POST /repos/{owner}/{repo}/pulls",
    ]);

    const refCreate = requests[1]!;
    expect(refCreate.params).toMatchObject({
      owner: "acme",
      repo: "web",
      ref: "refs/heads/codebeast/fix-abc123",
      sha: "base-sha",
    });

    const fileCommit = requests[3]!;
    expect(fileCommit.params).toMatchObject({
      path: "src/export.ts",
      branch: "codebeast/fix-abc123",
      content: Buffer.from("// fixed\n", "utf8").toString("base64"),
      message: "fix: export",
    });
    expect(fileCommit.params).not.toHaveProperty("sha");

    const prCreate = requests[4]!;
    expect(prCreate.params).toMatchObject({
      title: "fix: export",
      body: "## Summary\nfix",
      head: "codebeast/fix-abc123",
      base: "main",
      draft: false,
    });
  });

  it("refuses to run without an installation", async () => {
    const { client } = makeClient({ installation: null });

    await expect(
      client.createPullRequest({
        tenantId: "tenant_1",
        repository: { fullName: "acme/web", defaultBranch: "main" },
        headBranch: "codebeast/fix-abc123",
        title: "fix",
        body: "body",
        files: [],
      }),
    ).rejects.toThrow(/installation/i);
  });

  it("rejects malformed repository names", async () => {
    const { client } = makeClient();

    await expect(
      client.createPullRequest({
        tenantId: "tenant_1",
        repository: { fullName: "not-a-repo", defaultBranch: "main" },
        headBranch: "b",
        title: "t",
        body: "",
        files: [],
      }),
    ).rejects.toThrow(/Invalid repository/);
  });
});
