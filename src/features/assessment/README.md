# Phase 4 diagnostics and adaptive recommendations

Mount the default `Assessments` export with `{ navigate: (path: string) => void }`.
Lesson navigation uses `lesson/<id>`. The page needs no progress provider and awards
no XP, streak activity, completion, or credentials. Every technology is available
independently, including React before JavaScript. Each has three distinct concepts.
Scores describe this small concept sample, never verified coding mastery.

## Dashboard integration

```ts
import { readAssessments, type AssessmentSnapshot } from './features/assessment'

const snapshot: AssessmentSnapshot = await readAssessments()
const reactSignal = snapshot.assessedScores.react // undefined = unassessed; 0 = assessed
const next = snapshot.recommendations[0] // absent when no latest missed topics
// navigate(`lesson/${next.lessonId}`) when the user selects a recommendation
```

Handle rejection visibly; do not translate failed reads into an empty saved history.
Read again when entering the dashboard or after an assessment saves. There is no
module-level score cache or account cache. `readAssessments()` uses the parent's
`loadFeature('assessments', 'diagnostics', fallback)`; writes use `saveFeature`.
The parent helper owns session scope, RLS, and local fallback. In local mode the key
is `devly.assessments.diagnostics.v1`. No credentials are needed by this feature.

`AssessmentSnapshot` contains timestamped `attempts`, `latestAttempts`,
`assessedScores: AssessedScores`, and `recommendations: AssessmentRecommendation[]`.
Latest means timestamp, with ID as a deterministic tie-breaker, not the best score.
Every attempt retains its question-bank version and exact option indices.
Validation rejects malformed histories and unsupported versions, and recomputes
derived scores/topics from answers. Question changes require a version migration.

`assessedScores(state)`, `recommendAssessments(state)`, `assessmentSnapshot(state)`,
and `scoreAssessment(technology, answers)` are pure helpers. Pass validated state
to selectors. Recommendations use only missed topics from the latest attempt for
each technology, map to the six existing lesson IDs, and rank weaker scores first
with stable technology order for ties. A new perfect attempt clears that technology's
recommendation; other technologies retain theirs. Nothing creates prerequisite locks.

Saving rereads and validates history before appending. Retrying a save with the same
attempt ID is idempotent; deliberate retakes get new IDs and no rewards. Save failures
leave the result visible with a retry button. Leaving an unsaved result discards that
in-memory result. Storage errors do not trigger a destructive reset. The parent's
load/save API does not provide atomic compare-and-swap: simultaneous writes from
multiple tabs/devices may still race. Atomic merging belongs in the parent storage
layer if required; this feature does not claim transactional multi-device writes.

Scoped checks: `npm test -- src/features/assessment` and
`npx eslint src/features/assessment`. The shared project typecheck also validates
the parent storage helper contract. Route wiring is intentionally left to the parent.
