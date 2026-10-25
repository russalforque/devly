import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadFeature, saveFeature } from '../../lib/featureStorage'
import InterviewsPage from './InterviewsPage'
import { questions } from './content'
import { emptyInterviews, startAttempt } from './model'

vi.mock('../../lib/featureStorage', () => ({ loadFeature: vi.fn(), saveFeature: vi.fn() }))
let host: HTMLDivElement
let root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.open = true } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.open = false } })
  vi.mocked(loadFeature).mockImplementation(async (_feature, _key, fallback) => structuredClone(fallback))
  vi.mocked(saveFeature).mockResolvedValue(undefined)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers() })
async function render() { await act(async () => root.render(<InterviewsPage navigate={vi.fn()} />)) }
async function click(text: string) {
  const button = [...host.querySelectorAll('button')].find(b => b.textContent === text)
  expect(button, `Button ${text}`).toBeTruthy()
  await act(async () => button!.click())
}

describe('interview interaction and persistence', () => {
  it('renders one question and reveals practice references only after an explicit click', async () => {
    await render(); await click('Start session')
    expect(host.querySelectorAll('textarea')).toHaveLength(1)
    expect(host.textContent).not.toContain(questions[0].sample)
    await click('Reveal reference answer')
    expect(host.textContent).toContain(questions[0].sample)
    await click('Skip question')
    expect(host.textContent).not.toContain(questions[0].sample)
    expect(host.textContent).not.toContain(questions[1].sample)
    await click('Previous')
    expect(host.textContent).toContain(questions[0].sample)
  })
  it('keeps timed references hidden until confirmed submission and starts an empty retry', async () => {
    vi.mocked(loadFeature).mockResolvedValue({ ...emptyInterviews, active: startAttempt('frontend', 'timed', Date.now(), 'timed') })
    await render()
    expect(host.textContent).not.toContain('Reveal reference answer')
    expect(host.textContent).not.toContain(questions[0].sample)
    await click('Submit interview')
    expect(host.textContent).not.toContain(questions[0].sample)
    await click('Submit and review')
    expect(host.textContent).toContain(questions[0].sample)
    expect(host.textContent).toContain('Not rated')
    expect(host.querySelector('textarea')).toBeNull()
    await click('Retry this category')
    expect(host.querySelector('textarea')?.value).toBe('')
    expect(host.textContent).not.toContain(questions[0].sample)
  })
  it('automatically submits an expired saved interview without restarting its timer', async () => {
    vi.useFakeTimers()
    vi.mocked(loadFeature).mockResolvedValue({ ...emptyInterviews, active: startAttempt('frontend', 'timed', Date.now() - 800_000, 'expired') })
    await render()
    await act(async () => { await vi.advanceTimersByTimeAsync(250) })
    expect(host.textContent).toContain('Time expired')
    expect(host.querySelector('textarea')).toBeNull()
    expect(vi.mocked(saveFeature).mock.calls.at(-1)?.[2]).toMatchObject({ active: null, history: [{ reason: 'timeout' }] })
  })
  it('blocks edits after corrupt storage and reloads only on explicit retry', async () => {
    vi.mocked(loadFeature).mockResolvedValueOnce({ version: 77 })
    await render()
    expect(host.textContent).toContain('Editing is disabled')
    expect(host.textContent).not.toContain('Start session')
    expect(saveFeature).not.toHaveBeenCalled()
    await click('Retry load')
    expect(host.textContent).toContain('Start session')
    expect(saveFeature).not.toHaveBeenCalled()
  })
  it('retains a draft after a save failure and retries the current snapshot', async () => {
    vi.mocked(saveFeature).mockRejectedValueOnce(new Error('Offline'))
    await render(); await click('Start session')
    expect(host.textContent).toContain('Changes are in memory only')
    expect(host.querySelector('textarea')).not.toBeNull()
    await click('Retry save')
    expect(host.textContent).not.toContain('Offline')
    expect(vi.mocked(saveFeature).mock.calls.at(-1)?.slice(0, 2)).toEqual(['interviews', 'workspace'])
    expect(vi.mocked(saveFeature).mock.calls.at(-1)?.[2]).toMatchObject({ active: { category: 'frontend' } })
  })
})
