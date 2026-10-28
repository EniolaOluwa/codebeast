"use client";

import { useActionState, useState } from "react";

import type { ConnectSourceState } from "@/app/(dashboard)/sources/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { PROVIDER_LABELS, SOURCE_TYPES } from "@/lib/providers";

export function ConnectSourceForm({
  action,
}: {
  action: (
    previous: ConnectSourceState,
    formData: FormData,
  ) => Promise<ConnectSourceState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [type, setType] = useState("SENTRY");

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
          Source connected.
        </p>
      ) : null}

      <Field label="Source" htmlFor="type">
        <Select
          id="type"
          name="type"
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          {SOURCE_TYPES.map((provider) => (
            <option key={provider} value={provider}>
              {PROVIDER_LABELS[provider]}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Connection name" htmlFor="name" hint="Shown in settings.">
        <Input id="name" name="name" placeholder={type.toLowerCase()} />
      </Field>

      {type === "JIRA" ? (
        <>
          <Field
            label="Site URL"
            htmlFor="siteUrl"
            hint="For example https://acme.atlassian.net"
          >
            <Input
              id="siteUrl"
              name="siteUrl"
              required
              placeholder="https://acme.atlassian.net"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Project key" htmlFor="projectKey">
              <Input
                id="projectKey"
                name="projectKey"
                required
                placeholder="ENG"
              />
            </Field>
            <Field label="Issue type" htmlFor="issueType">
              <Input id="issueType" name="issueType" placeholder="Bug" />
            </Field>
          </div>
          <Field
            label="Scan JQL (optional)"
            htmlFor="jql"
            hint="Items matching this query are imported by Scan now."
          >
            <Input
              id="jql"
              name="jql"
              placeholder="project = ENG AND statusCategory != Done"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Account email" htmlFor="email">
              <Input id="email" name="email" type="email" required />
            </Field>
            <Field label="API token" htmlFor="apiToken">
              <Input id="apiToken" name="apiToken" type="password" required />
            </Field>
          </div>
        </>
      ) : type === "DISCORD" ? (
        <>
          <Field
            label="Bot token"
            htmlFor="botToken"
            hint="The bot must already be invited to the server."
          >
            <Input id="botToken" name="botToken" type="password" required />
          </Field>
          <Field label="Server id (optional)" htmlFor="guildId">
            <Input id="guildId" name="guildId" placeholder="1234567890" />
          </Field>
          <Field
            label="Channel ids"
            htmlFor="channelIds"
            hint="Comma-separated; these channels are scanned for messages."
          >
            <Input
              id="channelIds"
              name="channelIds"
              required
              placeholder="1111111111, 2222222222"
            />
          </Field>
        </>
      ) : type === "FRESHDESK" ? (
        <>
          <Field
            label="Domain"
            htmlFor="domain"
            hint="For example acme.freshdesk.com"
          >
            <Input
              id="domain"
              name="domain"
              required
              placeholder="acme.freshdesk.com"
            />
          </Field>
          <Field label="API key" htmlFor="apiKey">
            <Input id="apiKey" name="apiKey" type="password" required />
          </Field>
          <Field
            label="Webhook secret (optional)"
            htmlFor="webhookSecret"
            hint="Required if Freshdesk pushes conversations to CodeBeast."
          >
            <Input id="webhookSecret" name="webhookSecret" type="password" />
          </Field>
        </>
      ) : (
        <>
          <Field
            label={type === "GITHUB" ? "Installation id" : "Workspace / org id"}
            htmlFor="externalId"
            hint="How inbound webhooks resolve this workspace."
          >
            <Input id="externalId" name="externalId" required />
          </Field>
          <Field label="Signing secret" htmlFor="signingSecret">
            <Input
              id="signingSecret"
              name="signingSecret"
              type="password"
              required
            />
          </Field>
        </>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Connecting…" : "Connect"}
      </Button>
    </form>
  );
}
