# Optional backend services

The frontend can run without external integrations. Mentor and Python/PHP/C# execution require configured servers and a real Supabase owner session; local demo mode does not bypass authentication. No credentials were created or provisioned by this implementation.

## API contracts

Both endpoints are Vercel Node functions using native `IncomingMessage`/`ServerResponse`. Send `POST`, `Content-Type: application/json`, and `Authorization: Bearer <Supabase access_token>`. The server calls Supabase `auth.getUser(token)` and then `public.is_owner()` using that same caller token, before accepting any service work. Authenticated, validated, configured requests consume an atomic database budget before any provider call. Secrets and model choices cannot be supplied in request bodies. Unexpected fields are rejected.

`POST /api/mentor`:

```ts
type MentorRequest = {
  message: string
  context?: string
  level: 1 | 2 | 3 | 4
  allowSolution: boolean
}
type MentorResponse = { answer: string }
```

Level 1 gives a small hint, level 2 explains the concept and next step, level 3 gives an approach or incomplete pseudocode, and level 4 allows a worked solution. Level 4 requires `allowSolution:true`; that flag does not reveal solutions at lower levels. The prompt keeps learner content separate from instructions; teaching-level adherence is model behavior, not a guaranteed output filter. Context is plain text, not a structured object or conversation array. Message/context limits are 4,000/8,000 UTF-8 bytes with a combined 10,000-byte cap. This is a conservative input-token bound rather than a model-specific tokenizer; request instructions add a small fixed overhead. There are no tools, model overrides, persistent conversations, or retries.

