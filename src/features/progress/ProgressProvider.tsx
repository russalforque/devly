import { useTranslation } from 'react-i18next'
import { tr, tx } from '../../i18n/text'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { LoaderCircle, RefreshCw } from 'lucide-react'
import { useAuth } from '../auth/Auth'
import { errorMessage, supabase } from '../../lib/supabase'
import { emptyState, recordCheck, STORAGE_KEY, validateState, type LearningState, type LessonProgress, type Profile } from './model'
import { loadRemoteState } from './repository'

interface ProgressContextValue {
  state: LearningState
  busy: boolean
  error: string
  clearError: () => void
  beginLesson: (id: string) => Promise<void>
  submitCheck: (id: string, answers: number[], minutes: number) => Promise<boolean>
  toggleBookmark: (id: string) => Promise<void>
  updateProfile: (profile: Profile) => Promise<boolean>
}
const ProgressContext = createContext<ProgressContextValue | null>(null)
export function useProgress() { const context = useContext(ProgressContext); if (!context) throw new Error('Progress provider is missing.'); return context }

export function ProgressProvider({ children }: { children: ReactNode }) {
  useTranslation()

  const { userId } = useAuth()
  const [state, setState] = useState<LearningState>(emptyState)
  const stateRef = useRef(state)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [retry, setRetry] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const pendingCheck = useRef<{ signature: string; id: string; createdAt: Date; minutes: number } | null>(null)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        let next: LearningState
        if (supabase && userId) {
          next = await loadRemoteState(userId)
        } else {
          const raw = localStorage.getItem(STORAGE_KEY)
          next = raw ? validateState(JSON.parse(raw)) : structuredClone(emptyState)
        }
        if (alive) { stateRef.current = next; setState(next); setLoadError('') }
      } catch (cause) { if (alive) setLoadError(errorMessage(cause)) }
      finally { if (alive) setLoading(false) }
    }
    void load()
    return () => { alive = false }
  }, [userId, retry])

  async function mutate(action: (current: LearningState) => Promise<LearningState>): Promise<boolean> {
    if (lock.current) return false
    lock.current = true; setBusy(true); setError('')
    try {
      const raw = !userId ? localStorage.getItem(STORAGE_KEY) : null
      const current = raw ? validateState(JSON.parse(raw)) : stateRef.current
      const next = await action(current)
      if (!userId) localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      stateRef.current = next; setState(next)
      return true
    } catch (cause) { setError(`Could not save: ${errorMessage(cause)}`); return false }
    finally { lock.current = false; setBusy(false) }
  }

  async function beginLesson(id: string) {
    await mutate(async current => {
      if (current.progress.some(item => item.lesson_id === id)) return current
      const progress: LessonProgress = { lesson_id: id, status: 'started', answers: [], updated_at: new Date().toISOString() }
      if (supabase && userId) {
        const { error: saveError } = await supabase.from('lesson_progress').upsert({ ...progress, user_id: userId }, { onConflict: 'user_id,lesson_id', ignoreDuplicates: true })
        if (saveError) throw saveError
      }
      return { ...current, progress: [...current.progress, progress] }
    })
  }

  async function submitCheck(id: string, answers: number[], minutes: number) {
    const signature = JSON.stringify([id, answers])
    if (!pendingCheck.current || pendingCheck.current.signature !== signature) {
      pendingCheck.current = { signature, id: crypto.randomUUID(), createdAt: new Date(), minutes }
    }
    const pending = pendingCheck.current
    const saved = await mutate(async current => {
      const next = recordCheck(current, id, answers, pending.minutes, pending.createdAt, pending.id)
      const event = next.events.at(-1)!
      if (supabase && userId) {
        const { error: saveError } = await supabase.rpc('record_lesson_check', {
          p_lesson_id: id, p_answers: answers, p_minutes: event.minutes,
          p_event_id: pending.id, p_passed: event.kind !== 'check_failed',
        })
        if (saveError) throw saveError
        return loadRemoteState(userId)
      }
      return next
    })
    if (saved) pendingCheck.current = null
    return saved
  }

  async function toggleBookmark(id: string) {
    await mutate(async current => {
      const exists = current.bookmarks.includes(id)
      if (supabase && userId) {
        const result = exists ? await supabase.from('bookmarks').delete().eq('user_id', userId).eq('lesson_id', id) : await supabase.from('bookmarks').upsert({ user_id: userId, lesson_id: id })
        if (result.error) throw result.error
      }
      return { ...current, bookmarks: exists ? current.bookmarks.filter(item => item !== id) : [...current.bookmarks, id] }
    })
  }

  async function updateProfile(profile: Profile) {
    return mutate(async current => {
      const next = validateState({ ...current, profile })
      if (supabase && userId) {
        const { error: saveError } = await supabase.from('profiles').update(profile).eq('id', userId)
        if (saveError) throw saveError
      }
      return next
    })
  }

  if (loading) return <div className="full-screen-state"><LoaderCircle className="spin" /><p>{tr("Loading your learning history…")}</p></div>
  if (loadError) return <div className="full-screen-state"><h2>{tr("Your progress could not be loaded")}</h2><p role="alert">{tx(loadError)}</p><p>{tr("Your saved data has not been overwritten.")}</p><button className="button" onClick={() => { setLoading(true); setRetry(value => value + 1) }}><RefreshCw size={16} />{tr("Try again")}</button></div>
  return <ProgressContext.Provider value={{ state, busy, error, clearError: () => setError(''), beginLesson, submitCheck, toggleBookmark, updateProfile }}>{children}</ProgressContext.Provider>
}
