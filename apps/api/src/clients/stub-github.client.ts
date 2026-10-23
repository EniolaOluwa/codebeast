import { Injectable, Logger } from "@nestjs/common";

import type {
  CreatedPullRequest,
  CreatePullRequestInput,
  GitHubClient,
} from "./github.client.ts";

/**
 * Deterministic stand-in used whenever no GitHub App is configured (dev,
 * tests). It never touches the network and returns a plausible reference so
 * the ship flow can be exercised end to end.
 */
@Injectable()
export class StubGitHubClient implements GitHubClient {
  private readonly logger = new Logger(StubGitHubClient.name);

  async createPullRequest(
    input: CreatePullRequestInput,
  ): Promise<CreatedPullRequest> {
    // Randomised: a counter resets with the process and would collide with
    // existing (repository, number) rows in long-lived dev databases.
    const number = 1000 + Math.floor(Math.random() * 900_000);
    const url = `https://github.com/${input.repository.fullName}/pull/${number}`;

    this.logger.warn(
      `stub GitHub client active (no GITHUB_APP_ID configured) — pretending to open ${url}`,
    );

    return {
      number,
      url,
      headBranch: input.headBranch,
      baseBranch: input.repository.defaultBranch,
    };
  }
}
