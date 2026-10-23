-- Compute/ship split (design.md principle 3): a run that validates
-- successfully leaves the issue READY, awaiting a human (or rule) to create
-- the Jira ticket / open the PR.
ALTER TYPE "IssueStatus" ADD VALUE IF NOT EXISTS 'READY';
