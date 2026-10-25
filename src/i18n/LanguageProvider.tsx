import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Globe } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import i18n, { isLocale, LANGUAGE_KEY, languageNames, languages, type Locale } from './config'
import { tr } from './text'

const Context = createContext<{ select: (language: Locale) => void; error: string }>({ select: language => { void i18n.changeLanguage(language) }, error: '' })

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [error, setError] = useState('')
  const owner = useRef<string | null>(null)
  const revision = useRef(0)
  const queue = useRef(Promise.resolve())
  useEffect(() => {
    let alive = true
    const applyDocumentLanguage = () => { document.documentElement.lang = i18n.language }
    applyDocumentLanguage()
    i18n.on('languageChanged', applyDocumentLanguage)
    async function load(id?: string) {
      owner.current = id ?? null
      const version = ++revision.current
      if (!id || !supabase) return
      const { data, error: failure } = await supabase.from('profiles').select('preferred_language').eq('id', id).single()
      if (!alive || version !== revision.current) return
      if (failure) { setError('Language preference could not sync. Your choice still works on this device.'); return }
      if (isLocale(data?.preferred_language)) {
        await i18n.changeLanguage(data.preferred_language)
        try { localStorage.setItem(LANGUAGE_KEY, data.preferred_language) } catch { setError('Language preference could not be saved on this device.') }
      }
    }
    void supabase?.auth.getSession().then(({ data }) => load(data.session?.user.id)).catch(() => { if (alive) setError('Language preference could not sync. Your choice still works on this device.') })
    const subscription = supabase?.auth.onAuthStateChange((_event, session) => { setTimeout(() => { if (alive && owner.current !== (session?.user.id ?? null)) void load(session?.user.id) }, 0) }).data.subscription
    const storage = (event: StorageEvent) => { if (event.key === LANGUAGE_KEY && isLocale(event.newValue)) { revision.current++; void i18n.changeLanguage(event.newValue) } }
    window.addEventListener('storage', storage)
    return () => { alive = false; revision.current++; subscription?.unsubscribe(); i18n.off('languageChanged', applyDocumentLanguage); window.removeEventListener('storage', storage) }
  }, [])
  function select(language: Locale) {
    if (!isLocale(language)) return
    revision.current++
    setError('')
    void i18n.changeLanguage(language)
    try { localStorage.setItem(LANGUAGE_KEY, language) } catch { setError('Language preference could not be saved on this device.') }
    const userId = owner.current
    if (supabase && userId) {
      const client = supabase
      queue.current = queue.current.then(async () => {
        if (owner.current !== userId) return
        const { data, error: failure } = await client.from('profiles').update({ preferred_language: language }).eq('id', userId).select('id').single()
        if (failure || !data) throw new Error('sync')
      }).catch(() => { setError('Language preference could not sync. Your choice still works on this device.') })
    }
  }
  return <Context.Provider value={{ select, error }}>{children}</Context.Provider>
}

export function LanguageSelector() {
  const { i18n: instance } = useTranslation()
  const { select } = useContext(Context)
  return <label className="language-selector"><Globe size={16} aria-hidden="true" /><span className="sr-only">{tr('Interface language')}</span><select aria-label={tr('Interface language')} value={instance.language} onChange={event => { if (isLocale(event.target.value)) select(event.target.value) }}>{languages.map(language => <option key={language} value={language} lang={language}>{languageNames[language]}</option>)}</select></label>
}
export function LanguageSyncNotice() {
  useTranslation()
  const { error } = useContext(Context)
  return error ? <p className="notice" role="status">{tr(error)}</p> : null
}
