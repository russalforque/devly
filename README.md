# Devly

**Learn. Practice. Debug. Master.** A private developer learning workspace built with React, strict TypeScript, Vite, Tailwind CSS, Monaco, and Supabase.

## Start locally

Use Node **22.18+** (Node 24 LTS is suitable).

```sh
npm ci
npm run dev
```

Open the local URL Vite prints, normally `http://localhost:5173`. In PowerShell environments that block npm.ps1, use `npm.cmd` instead of `npm`.

Without Supabase variables, development uses a clearly labeled local workspace. All metrics start at zero. Progress persists in this browser; clearing browser data removes it. Settings can export all progress as JSON. Local data is not automatically imported into a connected account. Avoid editing the same feature simultaneously in multiple tabs/devices: feature snapshots use last-write-wins storage.

Production builds **deny access without configuration**. `VITE_ENABLE_LOCAL_MODE=true` explicitly enables an unauthenticated local demo build; do not enable it for a private deployment.

## What is implemented

| Phase | Available functionality |
| --- | --- |
| 1 · Foundation | Responsive shell, light/dark/system themes, owner-only auth, dashboard, search, bookmarks, goals, six substantive intermediate lessons, deterministic knowledge checks, saved progress |
| 2 · Coding | Locally bundled Monaco, JS/TS execution, formatting, keyboard shortcuts, saved drafts, console, deterministic test results, submission history, four coding challenges |
| 3 · Debugging & interviews | Three editable debugging cases with bug reports/tests/progressive hints; 24 interview questions across eight categories; practice/timed modes, saved responses, reference answers and explicitly subjective self-assessment |
| 4 · Adaptive learning | Six independent technology diagnostics (18 questions), weak-topic recommendations, adaptive challenge ordering, spaced reviews, deduplicated XP, streaks, milestones, evidence scores and recorded analytics |
| 5 · Advanced capabilities | Six project briefs with tasks/acceptance/tests/notes/checklists; optional authenticated mentor API; separate resource-limited Python/PHP/C# runner; export and combined analytics |

The initial curriculum deliberately stays small. Twelve tracks map the broader stack; six have published lessons. Unpublished curriculum is marked as such. Diagnostics sample three concepts per technology. An evidence score is **40% diagnostic accuracy + 60% independently solved available coding challenges**, not a certification of mastery. Technologies without evidence remain unassessed.

Reading a lesson earns nothing. Passing its full knowledge check earns 50 XP once. Each distinct challenge passed without revealing its solution in that session earns 100 XP once. Repeat attempts, reference-assisted runs, project checkboxes, diagnostics and self-rated interviews do not farm XP. Time is recorded from visible, focused lesson/coding sessions when an attempt is saved, not from idle open pages.

## Connect Supabase

1. Create a Supabase project. **Disable public sign-up and anonymous sign-ins** in its Auth settings.
2. Apply all SQL files in `supabase/migrations` in filename order, then apply `supabase/seed.sql`. Seed content creates no personal activity.
3. Create your account through Supabase administration. Follow `supabase/bootstrap_owner.sql` with that actual account UUID to establish the sole owner and profile.
4. Copy `.env.example` to `.env`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to your project's URL and publishable key (or legacy anon key).
5. Restart Vite and sign in. Nonowner accounts cannot read or write app data.

Never place a service-role, OpenAI, or runner key in a `VITE_` variable. Vite rejects privileged keys in the Supabase public-key setting. The private owner table is administered only through trusted SQL, never from the browser. Read [database setup](docs/supabase.md) before deployment.

## Optional services

Core learning does not require these integrations. To enable the mentor, also configure `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `OPENAI_API_KEY`, and an explicit supported `OPENAI_MODEL` **server-side**. Start the API in another terminal:

```sh
npm run dev:api
```

Vite proxies `/api` to `127.0.0.1:8788`. Without the API or credentials, the UI reports an error and retains the learner's input. The mentor has four assistance levels; full solutions require explicit permission. Its output is AI guidance, not code grading. Only the text the learner submits is sent to the provider.

Python, PHP and C# require the separate Docker runner with real, digest-pinned official images and a trusted HTTPS endpoint. Configure `RUNNER_URL` and `RUNNER_TOKEN` on the API server, and token/image variables only on the runner host. See [services](docs/services.md) and [runner setup](server/runner/README.md). The web server never executes submitted programs directly.

Both optional APIs verify the Supabase user and owner, enforce input/output/time limits, and use an atomic database budget of five accepted requests per minute and thirty per rolling day per service. Unconfigured services fail closed.

## Verify

```sh
npm run typecheck
npm run lint
npm test
npm run test:database
npm run build
```

The main test suite covers learning state, UI workflows, diagnostics, interviews, projects, the deterministic worker harness, service authorization/error paths, and mocked Docker lifecycle controls. Reference solutions are evaluated in test-only Node workers; this is not a substitute for checking real browser sandbox behavior.

`test:database` executes every migration and seed against embedded PostgreSQL (PGlite), with a minimal test Auth schema. It verifies real SQL behavior, RLS, retries, XP and quotas. It does not emulate hosted Supabase Auth or its HTTP API. The pgTAP suites in `supabase/tests/database` and `server/tests/service-budget.sql` are also provided for a disposable Supabase environment.

**Remaining environment verification:** live Supabase sign-in/sync, browser visual/responsive QA and sandbox execution, real container smoke tests, a configured AI request, and Vercel deployment. No credentials were supplied and no available browser/Docker service was connected. Do not treat mocked services or DOM tests as proof of those live integrations.

## Deploy to Vercel

Import this repository with the Vite preset. Build with `npm run build`, output `dist`. Configure public Supabase build variables and optional server variables in Vercel, keep `VITE_ENABLE_LOCAL_MODE=false`, and apply the database migrations before opening the app. `vercel.json` keeps the Node API functions separate from the static bundle and sets their maximum duration. Deploy the Docker runner on a separate host, not Vercel.

The large editor/compiler chunks are intentional and lazy-loaded only for coding. Monaco language services are served locally rather than from a third-party CDN. See [architecture](docs/architecture.md) for trust boundaries and persistence decisions.