The implementation uses the official `POST https://api.openai.com/v1/responses` contract, with server-configured `model`, `instructions`, `input`, `store:false`, and `max_output_tokens:1200`. It extracts assistant `output_text` items from the raw response. `store:false` disables response storage for later retrieval; it is not a claim of zero provider retention. See the [official Responses migration guide](https://developers.openai.com/api/docs/guides/migrate-to-responses) and [create-response reference](https://developers.openai.com/api/reference/resources/responses/methods/create).

`POST /api/execute`:

```ts
type ExecutionRequest = {
  language: 'python' | 'php' | 'csharp'
  code: string
  input: string // required; use '' when no stdin is needed
}
type ExecutionResponse = {
  stdout: string
  stderr: string
  exitCode: number
  truncated: boolean
}
```

Code/input limits are 12,000/2,000 UTF-8 bytes. The server forwards only those three fields to the dedicated runner's `/execute` endpoint with its own Bearer token. Runner output is validated, bounded, and returned as text. Exit code 124 means container timeout; 137 with `truncated:true` means output quota exceeded. HTTP 200 means the execution completed, not that the submitted program passed. Do not treat either service as authoritative challenge grading or award progress from it without the separate progress RPC contract.

All request bodies are limited to 16 KiB, including already-parsed Vercel bodies and chunked local bodies. Compressed bodies are rejected. Upstream JSON responses are bounded (mentor 256 KiB, runner 512 KiB). Requests have a 30-second total deadline; response disconnect aborts upstream fetches. Redirects are rejected so credentials cannot be forwarded to redirected hosts. Responses set `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`. Code, prompts, inputs, tokens, and upstream error bodies are not logged by these services.

Failures have `{ error: string }` and these statuses:

| Status | Meaning |
| --- | --- |
| 400 | Invalid JSON/fields/teaching permission/language |
| 401 | Missing, malformed, invalid, or expired Supabase session |
| 403 | Authenticated user is not the configured owner |
| 405 | Authenticated request used a method other than POST |
| 413 / 415 | Body/input too large / wrong media type or encoding |
| 429 | Owner's per-service database budget exhausted |
| 502 | Provider failed or returned invalid/oversized output |
| 503 | Missing configuration, unavailable auth/owner/budget RPC, or unavailable/busy runner |
| 504 | API deadline expired or upstream request was cancelled |

The frontend should display the returned error and keep optional controls unavailable when setup is missing; it must not fall back to an unguarded provider or local host execution. UI code must render answers and execution output safely as text or sanitized Markdown.

## Server environment

| Variable | Required by | Notes |
| --- | --- | --- |
| `SUPABASE_URL` | Both APIs | HTTPS project origin; local loopback HTTP is allowed only outside production |
| `SUPABASE_PUBLISHABLE_KEY` | Both APIs | Publishable key or legacy anon key; service/secret keys rejected |
| `OPENAI_API_KEY` | Mentor | Server-only API key |
| `OPENAI_MODEL` | Mentor | Explicit model ID with Responses support and access on your account; no default is guessed |
| `RUNNER_URL` | Execution | Dedicated HTTPS origin or its `/execute` URL; no credentials/query/fragment |
| `RUNNER_TOKEN` | Execution | Shared with runner, at least 32 printable non-space characters |

`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are permitted fallbacks for the two public Supabase values. **Never** put OpenAI keys, runner tokens, or Supabase service/secret keys in `VITE_` variables. Keep them in the hosting platform's server environment or a private file outside the repository. The runner needs only its own token/image configuration, not the Supabase or OpenAI credentials. Required missing settings produce clear 503 responses after successful owner authentication and body validation.

## Migration and budget

Apply `supabase/migrations/20261025000200_services.sql` after the existing owner schema and other migrations, using the project's normal migration workflow. It adds only `private.service_usage` and `public.consume_service_budget(service text)`. Existing SQL and database documentation are not changed by this service implementation.

The RPC returns a boolean: true consumes a slot; false means quota exceeded. Allowed service names are `mentor` and `execute`. Each owner/service pair has independent limits of **5 attempts per sliding 60 seconds and 30 per sliding 24 hours**. There is no midnight or minute-boundary burst. Accepted requests that subsequently fail at a provider still consume a slot; no retry/refund happens automatically. Rejected bodies and missing service configuration do not consume slots.

The SECURITY DEFINER function uses an empty fixed `search_path`, checks `auth.uid()` and `is_owner()` internally, and never accepts a caller UUID. An insert-on-conflict plus row lock serializes concurrent calls across API instances, then the timestamp is read after lock acquisition. At most 30 timestamps are retained per user/service row; expired entries are pruned on consumption. The private table has RLS and no client privileges; no source code, prompts, stdin, answers, or provider credentials are stored. Only `authenticated` receives an explicit execute grant; authorization is still checked within the function. Missing/unavailable RPCs fail closed. Calling the RPC directly can spend your own quota but cannot grant execution or bypass limits.

## Run locally

Install the existing project dependencies. Use Node 22.18+ for native TypeScript execution of the local API (the runner itself is plain `.mjs`). Supply environment variables privately; for example, `node --env-file=/private/path/devly-api.env server/dev.ts` loads a private file without changing the frontend environment. Do not commit such files.

In one terminal, with API variables already supplied:

```sh
node server/dev.ts
```

It listens on `127.0.0.1:8788` (`API_PORT` can override this). In another terminal:

```sh
npm run dev
```

The root Vite config proxies `/api` to port 8788, keeping browser requests same-origin. `npm run dev:api` starts the separate API process and loads an ignored `.env` if present. If you override `API_PORT`, adapt the proxy accordingly. `npm run dev` alone does not launch these APIs. You can also use Vercel's local development workflow once Vercel is configured.

For real execution, start the [dedicated runner](../server/runner/README.md), pre-pull the configured digest-pinned images, and provide a trusted HTTPS proxy. The local API enforces HTTPS for `RUNNER_URL` too. Without Docker, execution is unavailable; without OpenAI credentials/model, mentor is unavailable; without a Supabase owner, both are unavailable. The rest of the app remains usable according to its frontend local-mode behavior.

## Deploy

Keep `api/mentor.ts` and `api/execute.ts` as Node functions (never Edge). The default handlers use native Node request/response types; `.ts` helper imports work with the project's bundler resolution and `allowImportingTsExtensions`. Include `api` and `server` in project TypeScript checks when integrating this slice. Vercel bundles their Supabase dependency from the existing installation. See [Vercel Node functions](https://vercel.com/docs/functions/runtimes/node-js).

Each function exports a 35-second maximum duration so the application deadline can respond first. Confirm at least 35 seconds is configured on the deployment; if the selected framework requires `vercel.json`, set `functions["api/*.ts"].maxDuration` there during parent integration. Keep SPA rewrites from swallowing `/api/*`. No root Vercel routing was changed in this scope. See [Vercel duration configuration](https://vercel.com/docs/functions/configuring-functions/duration).

Deploy the runner separately, behind TLS, with exactly one process on a dedicated host. Configure reverse proxies to propagate cancellation and never log request bodies or Authorization headers. Configure provider billing limits separately if needed; this database budget only controls these two Devly endpoints.

## Verification

Run the mock suite without Docker, Supabase, or provider credentials:

```sh
node --no-experimental-webstorage node_modules/vitest/vitest.mjs run server/tests/api.test.ts server/tests/runner.test.mjs server/tests/runner-process.test.mjs
node node_modules/eslint/bin/eslint.js api server
```

All child processes in runner tests are mocked; tests never execute submitted code. They cover auth and owner ordering, malformed/oversized bodies, quotas failing closed, missing configuration, Responses payload/output parsing, provider failures, deadlines, URL restrictions, image allowlists, resource flags, offline C# project creation, exit-code extraction, one-job concurrency, timeout/disconnect cleanup, cleanup failures, and combined output bounds.

The optional pgTAP suite is kept in the permitted `server/` scope:

```sh
supabase test db server/tests/service-budget.sql
```

Run it against a disposable local database after applying all migrations. It rolls back fixtures and tests grants, identity checks, owner revocation, per-minute/day boundaries, independent services, and pruning. It does not prove multi-connection behavior; the function's row lock supplies concurrency serialization. A real deployment should additionally send concurrent requests and verify exactly five are accepted in a fresh minute window. That check consumes real quota, so perform it on a disposable test project.

Live OpenAI, migrated PostgreSQL, Vercel deployment, and real Python/PHP/C# container smoke tests were not executed in the implementation environment. The runner README gives the required host smoke checks. Mock success is not evidence that a chosen image digest or production Docker configuration works.
