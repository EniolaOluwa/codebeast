import {
  IssueSeveritySchema,
  IssueStatusSchema,
  paginatedResponseSchema,
  PullRequestStatusSchema,
  RepositoryProviderSchema,
  RunStageSchema,
  RunStatusSchema,
  SignalKindSchema,
  ValidationStatusSchema,
} from "@repo/types";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const ListRunsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
export class ListRunsQueryDto extends createZodDto(ListRunsQuerySchema) {}

export const ListIssuesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: IssueStatusSchema.optional(),
  repositoryId: z.string().optional(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
});
export class ListIssuesQueryDto extends createZodDto(ListIssuesQuerySchema) {}

export const RunStatusFilterSchema = RunStatusSchema.optional();

export interface RunView {
  id: string;
  issueId: string;
  status: string;
  stage: string;
  attempt: number;
  model: string | null;
  confidence: number | null;
  error: string | null;
  replanned: boolean;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlanView {
  id: string;
  rootCause: string;
  filesToInspect: string[];
  changeStrategy: string;
  testsToRun: string[];
  confidence: number;
  needsMoreContext: boolean;
  missingContext: string[];
}

export interface FileChangeView {
  path: string;
  oldContent: string;
  newContent: string;
}

export interface PatchView {
  id: string;
  commitMessage: string;
  rationale: string;
  filesChanged: string[];
  changes: FileChangeView[];
}

export interface ValidationView {
  id: string;
  status: string;
  lintPassed: boolean;
  typecheckPassed: boolean;
  testsPassed: boolean;
  sandboxRunId: string | null;
  output: string | null;
  durationMs: number | null;
  createdAt: Date;
}

export interface PullRequestView {
  id: string;
  provider: string;
  externalNumber: number | null;
  url: string | null;
  branch: string;
  baseBranch: string;
  status: string;
  title: string | null;
  createdAt: Date;
}

const dateTime = z.iso.datetime();

export const RepositoryModelSchema = z.object({
  id: z.string(),
  tenantId: z.uuid(),
  provider: RepositoryProviderSchema,
  externalId: z.string(),
  fullName: z.string(),
  defaultBranch: z.string(),
  installationId: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: dateTime,
  updatedAt: dateTime,
});

export const IssueModelSchema = z.object({
  id: z.string(),
  tenantId: z.uuid(),
  repositoryId: z.string().nullable(),
  title: z.string(),
  summary: z.string().nullable(),
  status: IssueStatusSchema,
  severity: IssueSeveritySchema,
  correlationScore: z.number(),
  primarySignal: SignalKindSchema.nullable(),
  sentryIssueId: z.string().nullable(),
  jiraKey: z.string().nullable(),
  firstSeenAt: dateTime,
  lastSeenAt: dateTime,
  resolvedAt: dateTime.nullable(),
  createdAt: dateTime,
  updatedAt: dateTime,
});

export const IssueViewSchema = IssueModelSchema.extend({
  repository: RepositoryModelSchema.nullable(),
});
export class IssueViewDto extends createZodDto(IssueViewSchema) {}

export const IssueListResponseSchema = paginatedResponseSchema(IssueViewSchema);
export class IssueListResponseDto extends createZodDto(
  IssueListResponseSchema,
) {}

export const RunModelSchema = z.object({
  id: z.string(),
  tenantId: z.uuid(),
  issueId: z.string(),
  status: RunStatusSchema,
  stage: RunStageSchema,
  attempt: z.number().int(),
  model: z.string().nullable(),
  confidence: z.number().nullable(),
  error: z.string().nullable(),
  replanned: z.boolean(),
  startedAt: dateTime.nullable(),
  finishedAt: dateTime.nullable(),
  createdAt: dateTime,
  updatedAt: dateTime,
});
export class RunViewDto extends createZodDto(RunModelSchema) {}

export const RunListResponseSchema = paginatedResponseSchema(RunModelSchema);
export class RunListResponseDto extends createZodDto(RunListResponseSchema) {}

export const IssueSignalModelSchema = z.object({
  id: z.string(),
  tenantId: z.uuid(),
  issueId: z.string(),
  kind: SignalKindSchema,
  externalId: z.string(),
  source: z.string(),
  title: z.string().nullable(),
  body: z.string().nullable(),
  url: z.string().nullable(),
  metadata: z.unknown(),
  occurredAt: dateTime,
  createdAt: dateTime,
});

export const PlanModelSchema = z.object({
  id: z.string(),
  tenantId: z.uuid(),
  runId: z.string(),
  rootCause: z.string(),
  filesToInspect: z.array(z.string()),
  changeStrategy: z.string(),
  testsToRun: z.array(z.string()),
  confidence: z.number(),
  needsMoreContext: z.boolean(),
  missingContext: z.array(z.string()),
  raw: z.unknown(),
  createdAt: dateTime,
});

export const FileChangeModelSchema = z.object({
  id: z.string(),
  tenantId: z.uuid(),
  patchId: z.string(),
  path: z.string(),
  oldContent: z.string(),
  newContent: z.string(),
});

export const PatchModelSchema = z.object({
  id: z.string(),
  tenantId: z.uuid(),
  runId: z.string(),
  commitMessage: z.string(),
  rationale: z.string(),
  filesChanged: z.array(z.string()),
  raw: z.unknown(),
  createdAt: dateTime,
});

export const PatchDetailSchema = PatchModelSchema.extend({
  fileChanges: z.array(FileChangeModelSchema),
});

export const ValidationRunModelSchema = z.object({
  id: z.string(),
  tenantId: z.uuid(),
  runId: z.string(),
  status: ValidationStatusSchema,
  testsToRun: z.array(z.string()),
  lintPassed: z.boolean(),
  typecheckPassed: z.boolean(),
  testsPassed: z.boolean(),
  sandboxRunId: z.string().nullable(),
  output: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  createdAt: dateTime,
});

export const PullRequestModelSchema = z.object({
  id: z.string(),
  tenantId: z.uuid(),
  issueId: z.string(),
  repositoryId: z.string(),
  runId: z.string(),
  provider: RepositoryProviderSchema,
  externalNumber: z.number().int().nullable(),
  url: z.string().nullable(),
  branch: z.string(),
  baseBranch: z.string(),
  status: PullRequestStatusSchema,
  title: z.string().nullable(),
  body: z.string().nullable(),
  createdAt: dateTime,
  updatedAt: dateTime,
});

export const IssueDetailSchema = IssueModelSchema.extend({
  repository: RepositoryModelSchema.nullable(),
  signals: z.array(IssueSignalModelSchema),
  runs: z.array(RunModelSchema),
  pullRequests: z.array(PullRequestModelSchema),
});
export class IssueDetailDto extends createZodDto(IssueDetailSchema) {}

export const RunDetailSchema = RunModelSchema.extend({
  plan: PlanModelSchema.nullable(),
  patch: PatchDetailSchema.nullable(),
  validationRuns: z.array(ValidationRunModelSchema),
  pullRequest: PullRequestModelSchema.nullable(),
});
export class RunDetailDto extends createZodDto(RunDetailSchema) {}

export const StartRunResponseSchema = z.object({ runId: z.string() });
export class StartRunResponseDto extends createZodDto(StartRunResponseSchema) {}

export const IssueStatusResponseSchema = z.object({
  status: z.enum(["IGNORED", "RESOLVED"]),
});
export class IssueStatusResponseDto extends createZodDto(
  IssueStatusResponseSchema,
) {}

export const PullRequestWithIssueSchema = PullRequestModelSchema.extend({
  issue: z.object({ id: z.string(), title: z.string() }),
});
export const PullRequestListResponseSchema = paginatedResponseSchema(
  PullRequestWithIssueSchema,
);
export class PullRequestListResponseDto extends createZodDto(
  PullRequestListResponseSchema,
) {}
