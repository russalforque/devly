import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { STORAGE_KEY } from './features/progress/model'

let container: HTMLDivElement
let root: Root

async function settle() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); await vi.dynamicImportSettled() })
}

function button(label: string) {
  const element = [...container.querySelectorAll('button')].find(item => item.textContent?.trim() === label || item.getAttribute('aria-label') === label)
  if (!element) throw new Error(`Button not found: ${label}`)
  return element
}

async function click(element: HTMLElement) { await act(async () => element.click()); await settle() }
async function mount() { await act(async () => { root.render(<App />) }); await settle() }
function savedState() { return JSON.parse(localStorage.getItem(STORAGE_KEY)!) }

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  vi.stubGlobal('scrollTo', vi.fn())
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open') } })
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals() })

describe('Phase 1 learning flow', () => {
  it('opens a lesson, saves a bookmark, passes a check, and restores progress after remount', async () => {
    await mount()
    expect(container.textContent).toContain('Welcome in, developer')
    await click(button('Start learning'))
    expect(container.querySelector('h1')?.textContent).toBe('Effects without the side effects')
    expect(savedState().progress[0].status).toBe('started')
    expect(savedState().events).toHaveLength(0)
    await click(button('Save lesson'))
    expect(savedState().bookmarks).toEqual(['react-effects'])
    const choices = container.querySelectorAll<HTMLInputElement>('input[type="radio"]')
    await click(choices[1])
    await click(choices[5])
    await click(button('Check my understanding'))
    expect(container.textContent).toContain('That’s a concept worth keeping.')
    expect(savedState().events).toHaveLength(1)
    expect(savedState().events[0].xp).toBe(50)
    await act(async () => root.unmount())
    root = createRoot(container)
    await mount()
    expect(container.textContent).toContain('Check passed')
    await click(button('My progress'))
    expect(container.textContent).toContain('50 XP')
    expect(container.textContent).toContain('1 / 6')
    expect(container.textContent).toContain('Not assessed')
  })

  it('records a wrong answer, supports a retry, and does not reward repeated passes', async () => {
    window.history.replaceState(null, '', '/#/lesson/js-async')
    await mount()
    let choices = container.querySelectorAll<HTMLInputElement>('input[type="radio"]')
    await click(choices[0]); await click(choices[3]); await click(button('Check my understanding'))
    expect(savedState().events[0]).toMatchObject({ xp: 0, kind: 'check_failed' })
    expect(container.textContent).toContain('A useful mistake.')
    await click(button('Try again'))
    choices = container.querySelectorAll<HTMLInputElement>('input[type="radio"]')
    await click(choices[1]); await click(choices[5]); await click(button('Check my understanding'))
    await click(button('Practice again'))
    choices = container.querySelectorAll<HTMLInputElement>('input[type="radio"]')
    await click(choices[1]); await click(choices[5]); await click(button('Check my understanding'))
    expect(savedState().events.map((event: { xp: number }) => event.xp)).toEqual([0, 50, 0])
  })

  it('saves profile preferences and opens search through the keyboard shortcut', async () => {
    await mount()
    await click(button('Open profile settings'))
    const input = container.querySelector<HTMLInputElement>('.settings-form input')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Alex')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click(button('Dark'))
    expect(document.documentElement.dataset.theme).toBe('dark')
    await click(button('Save preferences'))
    expect(savedState().profile.display_name).toBe('Alex')
    await click(button('Close dialog'))
    expect(container.textContent).toContain('Welcome in, Alex')
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })))
    expect(container.querySelector('dialog[open]')?.textContent).toContain('Find your next concept')
    const searchResult = [...container.querySelectorAll<HTMLButtonElement>('.search-results button')].find(item => item.textContent?.includes('missing rows'))!
    await click(searchResult)
    expect(container.querySelector('h1')?.textContent).toBe('The missing rows mystery')
    expect(container.querySelector('dialog')).toBeNull()
  })

  it('keeps completion unrecorded when persistence fails and shows a clear error', async () => {
    window.history.replaceState(null, '', '/#/lesson/react-effects')
    await mount()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage quota exceeded') })
    const choices = container.querySelectorAll<HTMLInputElement>('input[type="radio"]')
    await click(choices[1]); await click(choices[5]); await click(button('Check my understanding'))
    expect(container.textContent).toContain('Could not save: Storage quota exceeded')
    expect(container.textContent).not.toContain('That’s a concept worth keeping.')
    expect(savedState().events).toHaveLength(0)
  })

  it('preserves malformed storage instead of silently resetting user data', async () => {
    localStorage.setItem(STORAGE_KEY, '{broken')
    await mount()
    expect(container.textContent).toContain('Your progress could not be loaded')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{broken')
  })
})
