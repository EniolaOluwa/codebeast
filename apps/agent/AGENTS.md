# apps/agent — Repository Context Layer (RCL)

> Per-repo context for the agent pipeline (root `AGENTS.md` §9). Keep under 2,000 tokens.

## 1. What this service is

Standalone Fastify worker that runs planner → coder → Docker validator for one
issue at a time. It has **no database**; the API owns persistence and retries.

- Entrypoint: `src/main.ts`
- Stages: `src/planner.ts`, `src/coder.ts`, `src/validator.ts`
- LLM: OpenAI-compatible client in `src/llm/chat.client.ts` (env-configured)
- Sandbox: `src/sandbox.ts` (Docker; needs the host Docker socket)

## 2. Non-obvious decisions

- **No vendor names in identifiers.** Models come from `LLM_MODEL_*` env vars.
- **Checkout tokens are ephemeral.** Passed per request; never logged or cached.
- **Path jail.** All file tools resolve under the workspace root; escapes → error.
- **Deny-list is hard.** Matching paths reject the patch before validation.
- **Validator is deterministic.** No LLM; Docker only.

## 3. Landmines

- Docker socket must be mounted in compose (`/var/run/docker.sock`).
- `WORKSPACE_ROOT` must be writable and shared with sandbox bind mounts.
- Missing npm scripts in the target repo → validation `ERRORED`, not silent pass.

## 4. Test conventions

- Unit: colocated `*.test.ts`; mock LLM HTTP; mock sandbox where possible.
- Fixture repo under `test/fixtures/minimal-repo` for patch/denylist tests.
