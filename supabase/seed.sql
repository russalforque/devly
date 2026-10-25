-- Catalog mirror only. Canonical application content and answer keys live in
-- src/features/curriculum/content.ts. SQL lesson bodies/challenges below are
-- separate illustrative material, not the frontend's two-question answer keys.
-- IDs, titles, minutes, and lowercase difficulty mirror the six active lessons.
-- No Auth users, owner assignment, or personal data. Safe to reapply by ID.
begin;

insert into public.technologies (id, name, description) values
  ('react', 'React', 'Build interfaces with components, state, and effects.'),
  ('typescript', 'TypeScript', 'Model JavaScript data with useful static guarantees.'),
  ('javascript', 'JavaScript', 'Understand asynchronous control flow and the language runtime.'),
  ('sql', 'SQL', 'Query relational data and reason about missing matches.'),
  ('node', 'Node.js', 'Build predictable HTTP APIs with clear failure boundaries.'),
  ('git', 'Git', 'Inspect history and recover work without unnecessary disruption.')
on conflict (id) do update set name = excluded.name, description = excluded.description;

insert into public.learning_tracks (id, technology_id, title, description, difficulty, position) values
  ('react', 'react', 'React', 'Synchronize components with systems outside React.', 'intermediate', 1),
  ('typescript', 'typescript', 'TypeScript', 'Narrow uncertain values before using them.', 'intermediate', 2),
  ('javascript', 'javascript', 'JavaScript', 'Coordinate promises and handle rejections.', 'intermediate', 3),
  ('sql', 'sql', 'SQL & databases', 'Combine tables while preserving the rows you need.', 'intermediate', 4),
  ('node', 'node', 'Node.js & APIs', 'Return useful errors without leaking internals.', 'intermediate', 5),
  ('git', 'git', 'Git & engineering', 'Choose safe recovery tools for local and shared history.', 'intermediate', 6)
on conflict (id) do update set
  technology_id = excluded.technology_id, title = excluded.title,
  description = excluded.description, difficulty = excluded.difficulty, position = excluded.position;

insert into public.modules (id, track_id, title, description, position) values
  ('react-synchronization', 'react', 'Synchronizing effects', 'Dependencies, setup, and cleanup.', 1),
  ('typescript-safety', 'typescript', 'Working with unknown values', 'Use runtime evidence to refine types.', 1),
  ('javascript-promises', 'javascript', 'Promise coordination', 'Sequence dependent work and overlap independent work.', 1),
  ('sql-relations', 'sql', 'Joining relations', 'Inner joins, outer joins, and filter placement.', 1),
  ('node-http', 'node', 'HTTP failure boundaries', 'Validation, status codes, and safe responses.', 1),
  ('git-history', 'git', 'Recovering changes', 'Revert shared commits and locate local work.', 1)
on conflict (id) do update set
  track_id = excluded.track_id, title = excluded.title,
  description = excluded.description, position = excluded.position;

insert into public.lessons
  (id, module_id, title, summary, content_md, estimated_minutes, xp_reward, position, difficulty)
