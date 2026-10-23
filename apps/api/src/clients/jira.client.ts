/**
 * Jira destination plus backfill source (M5.5). The client resolves the
 * tenant's Jira integration itself (config + secrets), so callers never touch
 * credentials.
 */

export interface CreateJiraIssueInput {
  tenantId: string;
  summary: string;
  description: string;
}

export interface CreatedJiraIssue {
  key: string;
  url: string;
  projectKey: string;
  issueType: string;
}

export interface ScannedJiraIssue {
  key: string;
  summary: string;
  description: string;
  url: string;
  created: string | null;
}

export interface JiraClient {
  createIssue(input: CreateJiraIssueInput): Promise<CreatedJiraIssue>;

  /** Existing items matching the integration's JQL — the "scan" backfill. */
  scan(input: {
    tenantId: string;
    maxResults?: number;
  }): Promise<ScannedJiraIssue[]>;
}

export const JIRA_CLIENT = Symbol("JIRA_CLIENT");
