import { Injectable, Logger } from "@nestjs/common";

import type {
  CreatedJiraIssue,
  CreateJiraIssueInput,
  JiraClient,
  ScannedJiraIssue,
} from "./jira.client.ts";

/**
 * Deterministic stand-in for the Jira API. Active unless JIRA_CLIENT_MODE=api
 * so dev and tests never hit a real Jira site by accident. `scan()` returns
 * one canned item so the backfill path is demonstrable end to end.
 */
@Injectable()
export class StubJiraClient implements JiraClient {
  private readonly logger = new Logger(StubJiraClient.name);

  async createIssue(_input: CreateJiraIssueInput): Promise<CreatedJiraIssue> {
    // Randomised: a counter resets with the process and would collide with
    // existing (tenant, key) rows in long-lived dev databases.
    const key = `ENG-${1000 + Math.floor(Math.random() * 900_000)}`;
    const url = `https://stub.atlassian.net/browse/${key}`;

    this.logger.warn(
      `stub Jira client active (JIRA_CLIENT_MODE != api) — pretending to create ${url}`,
    );

    return { key, url, projectKey: "ENG", issueType: "Bug" };
  }

  async scan(): Promise<ScannedJiraIssue[]> {
    this.logger.warn(
      "stub Jira client active — returning one canned scanned issue",
    );

    return [
      {
        key: "STUB-1",
        summary: "Stub-scanned Jira issue (imported by the stub client)",
        description:
          "This item exists to demonstrate the Jira scan backfill. Configure the real client with JIRA_CLIENT_MODE=api.",
        url: "https://stub.atlassian.net/browse/STUB-1",
        created: new Date().toISOString(),
      },
    ];
  }
}
