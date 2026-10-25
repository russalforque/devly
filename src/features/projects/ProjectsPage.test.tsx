import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadFeature, saveFeature } from '../../lib/featureStorage'
import ProjectsPage from './ProjectsPage'
import { projects } from './content'
import { checklist, emptyProjects, updateProject } from './model'

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
afterEach(async () => { await act(async () => root.unmount()); host.remove() })
async function render() { await act(async () => root.render(<ProjectsPage navigate={vi.fn()} />)) }
async function click(text: string) {
  const button = [...host.querySelectorAll('button')].find(b => b.textContent === text)
  expect(button, `Button ${text}`).toBeTruthy()
  await act(async () => button!.click())
}

describe('project workflow', () => {
  it('offers six assignments, persists checklist and hints, and does not expose later hints early', async () => {
    await render()
    expect(host.querySelectorAll('article')).toHaveLength(6)
    await click('Open assignment')
    expect(host.textContent).not.toContain(projects[0].hints[0])
    await click('Reveal hint 1 of 3')
    expect(host.textContent).toContain(projects[0].hints[0])
    expect(host.textContent).not.toContain(projects[0].hints[1])
    await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click())
    await click('← All projects')
    await click('Continue project')
    expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true)
    expect(host.textContent).toContain(projects[0].hints[0])
    const complete = [...host.querySelectorAll('button')].find(b => b.textContent === 'Report project complete')!
    expect(complete.disabled).toBe(true)
    expect(vi.mocked(saveFeature).mock.calls.at(-1)?.slice(0, 2)).toEqual(['projects', 'workspace'])
  })
  it('records completion only after confirmation and reopens on an unchecked criterion', async () => {
    const p = projects[0]
    const ready = checklist(p).reduce((s, check) => updateProject(s, p.id, { type: 'check', check: check.id, checked: true }, 1), emptyProjects)
    vi.mocked(loadFeature).mockResolvedValue(ready)
    await render(); await click('Continue project'); await click('Report project complete')
    expect(saveFeature).not.toHaveBeenCalled()
    await click('Confirm self-reported completion')
    expect(host.textContent).toContain('Completion self-reported on')
    await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click())
    expect(host.textContent).not.toContain('Completion self-reported on')
    expect(host.textContent).toContain('1 checks remaining')
  })
  it('does not overwrite existing data after a load failure', async () => {
    vi.mocked(loadFeature).mockRejectedValueOnce(new Error('Permission denied'))
    await render()
    expect(host.textContent).toContain('Permission denied')
    expect(host.querySelectorAll('article')).toHaveLength(0)
    expect(saveFeature).not.toHaveBeenCalled()
    await click('Retry load')
    expect(host.querySelectorAll('article')).toHaveLength(6)
  })
  it('keeps current work on a save error and retries it', async () => {
    vi.mocked(saveFeature).mockRejectedValueOnce(new Error('Quota exceeded'))
    await render(); await click('Open assignment'); await click('Reveal hint 1 of 3')
    expect(host.textContent).toContain('Quota exceeded')
    expect(host.textContent).toContain(projects[0].hints[0])
    await click('Retry save')
    expect(host.textContent).not.toContain('Quota exceeded')
    expect(vi.mocked(saveFeature).mock.calls.at(-1)?.[2]).toMatchObject({ progress: { 'reading-queue': { hints: 1 } } })
  })
})
