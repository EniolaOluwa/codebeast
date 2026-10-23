"use client";

import { useActionState } from "react";

import type { MemberFormState } from "@/app/(dashboard)/settings/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";

export function InviteMemberForm({
  action,
}: {
  action: (
    previous: MemberFormState,
    formData: FormData,
  ) => Promise<MemberFormState>;
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
          Member added.
        </p>
      ) : null}

      <Field
        label="Email"
        htmlFor="member-email"
        hint="They need a CodeBeast account already — ask them to register first."
      >
        <Input
          id="member-email"
          name="email"
          type="email"
          required
          placeholder="teammate@acme.co"
        />
      </Field>

      <Field label="Role" htmlFor="member-role">
        <Select id="member-role" name="role" defaultValue="MEMBER">
          <option value="MEMBER">Member</option>
          <option value="ADMIN">Admin</option>
        </Select>
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add member"}
      </Button>
    </form>
  );
}
