import { diagnostics, QUESTION_VERSION, recommendationLessons, technologies, type AssessmentTechnology } from './content'

export interface DiagnosticResult {
  correct: number
  total: number
  /** Rounded 0–100 concept diagnostic signal; never coding mastery or completion credit. */
  score: number
  wrongTopics: string[]
}
export interface AssessmentAttempt extends DiagnosticResult {
  id: string
  technology: AssessmentTechnology
  questionVersion: number
  answers: number[]
  createdAt: string
}
export interface AssessmentState { version: 1; attempts: AssessmentAttempt[] }
/** Missing technology means unassessed, distinct from a genuine score of zero. */
export type AssessedScores = Partial<Record<AssessmentTechnology, number>>
export interface AssessmentRecommendation {
  technology: AssessmentTechnology
  lessonId: typeof recommendationLessons[AssessmentTechnology]
  attemptId: string
  score: number
  wrongTopics: string[]
  reason: 'targeted-review'
}
export interface AssessmentSnapshot extends AssessmentState {
  assessedScores: AssessedScores
  latestAttempts: Partial<Record<AssessmentTechnology, AssessmentAttempt>>
  recommendations: AssessmentRecommendation[]
}

export function emptyAssessments(): AssessmentState { return { version: 1, attempts: [] } }

export function isAssessmentTechnology(value: unknown): value is AssessmentTechnology {
  return typeof value === 'string' && technologies.some(technology => technology === value)
}

/** Pure, exact option checks. Partial, out-of-range, and extra answers are rejected. */
export function scoreAssessment(technology: AssessmentTechnology, answers: readonly number[]): DiagnosticResult {
  if (!isAssessmentTechnology(technology)) throw new Error('Unknown assessment technology.')
  const questions = diagnostics[technology]
  if (!Array.isArray(answers) || answers.length !== questions.length || !questions.every((question, index) => Number.isInteger(answers[index]) && answers[index] >= 0 && answers[index] < question.options.length)) {
    throw new Error('Answer every question with a valid option before submitting.')
  }
  const wrongTopics = questions.filter((question, index) => question.answer !== answers[index]).map(question => question.topic)
  const correct = questions.length - wrongTopics.length
  return { correct, total: questions.length, score: Math.round(correct / questions.length * 100), wrongTopics }
}

export function createAttempt(technology: AssessmentTechnology, answers: readonly number[], id: string, now: Date): AssessmentAttempt {
  if (!id.trim() || !Number.isFinite(now.getTime())) throw new Error('Invalid assessment identity or timestamp.')
  return { id, technology, questionVersion: QUESTION_VERSION, answers: [...answers], createdAt: now.toISOString(), ...scoreAssessment(technology, answers) }
}

/** Reject an unreadable history as a whole; recompute derived fields rather than trusting saved scores. */
export function validateAssessments(input: unknown): AssessmentState {
  if (!input || typeof input !== 'object') throw new Error('Saved assessments are invalid.')
  const state = input as Record<string, unknown>
  if (state.version !== 1 || !Array.isArray(state.attempts)) throw new Error('Saved assessment version or history is unsupported.')
  const ids = new Set<string>()
  const attempts = state.attempts.map((value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('Saved assessment attempt is invalid.')
    const item = value as Record<string, unknown>
    if (typeof item.id !== 'string' || !item.id.trim() || ids.has(item.id) || !isAssessmentTechnology(item.technology) || item.questionVersion !== QUESTION_VERSION || typeof item.createdAt !== 'string' || !Array.isArray(item.answers)) {
      throw new Error('Saved assessment attempt is invalid or uses an unsupported question version.')
    }
    const date = new Date(item.createdAt)
    if (!Number.isFinite(date.getTime()) || date.toISOString() !== item.createdAt) throw new Error('Saved assessment timestamp is invalid.')
    ids.add(item.id)
    return createAttempt(item.technology, item.answers, item.id, date)
  })
  return { version: 1, attempts }
}

/** Latest by timestamp, then ID for deterministic ties; scores never leak between technologies. */
export function latestAttempts(state: AssessmentState): AssessmentSnapshot['latestAttempts'] {
  const latest: AssessmentSnapshot['latestAttempts'] = {}
  for (const attempt of state.attempts) {
    const previous = latest[attempt.technology]
    if (!previous || attempt.createdAt > previous.createdAt || (attempt.createdAt === previous.createdAt && attempt.id > previous.id)) latest[attempt.technology] = attempt
  }
  return latest
}

export function assessedScores(state: AssessmentState): AssessedScores {
  return Object.fromEntries(Object.entries(latestAttempts(state)).map(([technology, attempt]) => [technology, attempt.score]))
}

/** Pure advisory ranking: weakest latest signal first, stable technology order on ties. No prerequisites or locks. */
export function recommendAssessments(state: AssessmentState): AssessmentRecommendation[] {
  const latest = latestAttempts(state)
  return technologies.flatMap(technology => {
    const attempt = latest[technology]
    return !attempt || !attempt.wrongTopics.length ? [] : [{ technology, lessonId: recommendationLessons[technology], attemptId: attempt.id, score: attempt.score, wrongTopics: [...attempt.wrongTopics], reason: 'targeted-review' as const }]
  }).sort((a, b) => a.score - b.score || technologies.indexOf(a.technology) - technologies.indexOf(b.technology))
}

export function assessmentSnapshot(state: AssessmentState): AssessmentSnapshot {
  return { ...state, assessedScores: assessedScores(state), latestAttempts: latestAttempts(state), recommendations: recommendAssessments(state) }
}

/** Idempotent retry by attempt ID. Deliberate retakes use new IDs and never generate rewards. */
export function appendAttempt(state: AssessmentState, attempt: AssessmentAttempt): AssessmentState {
  const previous = state.attempts.find(item => item.id === attempt.id)
  if (previous) {
    if (JSON.stringify(previous) !== JSON.stringify(attempt)) throw new Error('Assessment attempt ID already belongs to a different result.')
    return state
  }
  return { version: 1, attempts: [...state.attempts, attempt] }
}
