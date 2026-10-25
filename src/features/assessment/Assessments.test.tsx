import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadFeature, saveFeature } from '../../lib/featureStorage'
import Assessments from './Assessments'
import { readAssessments } from './repository'
import { emptyAssessments, type AssessmentState } from './model'

vi.mock('../../lib/featureStorage', () => ({ loadFeature: vi.fn(), saveFeature: vi.fn() }))
let container: HTMLDivElement
let root: Root
let stored: AssessmentState
const navigate = vi.fn()

function button(label: string) {
  const found = [...container.querySelectorAll('button')].find(item => item.textContent?.trim() === label || item.getAttribute('aria-label') === label)
  if (!found) throw new Error(`Missing button: ${label}`)
  return found
}
async function click(element: HTMLElement) { await act(async () => element.click()) }
async function mount() { await act(async () => root.render(<Assessments navigate={navigate} />)) }
async function answer(values: number[]) {
  const fields = container.querySelectorAll('fieldset')
  for (const [index, choice] of values.entries()) await click(fields[index].querySelectorAll<HTMLInputElement>('input')[choice])
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  stored = emptyAssessments()
  vi.mocked(loadFeature).mockReset().mockImplementation(async () => structuredClone(stored))
  vi.mocked(saveFeature).mockReset().mockImplementation(async (_feature, _key, value) => { stored = structuredClone(value as AssessmentState) })
  navigate.mockReset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals() })

describe('assessment page', () => {
  it('completes an independent baseline, explains misses, navigates to its lesson, and restores latest scores', async () => {
    await mount()
    expect(container.querySelectorAll('.assessment-card')).toHaveLength(6)
    expect(container.textContent).toContain('not proof of coding mastery')
    await click(button('Start React diagnostic'))
    expect(button('Get diagnostic result').disabled).toBe(true)
    await answer([1, 0, 0])
    await click(button('Get diagnostic result'))
    expect(container.textContent).toContain('33%')
    expect(container.textContent).toContain('Correct answer:')
    expect(container.textContent).toContain('Diagnostic saved.')
    expect(container.querySelectorAll('.assessment-review')).toHaveLength(3)
    expect(document.activeElement?.textContent).toBe('React diagnostic result')
    expect((await readAssessments()).assessedScores).toEqual({ react: 33 })
    await click(button('Open recommended lesson'))
    expect(navigate).toHaveBeenCalledWith('lesson/react-effects')
    await act(async () => root.unmount())
    root = createRoot(container)
    await mount()
    expect(button('Retake React diagnostic')).toBeTruthy()
    expect(container.querySelectorAll('.assessment-score')[1].textContent).toBe('Not assessed')
    expect(container.textContent).toContain('Review: Reactive dependencies, Effect cleanup.')
  })

  it('retakes clear prior answers and latest gaps without awarding rewards', async () => {
    await mount()
    await click(button('Start TypeScript diagnostic'))
    await answer([1, 0, 0])
    await click(button('Get diagnostic result'))
    await click(button('Retake diagnostic'))
    expect(container.querySelectorAll('input:checked')).toHaveLength(0)
    await answer([0, 2, 1])
    await click(button('Get diagnostic result'))
    expect(stored.attempts).toHaveLength(2)
    expect(stored.attempts[0].id).not.toBe(stored.attempts[1].id)
    expect(stored.attempts[1]).not.toHaveProperty('xp')
    expect(container.textContent).toContain('No gaps detected in this small sample')
    expect((await readAssessments()).recommendations).toEqual([])
    await click(button('Back to all diagnostics'))
    expect(container.textContent).toContain('100%')
  })

  it('keeps failed saves visible, blocks duplicate submits, and retries the same attempt', async () => {
    vi.mocked(saveFeature).mockRejectedValueOnce(new Error('Storage full'))
    await mount()
    await click(button('Start Git & engineering diagnostic'))
    await answer([2, 1, 0])
    const submit = button('Get diagnostic result')
    await act(async () => { submit.click(); submit.click() })
    expect(vi.mocked(saveFeature)).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('Storage full')
    expect(container.textContent).toContain('This result has not been saved')
    expect(stored.attempts).toHaveLength(0)
    const failedId = (vi.mocked(saveFeature).mock.calls[0][2] as AssessmentState).attempts[0].id
    await click(button('Retry saving'))
    expect(stored.attempts).toHaveLength(1)
    expect(stored.attempts[0].id).toBe(failedId)
    expect(container.textContent).toContain('Diagnostic saved.')
  })

  it('shows load failures without replacing history and supports retry', async () => {
    vi.mocked(loadFeature).mockRejectedValueOnce(new Error('Permission denied'))
    await mount()
    expect(container.textContent).toContain('Could not load your diagnostics')
    expect(container.textContent).toContain('Your saved history has not been replaced')
    expect(vi.mocked(saveFeature)).not.toHaveBeenCalled()
    await click(button('Retry loading'))
    expect(container.querySelectorAll('.assessment-card')).toHaveLength(6)
  })
})
