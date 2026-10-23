"use client";

import { useActionState } from "react";

import type { RuleFormState } from "@/app/(dashboard)/rules/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { PROVIDER_LABELS, SOURCE_TYPES } from "@/lib/providers";

export function DetectionRuleForm({
  action,
}: {
  action: (
    previous: RuleFormState,
    formData: FormData,
  ) => Promise<RuleFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});

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

      <Field label="Rule name" htmlFor="detection-name">
        <Input id="detection-name" name="name" placeholder="Drop bot noise" />
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
          htmlFor="detection-signals"
          hint="Optional."
        >
          <Input
            id="detection-signals"
            name="minSignalCount"
            type="number"
            min={1}
            placeholder="1"
          />
        </Field>
        <Field
          label="Title contains"
          htmlFor="detection-title"
          hint="Optional."
        >
          <Input id="detection-title" name="titleContains" placeholder="spam" />
        </Field>
      </div>

      <Field label="Action" htmlFor="detection-action">
        <Select id="detection-action" name="action" defaultValue="IGNORE">
          <option value="IGNORE">Record as ignored</option>
          <option value="DETECT">Keep as a report</option>
        </Select>
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create rule"}
      </Button>
    </form>
  );
}
