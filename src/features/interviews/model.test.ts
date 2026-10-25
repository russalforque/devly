import { describe, expect, it } from 'vitest'
import { categories, questions, type Category } from './content'
import { emptyInterviews, MAX_HISTORY, selfAssessment, startAttempt, submitAttempt, transition, validateInterviews, type InterviewState } from './model'

const started = 1_800_000_000_000
function draft(mode: 'practice' | 'timed' = 'practice'): InterviewState { return { ...emptyInterviews, active: startAttempt('frontend', mode, started, 'attempt-1') } }

describe('interview evidence and lifecycle', () => {
  it('provides distinct question sets for every supported category', () => {
    expect(new Set(questions.map(q => q.id)).size).toBe(24)
    for (const category of Object.keys(categories) as Category[]) {
      const attempt = startAttempt(category, 'timed', started, category)
      expect(attempt.questionIds).toHaveLength(3)
      expect(validateInterviews({ ...emptyInterviews, active: attempt }).active).toEqual(attempt)
    }
  })
  it('does not infer correctness or ratings from response length or reference text', () => {
    const state = transition(draft(), { type: 'answer', text: questions[0].sample }, started)
    const result = selfAssessment(submitAttempt(state, started + 100).history[0])
    expect(result).toEqual({ answered: 1, rated: 0, possible: 9, average: null, revealed: 0 })
  })
  it('counts explicit zero ratings, excludes unrated criteria and preserves unanswered responses', () => {
    let state = submitAttempt(draft(), started + 100)
    state = transition(state, { type: 'rate', id: 'attempt-1', question: 0, criterion: 0, value: 0 }, started)
    state = transition(state, { type: 'rate', id: 'attempt-1', question: 1, criterion: 2, value: 2 }, started)
    expect(selfAssessment(state.history[0])).toMatchObject({ answered: 0, rated: 2, average: 1 })
    state = transition(state, { type: 'rate', id: 'attempt-1', question: 1, criterion: 2, value: null }, started)
    expect(selfAssessment(state.history[0])).toMatchObject({ rated: 1, average: 0 })
  })
  it('allows explicit practice reveals but rejects timed reveals', () => {
    expect(transition(draft(), { type: 'reveal' }, started).active!.responses[0].revealed).toBe(true)
    expect(transition(draft('timed'), { type: 'reveal' }, started).active!.responses[0].revealed).toBe(false)
  })
  it('submits an expired restored draft at its deadline before accepting a late keystroke', () => {
    const initial = transition(draft('timed'), { type: 'answer', text: 'Before expiry' }, started + 1)
    const restored = validateInterviews(JSON.parse(JSON.stringify(initial)))
    const state = transition(restored, { type: 'answer', text: 'Too late' }, started + 900_000)
    expect(state.active).toBeNull()
    expect(state.history[0]).toMatchObject({ submittedAt: started + 720_000, reason: 'timeout' })
    expect(state.history[0].responses[0].text).toBe('Before expiry')
    expect(transition(state, { type: 'tick' }, started + 999_000)).toBe(state)
  })
  it('expires at the exact boundary and permits submission immediately before it', () => {
    expect(submitAttempt(draft('timed'), started + 719_999).history[0].reason).toBe('submitted')
    expect(submitAttempt(draft('timed'), started + 720_000).history[0].reason).toBe('timeout')
  })
  it('locks submitted writing, preserves answers across navigation, and starts retries clean', () => {
    let state = transition(draft(), { type: 'answer', text: 'My original answer' }, started)
    state = transition(state, { type: 'move', index: 2 }, started)
    state = transition(state, { type: 'move', index: 0 }, started)
    expect(state.active!.responses[0].text).toBe('My original answer')
    state = submitAttempt(state, started + 100)
    expect(transition(state, { type: 'answer', text: 'Revision' }, started)).toBe(state)
    const retry = startAttempt('frontend', 'practice', started + 200, 'retry')
    expect(retry.responses.every(r => !r.text && !r.revealed && r.ratings.every(v => v === null))).toBe(true)
    expect(state.history[0].responses[0].text).toBe('My original answer')
  })
  it('bounds history and does not mutate existing attempts', () => {
    let state: InterviewState = emptyInterviews
    for (let i = 0; i < 35; i++) state = submitAttempt({ ...state, active: startAttempt('backend', 'practice', started, `session-${i}`) }, started + i)
    expect(state.history).toHaveLength(MAX_HISTORY)
    expect(state.history[0].id).toBe('session-34')
    expect(emptyInterviews.history).toHaveLength(0)
  })
})

describe('interview storage validation', () => {
  it.each([
    null, {}, { ...emptyInterviews, version: 2 }, { ...emptyInterviews, active: {} },
    { ...draft(), active: { ...draft().active, index: -1 } },
    { ...draft(), active: { ...draft().active, category: '__proto__' } },
    { ...draft(), active: { ...draft().active, responses: [] } },
    { ...draft('timed'), active: { ...draft('timed').active, deadline: started + 1 } },
    { ...draft(), history: [draft().active] },
  ])('rejects malformed data without silently resetting it: %j', value => {
    expect(() => validateInterviews(value)).toThrow('not been replaced')
  })
  it('rejects invented ratings, duplicate IDs, mixed-category questions and impossible completion times', () => {
    const valid = submitAttempt(draft(), started + 1)
    for (const mutate of [
      (s: InterviewState) => { s.history[0].responses[0].ratings[0] = 3 as never },
      (s: InterviewState) => { s.history.push(s.history[0]) },
      (s: InterviewState) => { s.history[0].questionIds[0] = 'db-index' },
      (s: InterviewState) => { s.history[0].submittedAt = started - 1 },
    ]) { const copy = structuredClone(valid); mutate(copy); expect(() => validateInterviews(copy)).toThrow() }
    expect(validateInterviews(valid)).toEqual(valid)
  })
})
