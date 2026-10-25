import { useCallback, useEffect, useRef, useState } from 'react'
import { loadFeature, saveFeature } from '../../lib/featureStorage'
import { emptyInterviews, validateInterviews, type InterviewState } from './model'

export function useInterviews() {
  const [data, setData] = useState<InterviewState | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(0)
  const [reload, setReload] = useState(0)
  const current = useRef<InterviewState | null>(null)
  const queue = useRef(Promise.resolve())
  const revision = useRef(0)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    let cancelled = false
    loadFeature('interviews', 'workspace', emptyInterviews).then(validateInterviews).then(value => {
      if (!cancelled) { current.current = value; setData(value); setError('') }
    }).catch(cause => { if (!cancelled) setError(`Could not load interviews. ${cause instanceof Error ? cause.message : 'Storage is unavailable.'}`) })
    return () => { cancelled = true; mounted.current = false }
  }, [reload])
  const persist = useCallback((value: InterviewState) => {
    const requestedRevision = ++revision.current
    setPending(n => n + 1)
    queue.current = queue.current.then(async () => {
      // Coalesce queued edits while preserving the order of in-flight writes.
      if (requestedRevision !== revision.current) return
      await saveFeature('interviews', 'workspace', value)
      if (mounted.current) setError('')
    }).catch(cause => {
      if (mounted.current) setError(`Changes are in memory only; saving failed. ${cause instanceof Error ? cause.message : 'Storage is unavailable.'}`)
    }).finally(() => { if (mounted.current) setPending(n => n - 1) })
  }, [])
  const update = useCallback((change: (state: InterviewState) => InterviewState) => {
    if (!current.current) return
    const next = change(current.current)
    if (next === current.current) return
    current.current = next
    setData(next)
    persist(next)
  }, [persist])
  return { data, error, pending, update, retry: () => { if (current.current) persist(current.current); else { setError(''); setReload(n => n + 1) } } }
}
