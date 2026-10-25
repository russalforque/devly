import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAttempt } from './model'
import { readAssessments, saveAssessment } from './repository'

// Exercise the real parent feature storage helper in its credential-free local mode.
vi.mock('../../lib/supabase', () => ({ supabase: null }))
const key = 'devly.assessments.diagnostics.v1'
const now = new Date('2026-10-25T01:00:00.000Z')

beforeEach(() => localStorage.clear())

describe('local persistence integration', () => {
  it('persists timestamped attempts and restores independent latest scores without touching lesson progress', async () => {
    localStorage.setItem('devly.workspace.v1', 'existing lesson progress')
    await saveAssessment(createAttempt('react', [1, 0, 0], 'react', now))
    await saveAssessment(createAttempt('node', [1, 2, 0], 'node', now))
    const restored = await readAssessments()
    expect(restored.assessedScores).toEqual({ react: 33, node: 100 })
    expect(restored.attempts.map(item => item.createdAt)).toEqual([now.toISOString(), now.toISOString()])
    expect(JSON.parse(localStorage.getItem(key)!).attempts).toHaveLength(2)
    expect(localStorage.getItem('devly.workspace.v1')).toBe('existing lesson progress')
  })

  it.each(['{invalid json', '{"version":1,"attempts":[{"broken":true}]}'])('preserves corrupt stored data when a save is attempted', async raw => {
    localStorage.setItem(key, raw)
    await expect(saveAssessment(createAttempt('git', [2, 1, 0], 'git', now))).rejects.toThrow()
    expect(localStorage.getItem(key)).toBe(raw)
  })

  it('propagates browser quota errors without reporting an in-memory result as persisted', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new DOMException('Quota exceeded', 'QuotaExceededError') })
    await expect(saveAssessment(createAttempt('sql', [1, 2, 0], 'sql', now))).rejects.toThrow('Quota exceeded')
    expect((await readAssessments()).attempts).toEqual([])
  })
})
