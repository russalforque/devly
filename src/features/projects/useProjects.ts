import { useCallback, useEffect, useRef, useState } from 'react'
import { loadFeature, saveFeature } from '../../lib/featureStorage'
import { emptyProjects, validateProjects, type ProjectState } from './model'

export function useProjects() {
  const [data, setData] = useState<ProjectState | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(0)
  const [reload, setReload] = useState(0)
  const current = useRef<ProjectState | null>(null)
  const queue = useRef(Promise.resolve())
  const revision = useRef(0)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    let cancelled = false
    loadFeature('projects', 'workspace', emptyProjects).then(validateProjects).then(value => {
      if (!cancelled) { current.current = value; setData(value); setError('') }
    }).catch(cause => { if (!cancelled) setError(`Could not load projects. ${cause instanceof Error ? cause.message : 'Storage is unavailable.'}`) })
    return () => { cancelled = true; mounted.current = false }
  }, [reload])
  const persist = useCallback((value: ProjectState) => {
    const requestedRevision = ++revision.current
    setPending(n => n + 1)
    queue.current = queue.current.then(async () => {
      // Save the newest queued snapshot after any in-flight write finishes.
      if (requestedRevision !== revision.current) return
      await saveFeature('projects', 'workspace', value)
      if (mounted.current) setError('')
    }).catch(cause => {
      if (mounted.current) setError(`Changes are in memory only; saving failed. ${cause instanceof Error ? cause.message : 'Storage is unavailable.'}`)
    }).finally(() => { if (mounted.current) setPending(n => n - 1) })
  }, [])
  const update = useCallback((change: (state: ProjectState) => ProjectState) => {
    if (!current.current) return
    const next = change(current.current)
    if (next === current.current) return
    current.current = next; setData(next); persist(next)
  }, [persist])
  return { data, error, pending, update, retry: () => { if (current.current) persist(current.current); else { setError(''); setReload(n => n + 1) } } }
}
