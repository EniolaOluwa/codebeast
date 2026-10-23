"use client";

import { useActionState } from "react";

import type { ApiKeyFormState } from "@/app/(dashboard)/settings/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

const SCOPES = [
  "issues:read",
  "issues:write",
  "runs:read",
  "overview:read",
  "integrations:read",
] as const;

export function ApiKeyForm({
  action,
}: {
  action: (
    previous: ApiKeyFormState,
    formData: FormData,
  ) => Promise<ApiKeyFormState>;
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

      {state.key ? (
        <div className="rounded-md border border-success-border bg-success-bg px-3 py-2">
          <p className="text-[13px] font-medium text-success-fg">
            {state.name} created — copy the key now, it is shown once.
          </p>
          <code className="mt-1 block font-mono text-xs break-all text-success-fg">
            {state.key}
          </code>
        </div>
      ) : null}

      <Field label="Key name" htmlFor="key-name">
        <Input id="key-name" name="name" placeholder="ci-bot" />
      </Field>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Scopes</legend>
        {SCOPES.map((scope) => (
          <label key={scope} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="scopes"
              value={scope}
              defaultChecked={scope === "issues:read"}
            />
            <span className="font-mono text-xs">{scope}</span>
          </label>
        ))}
      </fieldset>

      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create key"}
      </Button>
    </form>
  );
}
