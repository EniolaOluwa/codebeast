import { createSign } from "node:crypto";

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { ExternalServiceError } from "../common/errors/errors.ts";

const API_BASE = "https://api.github.com";

export interface GitHubFileChange {
  path: string;
  newContent: string;
}

export interface CreatePullRequestInput {
  fullName: string;
  installationId: string | null;
  baseBranch: string;
  branch: string;
  title: string;
  body: string;
  commitMessage: string;
  changes: GitHubFileChange[];
}

export interface CreatedPullRequest {
  number: number;
  url: string;
  branch: string;
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/**
 * GitHub App client. Exchanges an installation token and opens a PR through the
 * Git data API (blobs → tree → commit → ref → pull). No octokit dependency.
 */
@Injectable()
export class GithubClient {
  private readonly logger = new Logger(GithubClient.name);
  private readonly appId: string | null;
  private readonly privateKey: string | null;

  constructor(config: ConfigService) {
    this.appId = config.get<string>("GITHUB_APP_ID") ?? null;
    const rawKey = config.get<string>("GITHUB_APP_PRIVATE_KEY");
    this.privateKey = rawKey ? rawKey.replace(/\\n/g, "\n") : null;
  }

  isConfigured(): boolean {
    return Boolean(this.appId && this.privateKey);
  }

  async createPullRequest(
    input: CreatePullRequestInput,
  ): Promise<CreatedPullRequest> {
    if (!this.isConfigured() || !this.appId || !this.privateKey) {
      throw new ExternalServiceError(
        "github",
        "GitHub App credentials are not configured",
      );
    }
    if (!input.installationId) {
      throw new ExternalServiceError(
        "github",
        "Repository has no installation",
      );
    }

    const [owner, repo] = input.fullName.split("/");
    if (!owner || !repo) {
      throw new ExternalServiceError(
        "github",
        `Invalid repo ${input.fullName}`,
      );
    }

    const token = await this.installationToken(input.installationId);
    const repoPath = `/repos/${owner}/${repo}`;

    const blobs = await Promise.all(
      input.changes.map(async (change) => {
        const blob = await this.request<{ sha: string }>(
          `${repoPath}/git/blobs`,
          token,
          {
            method: "POST",
            body: JSON.stringify({
              content: Buffer.from(change.newContent, "utf8").toString(
                "base64",
              ),
              encoding: "base64",
            }),
          },
        );
        return { path: change.path, sha: blob.sha };
      }),
    );

    const baseRef = await this.request<{ object: { sha: string } }>(
      `${repoPath}/git/ref/heads/${input.baseBranch}`,
      token,
    );
    const baseSha = baseRef.object.sha;

    const baseCommit = await this.request<{ tree: { sha: string } }>(
      `${repoPath}/git/commits/${baseSha}`,
      token,
    );

    const tree = await this.request<{ sha: string }>(
      `${repoPath}/git/trees`,
      token,
      {
        method: "POST",
        body: JSON.stringify({
          base_tree: baseCommit.tree.sha,
          tree: blobs.map((blob) => ({
            path: blob.path,
            mode: "100644",
            type: "blob",
            sha: blob.sha,
          })),
        }),
      },
    );

    const commit = await this.request<{ sha: string }>(
      `${repoPath}/git/commits`,
      token,
      {
        method: "POST",
        body: JSON.stringify({
          message: input.commitMessage,
          tree: tree.sha,
          parents: [baseSha],
        }),
      },
    );

    await this.request(`${repoPath}/git/refs`, token, {
      method: "POST",
      body: JSON.stringify({
        ref: `refs/heads/${input.branch}`,
        sha: commit.sha,
      }),
    });

    const pull = await this.request<{ number: number; html_url: string }>(
      `${repoPath}/pulls`,
      token,
      {
        method: "POST",
        body: JSON.stringify({
          title: input.title,
          body: input.body,
          head: input.branch,
          base: input.baseBranch,
          draft: true,
        }),
      },
    );

    this.logger.log(`Opened PR #${pull.number} on ${input.fullName}`);
    return { number: pull.number, url: pull.html_url, branch: input.branch };
  }

  private async installationToken(installationId: string): Promise<string> {
    const jwt = this.appJwt();
    const result = await this.request<{ token: string }>(
      `/app/installations/${installationId}/access_tokens`,
      jwt,
      { method: "POST" },
    );
    return result.token;
  }

  private appJwt(): string {
    if (!this.appId || !this.privateKey) {
      throw new ExternalServiceError("github", "GitHub App not configured");
    }
    const now = Math.floor(Date.now() / 1000);
    const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = base64Url(
      JSON.stringify({ iat: now - 60, exp: now + 540, iss: this.appId }),
    );
    const data = `${header}.${payload}`;
    const signer = createSign("RSA-SHA256");
    signer.update(data);
    signer.end();
    const signature = signer.sign(this.privateKey).toString("base64url");
    return `${data}.${signature}`;
  }

  private async request<T = unknown>(
    path: string,
    token: string,
    init?: RequestInit,
  ): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "x-github-api-version": "2022-11-28",
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new ExternalServiceError(
        "github",
        `${path} responded ${response.status}: ${text.slice(0, 500)}`,
      );
    }

    return (await response.json()) as T;
  }
}
