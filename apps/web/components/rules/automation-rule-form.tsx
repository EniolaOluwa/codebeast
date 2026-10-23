"use client";

import { useActionState, useState } from "react";

import type { RuleFormState } from "@/app/(dashboard)/rules/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { PROVIDER_LABELS, SOURCE_TYPES } from "@/lib/providers";

export function AutomationRuleForm({
  action,
  repositories,
}: {
  action: (
    previous: RuleFormState,
    formData: FormData,
  ) => Promise<RuleFormState>;
  repositories: { id: string; fullName: string }[];
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [openPr, setOpenPr] = useState(false);

  return (
    <form action={formAction} className="grid gap-4">
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-[13px] text-danger-fg"
        >
          {state.error}
        </p>
      ) : null}

      {state.ok ? (
        <p className="rounded-md border border-success-border bg-success-bg px-3 py-2 text-[13px] text-success-fg">
          Rule created — enable it when you are ready.
        </p>
      ) : null}

      <Field label="Rule name" htmlFor="automation-name">
        <Input
          id="automation-name"
          name="name"
          placeholder="Ship small fixes"
        />
      </Field>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">
          Sources (none selected = any)
        </legend>
        <div className="flex flex-wrap gap-3">
          {SOURCE_TYPES.map((provider) => (
            <label key={provider} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="providers" value={provider} />
              {PROVIDER_LABELS[provider]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Minimum signals"
          htmlFor="automation-signals"
          hint="Optional."
        >
          <Input
            id="automation-signals"
            name="minSignalCount"
            type="number"
            min={1}
            placeholder="1"
          />
        </Field>
        <Field
          label="Title contains"
          htmlFor="automation-title"
          hint="Optional."
        >
          <Input id="automation-title" name="titleContains" />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="createTicket" defaultChecked />
        Create a Jira ticket when a report is ready
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="openPr"
          checked={openPr}
          onChange={(event) => setOpenPr(event.target.checked)}
        />
        Open a pull request when a report is ready
      </label>

      {openPr ? (
        <div className="grid gap-4 rounded-md border border-border bg-surface-muted p-4">
          <Field label="Repository" htmlFor="automation-repo">
            <Select id="automation-repo" name="repositoryId" required>
              <option value="">Pick a repository…</option>
              {repositories.map((repository) => (
                <option key={repository.id} value={repository.id}>
                  {repository.fullName}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Minimum confidence"
              htmlFor="automation-confidence"
              hint="0–1, default 0.7."
            >
              <Input
                id="automation-confidence"
                name="minConfidence"
                type="number"
                min={0}
                max={1}
                step={0.05}
                defaultValue={0.7}
                required
              />
            </Field>
            <Field
              label="Daily PR limit"
              htmlFor="automation-limit"
              hint="Default 5."
            >
              <Input
                id="automation-limit"
                name="dailyPrLimit"
                type="number"
                min={1}
                max={100}
                defaultValue={5}
                required
              />
            </Field>
          </div>
          <label className="flex items-start gap-2 text-[13px] text-foreground-muted">
            <input type="checkbox" name="confirmOpenPr" className="mt-0.5" />
            This rule will open PRs that are ready for review and notify your
            reviewers.
          </label>
        </div>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create rule"}
      </Button>
    </form>
  );
}
