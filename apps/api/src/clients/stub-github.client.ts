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
  private counter = 100;

  async createPullRequest(
    input: CreatePullRequestInput,
  ): Promise<CreatedPullRequest> {
    this.counter += 1;
    const number = this.counter;
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
