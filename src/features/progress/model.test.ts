import { describe, expect, it } from 'vitest'
import { lessons } from '../curriculum/content'
import { calculateStreak, dayKey, emptyState, getStats, recordCheck, validateState } from './model'

const today = new Date(2026, 9, 24, 12)
const correctAnswers = lessons[0].questions.map(question => question.answer)

describe('learning evidence', () => {
  it('starts with no fabricated progress, XP, mastery, or streak', () => {
    expect(getStats(emptyState, today)).toMatchObject({ xp: 0, minutes: 0, completed: 0, streak: 0, accuracy: null, reviews: [] })
  })
  it('records failure without rewarding XP or completing a lesson', () => {
    const state = recordCheck(emptyState, 'react-effects', [0, 0], 3, today)
    expect(state.events[0]).toMatchObject({ kind: 'check_failed', xp: 0, minutes: 3 })
    expect(state.progress[0].status).toBe('started')
    expect(getStats(state, today)).toMatchObject({ accuracy: 0, completed: 0, streak: 0 })
  })
  it('requires every answer, awards XP once, and records repeat practice', () => {
    const incomplete = recordCheck(emptyState, 'react-effects', [correctAnswers[0]], 1, today)
    expect(incomplete.events[0].xp).toBe(0)
    const completed = recordCheck(incomplete, 'react-effects', correctAnswers, 12, today)
    const repeated = recordCheck(completed, 'react-effects', correctAnswers, 2, today)
    expect(repeated.progress).toHaveLength(1)
    expect(repeated.events.at(-1)?.kind).toBe('practice')
    expect(getStats(repeated, today)).toMatchObject({ xp: 50, completed: 1, minutes: 15, accuracy: 67, streak: 1 })
  })
  it('does not undo a past completion or postpone review after a failed check', () => {
    const completed = recordCheck(emptyState, 'react-effects', correctAnswers, 4, new Date(2026, 9, 20, 12))
    const failed = recordCheck(completed, 'react-effects', [0, 0], 2, today)
    expect(failed.progress[0].status).toBe('completed')
    expect(failed.progress[0].updated_at).toBe(completed.progress[0].updated_at)
    expect(getStats(failed, today).reviews).toHaveLength(1)
  })
  it('preserves yesterday’s streak until today ends and resets after a gap', () => {
    let state = recordCheck(emptyState, 'react-effects', correctAnswers, 2, new Date(2026, 9, 22, 12))
    state = recordCheck(state, 'react-effects', correctAnswers, 2, new Date(2026, 9, 23, 12))
    expect(calculateStreak(state.events, today)).toBe(2)
    expect(calculateStreak(state.events, new Date(2026, 9, 25, 12))).toBe(0)
  })
  it('uses local calendar days rather than UTC slices', () => {
    expect(dayKey(new Date(2026, 0, 2, 0, 5))).toBe('2026-01-02')
  })
  it('schedules a review after three days and clears it after a successful review', () => {
    const completed = recordCheck(emptyState, 'react-effects', correctAnswers, 3, new Date(2026, 9, 21, 12))
    expect(getStats(completed, today).reviews).toHaveLength(1)
    const reviewed = recordCheck(completed, 'react-effects', correctAnswers, 1, today)
    expect(getStats(reviewed, today).reviews).toHaveLength(0)
  })
  it('rejects corrupt persisted data instead of replacing it with a blank account', () => {
    expect(() => validateState({ ...emptyState, events: [{ kind: 'fake' }] })).toThrow()
    expect(() => validateState({ ...emptyState, bookmarks: ['unknown-lesson'] })).toThrow()
    expect(() => validateState({ ...emptyState, profile: { display_name: '', daily_goal_minutes: 20 } })).toThrow()
    expect(() => validateState({ ...emptyState, progress: [{ lesson_id: 'react-effects', status: 'completed', answers: [1], updated_at: 'yesterday' }] })).toThrow()
    expect(validateState(JSON.parse(JSON.stringify(emptyState)))).toEqual(emptyState)
  })
  it('rejects unknown lessons and invalid time measurements', () => {
    expect(() => recordCheck(emptyState, 'unknown', [], 1)).toThrow()
    expect(() => recordCheck(emptyState, 'react-effects', correctAnswers, -1)).toThrow()
    expect(() => recordCheck(emptyState, 'react-effects', correctAnswers, NaN)).toThrow()
  })
})

describe('curriculum integrity', () => {
  it('has unique lesson IDs and unambiguous answer keys', () => {
    expect(new Set(lessons.map(lesson => lesson.id)).size).toBe(lessons.length)
    for (const lesson of lessons) {
      expect(lesson.questions.length).toBeGreaterThanOrEqual(2)
      for (const question of lesson.questions) {
        expect(question.options[question.answer]).toBeTruthy()
        expect(new Set(question.options).size).toBe(question.options.length)
        expect(question.explanation.length).toBeGreaterThan(30)
      }
    }
  })
})
