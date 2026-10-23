import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";

import { PrismaService } from "../prisma/prisma.service.ts";
import type {
  CreatedPullRequest,
  CreatePullRequestInput,
  GitHubClient,
} from "./github.client.ts";

/** Minimal Octokit surface used here — injectable for tests. */
export interface OctokitLike {
  request(
    route: string,
    params?: Record<string, unknown>,
  ): Promise<{ data: unknown }>;
}

export type OctokitFactory = (token: string) => OctokitLike;

export type AppAuthFactory = (options: {
  appId: string;
  privateKey: string;
  installationId: number;
}) => (authOptions: { type: "installation" }) => Promise<{ token: string }>;

interface RequestOverrides {
  appAuthFactory?: AppAuthFactory;
  createOctokit?: OctokitFactory;
}

/**
 * Real GitHub App client (ADR-005): exchanges an installation token, creates
 * the branch from the base ref, upserts the changed files and opens a PR
 * **ready for review** (never a draft — design.md §7).
 */
export class OctokitGitHubClient implements GitHubClient {
  private readonly appAuthFactory: AppAuthFactory;
  private readonly createOctokit: OctokitFactory;

  constructor(
    private readonly prisma: PrismaService,
    private readonly appId: string,
    private readonly privateKey: string,
    overrides: RequestOverrides = {},
  ) {
    this.appAuthFactory =
      overrides.appAuthFactory ?? (createAppAuth as unknown as AppAuthFactory);
    this.createOctokit =
      overrides.createOctokit ??
      ((token) => new Octokit({ auth: token }) as unknown as OctokitLike);
  }

  async createPullRequest(
    input: CreatePullRequestInput,
  ): Promise<CreatedPullRequest> {
    const [owner, repo] = input.repository.fullName.split("/");

    if (!owner || !repo) {
      throw new Error(
        `Invalid repository full name: ${input.repository.fullName}`,
      );
    }

    const installation = await this.prisma.withTenant(
      input.tenantId,
      async (tx) =>
        tx.gitHubInstallation.findUnique({
          where: { tenantId: input.tenantId },
          select: { installationId: true },
        }),
    );

    if (!installation) {
      throw new Error(
        "No GitHub App installation for this tenant — connect GitHub first",
      );
    }

    const auth = this.appAuthFactory({
      appId: this.appId,
      privateKey: this.privateKey,
      installationId: installation.installationId,
    });
    const { token } = await auth({ type: "installation" });
    const octokit = this.createOctokit(token);

    const base = input.repository.defaultBranch;
    const baseRef = await octokit.request(
      "GET /repos/{owner}/{repo}/git/ref/{ref}",
      { owner, repo, ref: `heads/${base}` },
    );
    const baseSha = (baseRef.data as { object: { sha: string } }).object.sha;

    try {
      await octokit.request("POST /repos/{owner}/{repo}/git/refs", {
        owner,
        repo,
        ref: `refs/heads/${input.headBranch}`,
        sha: baseSha,
      });
    } catch {
      // Branch already exists (a retried ship) — reuse it.
    }

    for (const file of input.files) {
      let sha: string | undefined;

      try {
        const existing = await octokit.request(
          "GET /repos/{owner}/{repo}/contents/{path}",
          { owner, repo, path: file.path, ref: input.headBranch },
        );
        sha = (existing.data as { sha?: string }).sha;
      } catch {
        sha = undefined;
      }

      await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
        owner,
        repo,
        path: file.path,
        message: input.title,
        content: Buffer.from(file.content, "utf8").toString("base64"),
        branch: input.headBranch,
        ...(sha ? { sha } : {}),
      });
    }

    const pullRequest = await octokit.request(
      "POST /repos/{owner}/{repo}/pulls",
      {
        owner,
        repo,
        title: input.title,
        body: input.body,
        head: input.headBranch,
        base,
        draft: false,
      },
    );

    const data = pullRequest.data as { number: number; html_url: string };

    return {
      number: data.number,
      url: data.html_url,
      headBranch: input.headBranch,
      baseBranch: base,
    };
  }
}
