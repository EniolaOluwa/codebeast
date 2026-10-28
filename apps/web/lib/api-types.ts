import type {
  Integration,
  IssueStatus,
  MembershipRole,
  Provider,
  PullRequestStatus,
  RunStatus,
  User,
} from "@repo/types";

/** Server-side mirrors of the control-plane response shapes we consume. */

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  success: true;
  data: T[];
  pagination: PaginationMeta;
}

export interface Me {
  user: User;
  tenantId: string;
  role: MembershipRole;
}

export interface TicketView {
  id: string;
  key: string;
  url: string;
  projectKey: string;
  issueType: string;
  summary: string;
  createdAt: string;
}

export interface IssueView {
  id: string;
  title: string;
  status: IssueStatus;
  correlationKey: string;
  signalCount: number;
  providers: Provider[];
  repository: { fullName: string; defaultBranch: string } | null;
  ticket: TicketView | null;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
}

export interface IssueSignalView {
  id: string;
  provider: Provider;
  eventType: string;
  title: string;
  body: string;
  url: string | null;
  actor: string | null;
  occurredAt: string;
}

export interface IssueDetailView extends IssueView {
  summary: string;
  signals: IssueSignalView[];
}

export interface RunView {
  id: string;
  issueId: string;
  status: RunStatus;
  attempt: number;
  replans: number;
  rootCause: string | null;
  confidence: number | null;
  lastError: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface RunPlanView {
  id: string;
  attempt: number;
  rootCause: string;
  filesToInspect: string[];
  changeStrategy: string;
  testsToRun: string[];
  confidence: number;
  needsMoreContext: boolean;
  missingContext: string[];
  createdAt: string;
}

export interface RunPatchView {
  id: string;
  attempt: number;
  commitMessage: string;
  rationale: string;
  status: string;
  fileChanges: {
    path: string;
    oldContent: string;
    newContent: string;
  }[];
  createdAt: string;
}

export interface RunValidationView {
  id: string;
  attempt: number;
  status: "PASSED" | "FAILED" | "ERRORED";
  testsRun: string[];
  lintPassed: boolean | null;
  typesPassed: boolean | null;
  output: string | null;
  durationMs: number | null;
  createdAt: string;
}

export interface PullRequestView {
  id: string;
  number: number;
  url: string;
  title: string;
  headBranch: string;
  baseBranch: string;
  status: PullRequestStatus;
  createdAt: string;
}

export interface RunDetailView extends RunView {
  plans: RunPlanView[];
  patches: RunPatchView[];
  validations: RunValidationView[];
  pullRequest: PullRequestView | null;
}

export interface OverviewSourceView {
  integrationId: string;
  type: Provider;
  name: string;
  enabled: boolean;
  lastSeenAt: string | null;
  healthy: boolean;
}

export interface OverviewView {
  windowDays: number;
  reportsFound: number;
  ticketsCreated: number;
  prsOpened: number;
  prsMerged: number;
  needsReview: IssueView[];
  sources: OverviewSourceView[];
}

export interface MemberView {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  role: MembershipRole;
  createdAt: string;
}

export interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  key?: string;
}

export type IntegrationView = Integration;

export interface AuditLogView {
  id: string;
  tenantId: string;
  actorType: "USER" | "API_KEY" | "SYSTEM";
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}
