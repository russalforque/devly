import { LanguageSelector } from '../../i18n/LanguageProvider'
import { useTranslation } from 'react-i18next'
import { tr, tx } from '../../i18n/text'
import { createContext, useContext, useEffect, useState, type ReactNode, type FormEvent } from 'react'
import { ArrowRight, Code2, LoaderCircle, LockKeyhole } from 'lucide-react'
import { configurationError, errorMessage, localMode, supabase } from '../../lib/supabase'

const AuthContext = createContext<{ userId: string | null; signOut: () => Promise<void> }>({ userId: null, signOut: async () => {} })
export function useAuth() { return useContext(AuthContext) }

export function AuthProvider({ children }: { children: ReactNode }) {
  useTranslation()

  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let alive = true
    let generation = 0
    async function verify(id: string | undefined) {
      const current = ++generation
      try {
        if (alive) { setUserId(null); setLoading(true) }
        if (id) {
          const { data, error: ownerError } = await client.rpc('is_owner')
          if (ownerError) throw ownerError
          if (!data) throw new Error('This account is not authorized for this private workspace.')
          if (alive && current === generation) setUserId(id)
        }
      } catch (cause) { if (alive && current === generation) setError(errorMessage(cause)) }
      finally { if (alive && current === generation) setLoading(false) }
    }
    client.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) { if (alive) { setError(sessionError.message); setLoading(false) } }
      else void verify(data.session?.user.id)
    }).catch(cause => { if (alive) { setError(errorMessage(cause)); setLoading(false) } })
    const { data } = client.auth.onAuthStateChange((_event, session) => { window.setTimeout(() => { if (alive) void verify(session?.user.id) }, 0) })
    return () => { alive = false; data.subscription.unsubscribe() }
  }, [])

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setSubmitting(true); setError('')
    const form = new FormData(event.currentTarget)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: String(form.get('email')).trim(), password: String(form.get('password')) })
      if (signInError) throw signInError
    } catch (cause) { setError(errorMessage(cause)) }
    finally { setSubmitting(false) }
  }

  async function signOut() {
    if (supabase) {
      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) { setError(errorMessage(signOutError)); return }
    }
    setUserId(null)
  }

  if (loading) return <div className="full-screen-state"><LoaderCircle className="spin" /><p>{tr("Opening your workspace…")}</p></div>
  if (localMode || userId) return <AuthContext.Provider value={{ userId, signOut }}>{children}</AuthContext.Provider>
  return <main className="auth-layout"><LanguageSelector /><div className="auth-brand"><span className="brand-icon"><Code2 size={24} /></span> {tr("devly")}<span className="brand-dot">.</span></div><div className="auth-card"><LockKeyhole size={28} className="text-accent" /><span className="eyebrow">{tr("YOUR PRIVATE LEARNING SPACE")}</span><h1>{tr("Welcome back.")}</h1><p>{tr("A little practice. A stronger developer.")}</p>{tx(supabase ? <form onSubmit={signIn}><label>{tr("Email")}<input name="email" type="email" autoComplete="username" required placeholder={tr("you@example.com")} /></label><label>{tr("Password")}<input name="password" type="password" autoComplete="current-password" required minLength={6} /></label>{tx(error && <p role="alert" className="error-message">{tx(error)}</p>)}<button className="button primary" disabled={submitting}>{tx(submitting ? 'Signing in…' : 'Open my workspace')}<ArrowRight size={16} /></button><small>{tr("Access is restricted to your authorized account. Public sign-up is disabled.")}</small></form> : <div className="notice"><h3>{tx(configurationError ? 'Check your connection settings' : 'Connect your private workspace')}</h3><p>{tr("Set the Supabase URL and publishable key, apply the database migration, and authorize your account. See the project README for setup.")}</p><p>{tr("Production access stays closed until configured. Local preview is available with")}{' '}<code>npm run dev</code>.</p></div>)}</div><footer>{tr("Learn. Practice. Debug. Master.")}</footer></main>
}
