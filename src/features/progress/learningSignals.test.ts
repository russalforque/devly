import { describe, expect, it } from 'vitest'
import { emptyAssessments, assessmentSnapshot, createAttempt, appendAttempt } from '../assessment/model'
import { evidenceScores, suggestedDifficulty } from './learningSignals'
import { codingStats, initialCodingState, type Attempt } from '../coding/model'

function attempt(overrides: Partial<Attempt> = {}): Attempt {
  return { id: crypto.randomUUID(), challengeId: 'group-transactions', passed: true, assisted: false, language: 'javascript', code: '', result: { tests: [], logs: [], durationMs: 1 }, createdAt: new Date().toISOString(), seconds: 60, ...overrides }
}
describe('independent learning signals', () => {
  it('keeps every technology unassessed when no evidence exists', () => {
    expect(Object.values(evidenceScores(null, initialCodingState)).every(score => score === null)).toBe(true)
  })
  it('keeps a zero baseline distinct from missing evidence and does not affect other technologies', () => {
    const failed = createAttempt('react', [0, 0, 0], 'diagnostic-one', new Date())
    const snapshot = assessmentSnapshot(appendAttempt(emptyAssessments(), failed))
    const scores = evidenceScores(snapshot, initialCodingState)
    expect(scores.react).toBe(Math.round(failed.score * .4))
    expect(scores.typescript).toBeNull()
  })
  it('deduplicates coding rewards and excludes solution-assisted passes', () => {
    const coding = { drafts: {}, attempts: [attempt(), attempt(), attempt({ challengeId: 'merge-intervals', assisted: true })] }
    expect(codingStats(coding)).toMatchObject({ completed: 1, xp: 100, minutes: 3 })
  })
  it('adapts recommendations to recent results without locking any level', () => {
    expect(suggestedDifficulty(initialCodingState)).toBe('Intermediate')
    expect(suggestedDifficulty({ drafts: {}, attempts: [attempt({ passed: false })] })).toBe('Beginner')
    expect(suggestedDifficulty({ drafts: {}, attempts: [attempt(), attempt()] })).toBe('Advanced')
  })
})
