-- The validator needs the agent's test hints; patches carry them forward.
ALTER TABLE "Patch"
  ADD COLUMN "testsToRun" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
