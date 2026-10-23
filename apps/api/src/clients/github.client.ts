/**
 * The only seam between the API and GitHub (ADR-005). Phase 5 ships the stub
 * and the real Octokit implementation; the stub is used until a GitHub App is
 * registered (env-gated in `RunsModule`).
 */

export interface GitHubRepositoryRef {
  fullName: string;
  defaultBranch: string;
}

export interface GitHubFileChange {
  path: string;
  content: string;
}

export interface CreatePullRequestInput {
  tenantId: string;
  repository: GitHubRepositoryRef;
  headBranch: string;
  title: string;
  body: string;
  files: GitHubFileChange[];
}

export interface CreatedPullRequest {
  number: number;
  url: string;
  headBranch: string;
  baseBranch: string;
}

export interface GitHubClient {
  createPullRequest(input: CreatePullRequestInput): Promise<CreatedPullRequest>;
}

export const GITHUB_CLIENT = Symbol("GITHUB_CLIENT");
