import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadFeature, saveFeature } from '../../lib/featureStorage'
import { createAttempt, emptyAssessments } from './model'
import { ASSESSMENT_STORAGE_KEY, readAssessments, saveAssessment } from './repository'

vi.mock('../../lib/featureStorage', () => ({ loadFeature: vi.fn(), saveFeature: vi.fn() }))
const load = vi.mocked(loadFeature)
const save = vi.mocked(saveFeature)
const attempt = createAttempt('react', [1, 0, 0], 'attempt', new Date('2026-10-25T00:00:00.000Z'))

beforeEach(() => { load.mockReset(); save.mockReset(); load.mockResolvedValue(emptyAssessments()); save.mockResolvedValue(undefined) })

describe('async assessment storage', () => {
  it('loads through the parent helper with an empty fallback and derived dashboard data', async () => {
    expect((await readAssessments()).assessedScores).toEqual({})
    expect(load).toHaveBeenCalledWith('assessments', 'diagnostics', { version: 1, attempts: [] })
    load.mockResolvedValue({ version: 1, attempts: [attempt] })
    expect(await readAssessments()).toMatchObject({ assessedScores: { react: 33 }, recommendations: [{ lessonId: 'react-effects' }] })
  })

  it('rereads and preserves other attempts, storing no dashboard cache or rewards', async () => {
    const existing = createAttempt('sql', [1, 2, 0], 'sql', new Date('2026-10-24T00:00:00.000Z'))
    load.mockResolvedValue({ version: 1, attempts: [existing] })
    expect((await saveAssessment(attempt)).assessedScores).toEqual({ react: 33, sql: 100 })
    expect(save).toHaveBeenCalledWith('assessments', ASSESSMENT_STORAGE_KEY, { version: 1, attempts: [existing, attempt] })
  })

  it('never writes when a read fails or a saved history is invalid', async () => {
    load.mockRejectedValueOnce(new Error('Offline'))
    await expect(saveAssessment(attempt)).rejects.toThrow('Offline')
    load.mockResolvedValue({ version: 1, attempts: [{ id: 'broken' }] })
    await expect(saveAssessment(attempt)).rejects.toThrow('invalid')
    expect(save).not.toHaveBeenCalled()
  })

  it('surfaces failed writes and supports an idempotent retry after an ambiguous response', async () => {
    save.mockRejectedValueOnce(new Error('Connection lost'))
    await expect(saveAssessment(attempt)).rejects.toThrow('Connection lost')
    load.mockResolvedValue({ version: 1, attempts: [attempt] })
    expect((await saveAssessment(attempt)).attempts).toHaveLength(1)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('never caches data across parent storage sessions', async () => {
    load.mockResolvedValueOnce({ version: 1, attempts: [attempt] }).mockResolvedValueOnce(emptyAssessments())
    expect((await readAssessments()).assessedScores.react).toBe(33)
    expect((await readAssessments()).assessedScores.react).toBeUndefined()
  })
})
