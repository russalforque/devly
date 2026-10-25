# Devly architecture

## Product boundaries

Devly is a single-owner learning tool with useful local functionality across all five phases. It has no public registration, organizations, payments, subscriptions or social system. It distinguishes completed knowledge checks, deterministic coding results, diagnostic samples and subjective self-reports instead of combining them into an authoritative grade.

The source-of-truth curriculum lives in `src/features/curriculum/content.ts`; executable cases and reference solutions live in `src/features/coding/challenges.ts`. The database seed mirrors the six lesson IDs and supplies catalog metadata. Additional track roadmaps do not pretend that content has shipped.

## Application structure

| Directory | Responsibility |
| --- | --- |
| `src/components` | Shared accessible primitives, search, settings |
| `src/features/auth` | Supabase session and explicit owner verification; no signup UI |
| `src/features/curriculum` | Static lesson content, track library, lesson checks |
| `src/features/coding` | Monaco, code drafts, isolated JS/TS runner, debugging, optional language service UI |
| `src/features/interviews` | Timed/untimed interview state machine, reference answers, self-assessment |
| `src/features/assessment` | Versioned diagnostic question banks, scoring and recommendations |
| `src/features/projects` | Project briefs, self-reported checklists and evidence notes |
| `src/features/progress` | Recorded metrics, review scheduling and learning signals |
| `src/features/mentor` | Explicit progressive assistance and offline reflection prompts |
| `api` / `server` | Owner-authenticated optional API functions and separate Docker service |
| `supabase` | Normalized schema, RLS, transactional RPCs, seed and database tests |

React uses strict TypeScript, lazy feature routes and hash navigation, so static hosting does not need a catch-all rewrite that could swallow API endpoints. The design uses Inter, JetBrains Mono, restrained sage colors, reusable panels, a collapsible desktop sidebar and mobile navigation. Monaco's three-panel playground becomes a tabbed interface below 800px. Dialogs use the native modal focus boundary; the mobile drawer traps focus and marks background content inert.

## Persistence and authorization

With no Supabase configuration, development persists to versioned browser storage. Production defaults to denying access until Supabase is configured; an explicit local-demo flag is available. Local records never silently migrate into a cloud account. Failed or corrupt reads display errors rather than overwriting existing records.

Supabase requires a real session whose UUID matches the singleton `private.owner`. Every public application table has enabled/forced RLS. Catalog policies require the owner; personal policies additionally require the row's user UUID. Anonymous roles have no table access. `is_owner()` has a fixed search path and uses only `auth.uid()`, never a client-provided identity. The private schema is not exposed through PostgREST.

The normalized schema covers profiles, technologies, tracks, modules, lessons, challenges/tests/attempts, lesson progress, assessments/mastery, daily activity, goals, achievements, review schedules, interviews and answers. `learning_events` is the lesson audit source. `record_lesson_check` atomically writes an answer snapshot and progress, preserves success on failed reviews, rejects mismatched UUID retries and awards a first-completion reward once. Clients retain the attempt UUID on retry and refetch authoritative cloud state. Event queries paginate.

Versioned coding/interview/project/diagnostic UI state is stored as an owner-scoped `feature_records` snapshot per feature/key, or the equivalent local record. This keeps structured questionnaire/draft states together; it does not write duplicate statistics into reserved normalized projection tables. Feature snapshot updates are last-write-wins across devices. They are not advertised as collaborative or conflict-free. Snapshot payloads have a 2 MB database limit; exports allow retaining a separate backup. A future history migration can normalize append-only attempts without changing catalog IDs.

## Learning evidence

Lesson completion requires all knowledge-check answers to match. Reading or bookmarking earns no XP. First lesson completion earns 50 XP. Coding XP is derived from distinct challenge IDs that have a passed, non-solution-assisted attempt: 100 per challenge. Deliberate repeated practice and self-reported work do not add duplicate rewards.

Each available diagnostic samples three questions. Latest attempts determine recommendations independently for each technology. Coding difficulty ordering considers recent pass outcomes, while every difficulty remains accessible. Evidence scores combine 40% diagnostic accuracy and 60% distinct independently passed challenges from the available sample. Unknown technology scores remain null, never a fabricated baseline. The score is not proof of broad mastery or interview readiness.

Review intervals advance through 3, 7, 14 and 30 days after passed checks. Failed checks bring the due date forward to within a day without postponing an already-due review. Streaks use the browser's local calendar, count successful lesson/coding work and allow yesterday's streak to remain active during today. Session time is counted while the lesson/editor is visible and focused, then recorded only on submission. No page-open event grants XP.

Interview reports preserve written responses and expose reference answers only after submission (or explicit practice reveal). Ratings are learner-entered and labeled subjective. Project completion requires checked acceptance/tasks/test scenarios but remains explicitly self-reported, with no automated code-verification claim.

## JavaScript and TypeScript isolation

Monaco is an editor, not a sandbox. JS runs inside a disposable Worker created by a sandboxed iframe with **only `allow-scripts`**. The iframe has an opaque origin and cannot access app storage or the parent DOM. Its CSP blocks network, images, external scripts and forms; blob workers and compilation are explicitly permitted. The parent validates sender identity and a per-run token. User code is passed by message, never embedded into the iframe HTML. TypeScript transpiles in a lazy compiler before entering the sandbox; Monaco supplies editing/type feedback.

The parent enforces a 3.5-second execution budget (with startup allowance), abort cleanup and output/message bounds. Inputs cap at 50,000 code characters. Workers terminate after one run. Visible deterministic cases compare canonical output and detect input mutation. Tests and answer keys are shipped in the client, so this is not a hidden-test or tamper-proof exam. Malicious submissions can attempt to interfere with their own results; there are no public rankings or trusted credentials attached to them.

Browsers cannot enforce reliable per-worker memory quotas. A pathological allocation can still pressure the tab. The browser playground therefore provides bounded personal practice, not a multi-user untrusted-code hosting service. Its real browser isolation and performance must be smoke-tested before deployment; Node harness tests alone do not establish browser behavior.

## Optional services

The mentor calls the OpenAI Responses API using server-only credentials, no tools, bounded inputs/output, a deadline, and `store:false`. Teaching prompts progressively escalate guidance; full solutions require an explicit level-4 permission flag. Model adherence is not a deterministic guarantee. All content is rendered as text. Core learning and offline reflection work without an AI provider.

Python/PHP/C# execution is a separate service on a dedicated Docker host. The application API authenticates and forwards requests; it does not interpret submitted code. The runner uses digest-pinned official images, no network, a non-root user, read-only roots, bounded tmpfs, memory/CPU/PID/wall/output limits and forced cleanup. Docker receives fixed argument arrays, never a user-composed host shell command. See `server/runner/README.md` for operational prerequisites and crash recovery.

Both APIs verify the Supabase user and owner and consume an atomic rolling database quota. Missing credentials or unavailable quota/authorization fail closed. No privileged credentials are put into the frontend. Live integration is a deployment step, not a claim established by unit tests.

## Verification scope

Automated checks exercise application state/UI flows, all challenge reference solutions and broken starters, TS transpilation, iframe configuration and message rejection, diagnostic/interview/project logic, API authorization and error behavior, and mocked Docker lifecycle controls. Embedded PostgreSQL executes the entire migration chain and seed and verifies RLS, retries, constraints and quota behavior. Additional pgTAP suites cover the broader schema.

Browser visual/layout checks, browser Worker/CSP execution, hosted Supabase Auth, actual Docker image execution, live mentor requests and Vercel deployment remain environment-dependent checks. No fabricated activity or successful external deployment is used to stand in for them.