values
  ('react-effects', 'react-synchronization', 'Effects without the side effects',
   'Understand dependencies, cleanup, and the lifecycle of an effect.',
   $lesson$An effect connects a component to an external system. Deriving a value from props usually belongs in rendering; opening a connection belongs in an effect.

```jsx
useEffect(() => {
  const connection = connect(roomId);
  connection.open();
  return () => connection.close();
}, [roomId]);
```

React runs cleanup before setting up the effect again after a dependency changes, and when the component unmounts. Include reactive values read by the effect in its dependency list. An empty list would keep this connection tied to the initial room.

Development Strict Mode can run an extra setup/cleanup cycle. Cleanup should mirror setup so that this cycle does not leave two subscriptions alive. Avoid suppressing dependency warnings; change the effect structure when a dependency is unnecessary.

Check your understanding: if `roomId` changes from `general` to `help`, close the old connection before opening the new one.$lesson$,
   15, 50, 1, 'intermediate'),
  ('ts-narrowing', 'typescript-safety', 'Make impossible states impossible',
   'Model an API request with discriminated unions.',
   $lesson$A union says a value can have several shapes. Narrowing uses evidence in control flow to determine which shape is present.

```ts
type Result =
  | { ok: true; value: string }
  | { ok: false; error: string };

function describe(result: Result): string {
  if (result.ok) return result.value.toUpperCase();
  return result.error;
}
```

The literal `ok` field distinguishes the two cases. Access `value` only inside the successful branch. A type assertion such as `as string` does not validate a value at runtime.

For an `unknown` input, start with runtime checks: `typeof input === "string"` permits string methods in that branch. To inspect an object, first exclude null and check that it is an object. `typeof null` is `"object"`, so that check alone is insufficient.

Check your understanding: a network response is not validated merely because you asserted its TypeScript type.$lesson$,
   12, 50, 1, 'intermediate'),
  ('js-async', 'javascript-promises', 'Bring order to async work',
   'Choose deliberate concurrency and handle failures.',
   $lesson$An async function returns a promise. `await` pauses that function until the promise settles; it does not block the whole JavaScript runtime.

```js
async function loadDashboard() {
  try {
    const [profile, lessons] = await Promise.all([
      fetchProfile(),
      fetchLessons(),
    ]);
    return { profile, lessons };
  } catch (error) {
    showLoadError(error);
    throw error;
  }
}
```

Both calls start before waiting for their combined results. Sequential awaits are appropriate when the second operation needs the first result. `Promise.all` preserves input order in its result array, even if requests finish out of order.

If one promise rejects, the combined promise rejects. It does not automatically cancel the other operations. Use `Promise.allSettled` when you need each success or failure separately. Await or return promises so errors reach the intended handler.

Check your understanding: `forEach(async () => ...)` does not wait for its callbacks; use `for...of` for sequencing or `map` plus `Promise.all` for concurrent work.$lesson$,
   14, 50, 1, 'intermediate'),
  ('sql-joins', 'sql-relations', 'The missing rows mystery',
   'Understand how filters change a LEFT JOIN.',
   $lesson$An inner join returns matching pairs. A left join also retains rows from the left table that have no match, with nulls for the right-hand columns.

```sql
select learners.id, count(progress.lesson_id) as completed
from learners
left join progress
  on progress.user_id = learners.id
  and progress.status = 'completed'
group by learners.id;
```

The status condition belongs in `ON` when learners with no completed lessons must remain in the result. Moving it to `WHERE progress.status = 'completed'` removes the null-extended rows.

`count(progress.lesson_id)` counts matching non-null values. `count(*)` counts the preserved row too, so an unmatched learner would incorrectly appear to have one completion. One-to-many joins can multiply rows; inspect the join keys before summing values.

Check your understanding: to list every learner, including those with zero completions, start from learners and left join only the relevant progress rows.$lesson$,
   12, 50, 1, 'intermediate'),
  ('api-errors', 'node-http', 'Treat API failures as a contract',
   'Handle HTTP errors without hiding useful context.',
   $lesson$An API error should tell the caller what happened and whether a retry is useful. Validate request input before starting work and use consistent status codes and response fields.

```js
if (!isValidLessonId(body.lessonId)) {
  return reply.status(400).send({
    error: { code: 'INVALID_LESSON', message: 'Choose a valid lesson.' },
  });
}
```

Use 400 for malformed input, 401 for missing or invalid authentication, 403 for an authenticated caller without permission, and 404 for a missing resource when disclosing its absence is appropriate. An unexpected server failure is a 500, not a successful 200 response with a hidden error flag.

Log unexpected failures with a request ID in a trusted environment. Return a generic message and that request ID to the client. Do not send stack traces, SQL errors, credentials, or raw exception objects. The exact error-handler signature depends on the server framework.

Check your understanding: retrying malformed input unchanged will not fix it; the caller needs a useful validation error.$lesson$,
   10, 50, 1, 'intermediate'),
  ('git-recovery', 'git-history', 'Undo safely. Keep the history.',
   'Choose the right recovery tool for a shared branch.',
   $lesson$Start recovery by inspecting `git status`, `git log --oneline`, and the changes you want to preserve. The right command depends on whether the commit was shared.

```sh
git log --oneline
git revert <shared-commit>
```

Revert makes a new commit that reverses an earlier commit. This preserves shared history. Resolve any conflicts and review the resulting diff before continuing.

If a local branch moved away from a useful commit, inspect `git reflog` to find its previous tip. Create a recovery branch at the identified commit with `git branch recovery <commit>` before deciding what to do next. Reflog entries are local and can expire; they are not a substitute for backups.

`git reset --hard` discards tracked working-tree changes and moves the current branch. It is not the default recovery tool for shared history. Save uncommitted work before any operation that could replace it.

Check your understanding: undo an already-pushed mistake with a reviewed revert, rather than rewriting the branch everyone else uses.$lesson$,
   10, 50, 1, 'intermediate')
