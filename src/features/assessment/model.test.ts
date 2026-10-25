import { describe, expect, it } from 'vitest'
import { lessons } from '../curriculum/content'
import { diagnostics, recommendationLessons, technologies, type AssessmentTechnology } from './content'
import { appendAttempt, assessedScores, assessmentSnapshot, createAttempt, emptyAssessments, recommendAssessments, scoreAssessment, validateAssessments } from './model'

const first = new Date('2026-10-25T01:00:00.000Z')
const later = new Date('2026-10-25T02:00:00.000Z')

describe('independent technology diagnostics', () => {
  it.each<[AssessmentTechnology, number[]]>([
    ['react', [1, 1, 2]], ['typescript', [0, 2, 1]], ['javascript', [1, 0, 2]],
    ['sql', [1, 2, 0]], ['node', [1, 2, 0]], ['git', [2, 1, 0]],
  ])('checks the reviewed answer key for %s', (technology, answers) => {
    expect(scoreAssessment(technology, answers)).toEqual({ score: 100, correct: 3, total: 3, wrongTopics: [] })
    expect(diagnostics[technology]).toHaveLength(3)
    expect(new Set(diagnostics[technology].map(question => question.topic)).size).toBe(3)
    expect(lessons.find(lesson => lesson.id === recommendationLessons[technology])?.trackId).toBe(technology)
    for (const question of diagnostics[technology]) {
      expect(new Set(question.options).size).toBe(question.options.length)
      expect(question.explanation.length).toBeGreaterThan(30)
    }
  })

  it('reports exact missed concepts and rounded diagnostic scores', () => {
    expect(scoreAssessment('react', [1, 0, 0])).toEqual({ score: 33, correct: 1, total: 3, wrongTopics: ['Reactive dependencies', 'Effect cleanup'] })
    expect(scoreAssessment('sql', [1, 2, 1])).toEqual({ score: 67, correct: 2, total: 3, wrongTopics: ['Counting nullable matches'] })
  })

  it.each([[], [1, 1], [1, 1, 2, 0], [1, -1, 2], [1, 0.5, 2], [1, NaN, 2], [1, 3, 2], Array(3)])('rejects invalid or incomplete answers %j', answers => {
    expect(() => scoreAssessment('react', answers)).toThrow('Answer every question')
  })

  it('distinguishes unassessed from zero without prerequisite technologies', () => {
    const state = appendAttempt(emptyAssessments(), createAttempt('react', [0, 0, 0], 'react-only', first))
    expect(assessedScores(state)).toEqual({ react: 0 })
    expect(assessmentSnapshot(state).latestAttempts.javascript).toBeUndefined()
    expect(assessedScores(emptyAssessments())).toEqual({})
  })

  it('uses latest timestamp rather than highest score or array order, independently per technology', () => {
    const state = { version: 1 as const, attempts: [
      createAttempt('react', [0, 0, 0], 'new', later),
      createAttempt('sql', [1, 2, 0], 'sql', first),
      createAttempt('react', [1, 1, 2], 'old', first),
    ] }
    expect(assessedScores(state)).toEqual({ react: 0, sql: 100 })
    expect(recommendAssessments(state)).toMatchObject([{ technology: 'react', lessonId: 'react-effects', attemptId: 'new' }])
  })

  it('ranks targeted lessons by weakest latest signal and clears resolved gaps', () => {
    const state = { version: 1 as const, attempts: [
      createAttempt('react', [1, 0, 0], 'react', first),
      createAttempt('typescript', [1, 0, 0], 'ts', first),
      createAttempt('sql', [1, 0, 1], 'sql', first),
    ] }
    const original = JSON.stringify(state)
    expect(recommendAssessments(state).map(item => item.lessonId)).toEqual(['ts-narrowing', 'react-effects', 'sql-joins'])
    const improved = appendAttempt(state, createAttempt('typescript', [0, 2, 1], 'ts-fixed', later))
    expect(recommendAssessments(improved).map(item => item.technology)).toEqual(['react', 'sql'])
    expect(JSON.stringify(state)).toBe(original)
  })

  it('ties are stable, returned topic arrays are isolated, and all mappings target existing lessons', () => {
    const state = { version: 1 as const, attempts: technologies.map(technology => createAttempt(technology, diagnostics[technology].map(question => (question.answer + 1) % 3), technology, first)) }
    expect(recommendAssessments(state).map(item => item.technology)).toEqual([...technologies])
    recommendAssessments(state)[0].wrongTopics.push('consumer mutation')
    expect(state.attempts[0].wrongTopics).toHaveLength(3)
    const tie = createAttempt('react', [1, 1, 2], 'z', first)
    expect(assessedScores(appendAttempt(state, tie)).react).toBe(100)
  })

  it('retries are idempotent, retakes remain timestamped, and no reward fields are produced', () => {
    const attempt = createAttempt('git', [2, 1, 0], 'one', first)
    const once = appendAttempt(emptyAssessments(), attempt)
    expect(appendAttempt(once, attempt)).toBe(once)
    expect(() => appendAttempt(once, { ...attempt, answers: [0, 0, 0] })).toThrow('different result')
    const twice = appendAttempt(once, createAttempt('git', [2, 1, 0], 'two', later))
    expect(twice.attempts.map(item => item.createdAt)).toEqual([first.toISOString(), later.toISOString()])
    expect(twice).not.toHaveProperty('events')
    expect(twice.attempts[1]).not.toHaveProperty('xp')
  })
})

describe('assessment validation', () => {
  const attempt = createAttempt('react', [1, 0, 0], 'saved', first)
  it('recomputes scores and topics instead of trusting persisted derived data', () => {
    const state = validateAssessments({ version: 1, attempts: [{ ...attempt, score: 100, wrongTopics: [], xp: 500 }] })
    expect(state.attempts).toEqual([attempt])
  })
  it.each([
    null, {}, { version: 2, attempts: [] }, { version: 1, attempts: [null] },
    ...[{ technology: '__proto__' }, { questionVersion: 99 }, { createdAt: 'yesterday' }, { createdAt: '2026-02-31T00:00:00.000Z' }, { id: '' }, { answers: ['1', 0, 0] }, { answers: [1] }].map(patch => ({ version: 1, attempts: [{ ...attempt, ...patch }] })),
    { version: 1, attempts: [attempt, attempt] },
  ])('rejects malformed or incompatible saved history', input => {
    expect(() => validateAssessments(input)).toThrow()
  })
})
