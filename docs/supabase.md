# Database setup and Phase 1 integration

The later-phase migration `20261025000100_feature_records.sql` adds a 21st public table for versioned coding, interview, project and diagnostic state. It uses the same owner-only RLS and a 2 MB payload limit. `20261025000200_services.sql` adds a private service quota ledger and owner-checked quota function. Apply the complete migration chain in filename order. The original normalized catalog/audit tables remain available; feature snapshots do not automatically populate reserved projection tables. See the current [architecture](architecture.md) for implemented behavior across all five phases.

`npm run test:database` now executes all migrations and seed against embedded PostgreSQL with a test Auth schema. It verifies RLS, owner restrictions, atomic checks and service quotas without Docker. This does not replace the hosted Auth/API smoke test or the optional pgTAP suite below.

Only `supabase/**` and `docs/**` are part of this database implementation. No Auth
credentials or hosted project are configured. The seed does not assign an owner
or create personal data. Public signup and anonymous Auth sign-ins are disabled in
the local config; configure those settings separately for a hosted project.

## Files and local workflow

| File | Purpose |
| --- | --- |
| `supabase/config.toml` | Local ports, public API schema, seed path, and Auth defaults |
| `supabase/migrations/20261024000100_phase1_schema.sql` | Normalized schema, constraints, indexes, RLS, helper, and completion RPC |
| `supabase/seed.sql` | Six tracks/lessons and their challenges, fixtures, and achievement definitions |
| `supabase/bootstrap_owner.sql` | Commented manual template requiring a real existing Auth UUID |
| `supabase/tests/database/001_owner_security.test.sql` | Singleton invariants, grants, fail-closed access, per-table CRUD/RLS tests |
| `supabase/tests/database/002_phase1_contract.test.sql` | Seed IDs, client payloads, completion idempotency/rollback, and bookmarks |

With the Supabase CLI and its Docker-compatible local runtime installed, run from
`C:\Users\PC\Desktop\devly`:

```powershell
supabase start
supabase db reset
supabase test db
supabase db lint --local --level warning
```

`db reset` replaces the local database, including any local Auth accounts and owner
assignment. Use it only against a disposable local environment. The config loads
`seed.sql` after migrations. The CLI runs the SQL test files with pgTAP; each file
creates synthetic test identities inside a transaction and rolls everything back,
including temporary owner assignments and a test-only event-failure trigger.
Tests expect a freshly seeded catalog and require no real account or credentials.
They do not exercise the Auth login UI or network-level API requests.

These commands are provided for verification, not reported as executed. In the
implementation environment, Supabase CLI, `psql`, and Docker were unavailable.
No local or hosted database migration, pgTAP run, or live Auth flow was performed.

For a hosted installation, review/apply the migration with trusted administration
and apply `seed.sql` explicitly. Do not assume migrations alone load seed content.
Keep `private` out of the API's exposed schemas. Bootstrap the owner only after
creating the real account. Never commit database passwords, JWTs, or service keys.

## Owner bootstrap

1. Create or invite your actual account through trusted Supabase Auth administration.
2. Copy its UUID from Authentication → Users.
3. Open `supabase/bootstrap_owner.sql`, substitute the UUID, review, and uncomment
   the SQL block. Execute it as `postgres` through trusted SQL administration.
4. Sign in through the application and verify `is_owner()` returns `true`.

The template inserts both the singleton and the corresponding profile in one
transaction. It does not fabricate an account, select the first Auth user, or
overwrite an existing owner. Before bootstrap, all application access is denied.
Never expose an API for writing `private.owner`. Rotating the owner requires a
separate administrative data-migration decision; personal rows do not transfer
automatically. The Auth owner cannot be deleted while the singleton references it.

## Client contract

| Table | Fields used by Phase 1 | Conflict key |
| --- | --- | --- |
| `profiles` | `id uuid`, `display_name text`, `daily_goal_minutes integer` | `id` |
| `lesson_progress` | `user_id uuid`, `lesson_id text`, `status` (`started`/`completed`), `answers jsonb` as `number[]`, `updated_at timestamptz` | `user_id,lesson_id` |
| `learning_events` | `id uuid`, `user_id uuid`, nullable `lesson_id text`, `kind` (`lesson_completed`/`check_failed`/`practice`), `xp integer`, `minutes integer`, `created_at timestamptz` | `id`; completion also has a partial user/lesson unique index |
| `bookmarks` | `user_id uuid`, `lesson_id text` | `user_id,lesson_id` |