on conflict (id) do update set
  module_id = excluded.module_id, title = excluded.title, summary = excluded.summary,
  content_md = excluded.content_md, estimated_minutes = excluded.estimated_minutes,
  xp_reward = excluded.xp_reward, position = excluded.position, difficulty = excluded.difficulty;

insert into public.challenges
  (id, lesson_id, title, prompt_md, kind, solution_explanation, position)
values
  ('react-effects-cleanup', 'react-effects', 'Changing rooms',
   'A connection effect reads roomId. Which approach keeps it synchronized? 0: Omit dependencies. 1: Depend on roomId and return connection cleanup. 2: Connect during render.',
   'multiple_choice', 'Option 1 reruns setup when roomId changes and closes the previous connection through cleanup.', 1),
  ('ts-narrowing-union', 'ts-narrowing', 'Find the safe branch',
   'For {ok:true,value:string} | {ok:false,error:string}, when can you access value? 0: In the result.ok branch. 1: Always. 2: After asserting any.',
   'multiple_choice', 'Option 0 uses the discriminant to narrow to the shape containing value; assertions add no runtime validation.', 1),
  ('js-async-parallel', 'js-async', 'Load independent data',
   'How should two independent promise-returning requests start together? 0: Await each before calling the next. 1: Use forEach with async callbacks. 2: Call both inside Promise.all and await it.',
   'multiple_choice', 'Option 2 starts both operations before waiting and produces ordered results; it does not cancel work on rejection.', 1),
  ('sql-joins-filter', 'sql-joins', 'Keep zero-completion learners',
   'Where should progress.status = completed go to retain learners without progress in a left join? 0: WHERE only. 1: In the join ON condition. 2: HAVING count(*) > 0.',
   'multiple_choice', 'Option 1 filters matching progress while preserving unmatched learners; count a nullable right-side key for zero.', 1),
  ('api-errors-validation', 'api-errors', 'Reject malformed input',
   'Which response fits an invalid lesson ID format? 0: 500 with a stack trace. 1: 200 with no explanation. 2: 400 with a stable validation error code.',
   'multiple_choice', 'Option 2 tells the caller to fix the request without exposing server internals.', 1),
  ('git-recovery-shared', 'git-recovery', 'Undo a pushed commit',
   'How should you undo a mistaken commit already used by teammates? 0: Create and review a revert commit. 1: Reset hard and force push immediately. 2: Delete the remote branch.',
   'multiple_choice', 'Option 0 preserves shared history by adding a commit that reverses the mistake.', 1)
on conflict (id) do update set
  lesson_id = excluded.lesson_id, title = excluded.title, prompt_md = excluded.prompt_md,
  kind = excluded.kind, solution_explanation = excluded.solution_explanation, position = excluded.position;

insert into public.challenge_test_cases (id, challenge_id, label, input, expected_output, position) values
  ('react-effects-answer', 'react-effects-cleanup', 'Correct option index', '{"answerIndex":1}', '1', 1),
  ('ts-narrowing-answer', 'ts-narrowing-union', 'Correct option index', '{"answerIndex":0}', '0', 1),
  ('js-async-answer', 'js-async-parallel', 'Correct option index', '{"answerIndex":2}', '2', 1),
  ('sql-joins-answer', 'sql-joins-filter', 'Correct option index', '{"answerIndex":1}', '1', 1),
  ('api-errors-answer', 'api-errors-validation', 'Correct option index', '{"answerIndex":2}', '2', 1),
  ('git-recovery-answer', 'git-recovery-shared', 'Correct option index', '{"answerIndex":0}', '0', 1)
on conflict (id) do update set
  challenge_id = excluded.challenge_id, label = excluded.label, input = excluded.input,
  expected_output = excluded.expected_output, position = excluded.position;

insert into public.achievements (id, title, description, metric, threshold) values
  ('first-lesson', 'First step', 'Complete your first lesson.', 'lessons_completed', 1),
  ('six-foundations', 'Six foundations', 'Complete all six Phase 1 lessons.', 'lessons_completed', 6),
  ('focused-hour', 'Focused hour', 'Record sixty minutes of practice.', 'practice_minutes', 60)
on conflict (id) do update set
  title = excluded.title, description = excluded.description,
  metric = excluded.metric, threshold = excluded.threshold;

commit;
