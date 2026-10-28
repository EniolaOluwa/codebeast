"use client";

import Link from "next/link";
import { useActionState } from "react";

import type { AuthFormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

export function RegisterForm({
  action,
}: {
  action: (
    previous: AuthFormState,
    formData: FormData,
  ) => Promise<AuthFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="grid gap-4">
      <div>
        <h1 className="text-lg font-semibold tracking-[-0.01em]">
          Create your workspace
        </h1>
        <p className="mt-0.5 text-[13px] text-foreground-subtle">
          One workspace per team — you can add members later.
        </p>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-[13px] text-danger-fg"
        >
          {state.error}
        </p>
      ) : null}

      <Field label="Your name" htmlFor="name">
        <Input id="name" name="name" autoComplete="name" />
      </Field>

      <Field label="Workspace name" htmlFor="tenantName">
        <Input id="tenantName" name="tenantName" placeholder="Acme" />
      </Field>

      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </Field>

      <Field label="Password" htmlFor="password" hint="At least 8 characters.">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? "Creating workspace…" : "Create workspace"}
      </Button>

      <p className="text-center text-[13px] text-foreground-subtle">
        Already have an account?{" "}
        <Link href="/login" className="text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