Obtain `userId` from the authenticated session, not from a route or user input.
The policies independently check it. Profiles are provisioned during bootstrap;
an owner may subsequently upsert their own profile. The daily goal must be 1–1440
minutes and the trimmed display name must be 1–100 characters.

The following snippets describe the intended client integration; they do not add
or change frontend files. Always check the returned `error` before updating local
UI state and preserve event UUIDs across retries.

```js
// Profile: use only the Phase 1 fields.
await supabase.from('profiles').upsert(
  { id: userId, display_name: 'Learner', daily_goal_minutes: 20 },
  { onConflict: 'id' },
);

// Start/resume: only send started for lessons that are not already completed.
// Do not send a late started write after a successful completion.
await supabase.from('lesson_progress').upsert(
  { user_id: userId, lesson_id: 'react-effects', status: 'started', answers: [1] },
  { onConflict: 'user_id,lesson_id' },
);

// Successful local check: atomic progress + one 50 XP event.
// Save this UUID for retries of this action, not for a different lesson/action.
const completionEventId = crypto.randomUUID();
const { error } = await supabase.rpc('complete_lesson', {
  p_lesson_id: 'react-effects',
  p_answers: [1],
  p_minutes: 12,
  p_event_id: completionEventId,
});
if (error) throw error;
// Returns void. Refetch progress/events to obtain the committed server state.

// Failed check or distinct repeat practice: zero XP.
await supabase.from('learning_events').insert({
  id: crypto.randomUUID(),
  user_id: userId,
  lesson_id: 'react-effects', // nullable for general practice
  kind: 'check_failed',      // or 'practice'
  xp: 0,
  minutes: 1,
});

await supabase.from('bookmarks').upsert(
  { user_id: userId, lesson_id: 'react-effects' },
  { onConflict: 'user_id,lesson_id' },
);
await supabase.from('bookmarks').delete()
  .eq('user_id', userId).eq('lesson_id', 'react-effects');
```

`complete_lesson(text,jsonb,integer,uuid)` is owner checked, SECURITY INVOKER, and
atomic. It rejects missing parameters, invalid answer arrays, out-of-range minutes,
and unknown lesson IDs. It upserts progress and inserts `kind='lesson_completed'`,
`xp=50` with `ON CONFLICT DO NOTHING`. Repeated completion updates answers but does
not add XP or minutes. Other event kinds have no user/lesson uniqueness restriction;
for their network retries, a repeated UUID can yield `23505`, so reconcile that
specific existing event instead of generating another UUID for the same action.

Read progress/bookmarks by the session UUID; read events ordered by `created_at`
with pagination for growing history. Compute XP from event rows and completion
counts from `lesson_completed` events or completed progress, using one definition
consistently. Do not add a second client-side 50 XP award after a successful RPC.
RLS applies even if the client omits the user filter.

## Catalog editing and test expectations

`seed.sql` is the database content source, with stable IDs matching the six client
lessons. If the app also embeds static lesson content, review both copies together
when editing text/answers; no synchronization or code-generation pipeline is
installed. Reapplying the seed updates existing definitions by ID and preserves
personal history; it does not delete obsolete rows. Adding/removing/renaming IDs
needs an explicit migration and updated contract tests. Lesson snippets and fixtures
are data and are never executed by this database.

The SQL suites cover all 20 public tables with owner insert/read/update/delete,
anonymous denial, nonowner invisible reads/updates/deletes and rejected inserts.
They also check foreign-user writes by the owner, private authorization access,
empty/revoked ownership, missing JWT subjects, singleton constraints, helper grants,
and fixed search paths. The contract suite verifies the six IDs, JSON number
arrays, allowed statuses/kinds, fixed XP, completion deduplication, RPC rollback
after a deliberately failed event insert, timestamp updates, bookmark upserts, and
interview ownership FKs. Concurrent requests are protected by the unique index;
the tests exercise repeat calls and constraint enforcement, not a parallel load test.

Run these tests before deploying schema changes. Any future public table or RPC
must have explicit grants, RLS/identity checks, an appropriate search path, and
matching regression coverage. See the [architecture](architecture.md) for the
boundary between current persistence and future execution services.

References: [Supabase CLI database tests](https://supabase.com/docs/reference/cli/supabase-test-db),
[pgTAP assertions](https://pgtap.org/documentation.html).
