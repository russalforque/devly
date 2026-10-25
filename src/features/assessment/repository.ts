import { loadFeature, saveFeature } from '../../lib/featureStorage'
import { appendAttempt, assessmentSnapshot, emptyAssessments, validateAssessments, type AssessmentAttempt, type AssessmentSnapshot } from './model'

export const ASSESSMENT_STORAGE_KEY = 'diagnostics'

/** Async dashboard entry point. Rejects load/validation errors; absence alone returns an empty snapshot. */
export async function readAssessments(): Promise<AssessmentSnapshot> {
  const value = await loadFeature<unknown>('assessments', ASSESSMENT_STORAGE_KEY, emptyAssessments())
  return assessmentSnapshot(validateAssessments(value))
}

/** Re-read before writes, so load failures cannot overwrite history. Same-ID retries are harmless. */
export async function saveAssessment(attempt: AssessmentAttempt): Promise<AssessmentSnapshot> {
  const validated = validateAssessments({ version: 1, attempts: [attempt] }).attempts[0]
  const current = await readAssessments()
  const next = appendAttempt({ version: 1, attempts: current.attempts }, validated)
  if (!current.attempts.some(item => item.id === validated.id)) await saveFeature('assessments', ASSESSMENT_STORAGE_KEY, next)
  return assessmentSnapshot(next)
}
