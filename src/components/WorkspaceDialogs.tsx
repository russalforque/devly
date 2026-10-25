import { LanguageSelector } from '../i18n/LanguageProvider'
import { useTranslation } from 'react-i18next'
import { tr, tx } from '../i18n/text'
import { useState, type FormEvent } from 'react'
import { ArrowDownToLine, ArrowRight, BookOpen, Check, Database, Laptop, Moon, Search, ShieldCheck, Sun } from 'lucide-react'
import { Modal, TechnologyIcon } from './ui'
import { lessons, tracks } from '../features/curriculum/content'
import { useProgress } from '../features/progress/ProgressProvider'
import { useAuth } from '../features/auth/Auth'
import { loadFeature } from '../lib/featureStorage'
import { errorMessage } from '../lib/supabase'

export function SearchDialog({ onClose, navigate }: { onClose: () => void; navigate: (path: string) => void }) {
  useTranslation()

  const [query, setQuery] = useState('')
  const results = lessons.filter(lesson => `${lesson.title} ${tr(lesson.title)} ${tr(lesson.subtitle)} ${lesson.trackId}`.toLowerCase().includes(query.toLowerCase()))
  const matchingTracks = query.trim() ? tracks.filter(track => `${track.name} ${track.topics.join(' ')}`.toLowerCase().includes(query.toLowerCase())).slice(0, 4) : []
  function open(path: string) { navigate(path); onClose() }
  return <Modal title={tr("Find your next concept")} onClose={onClose} wide><label className="search-field dialog-search"><Search size={18} /><input autoFocus aria-label={tr("Search lessons and paths")} placeholder={tr("Search lessons, technologies, concepts…")} value={query} onChange={event => setQuery(event.target.value)} /></label><div className="search-results"><span className="eyebrow">{tx(query ? 'MATCHING LESSONS' : 'EXPLORE A CONCEPT')}</span>{tx(results.map(lesson => <button key={lesson.id} onClick={() => open(`lesson/${lesson.id}`)}><BookOpen size={18} /><span><strong>{tx(lesson.title)}</strong><small>{tx(lesson.trackId)} · {tx(lesson.minutes)} {tr("min")}</small></span><ArrowRight size={15} /></button>))}{tx(matchingTracks.map(track => <button key={track.id} onClick={() => open(`paths/${track.id}`)}><TechnologyIcon track={track} small /><span><strong>{tx(track.name)}</strong><small>{tr("Learning path")}</small></span><ArrowRight size={15} /></button>))}{tx(!results.length && !matchingTracks.length && <p className="search-empty">{tr("No matching concepts. Try “React”, “async”, or “SQL”.")}</p>)}</div><div className="dialog-footer"><span>{tr("Make curiosity a habit.")}</span><kbd>{tr("Esc to close")}</kbd></div></Modal>
}

export type Theme = 'light' | 'dark' | 'system'

export function SettingsDialog({ onClose, theme, setTheme }: { onClose: () => void; theme: Theme; setTheme: (theme: Theme) => void }) {
  useTranslation()

  const { state, busy, error, updateProfile } = useProgress()
  const { userId, signOut } = useAuth()
  const [name, setName] = useState(state.profile.display_name)
  const [goal, setGoal] = useState(state.profile.daily_goal_minutes)
  const [saved, setSaved] = useState(false)
  const [exportError, setExportError] = useState('')
  const [exporting, setExporting] = useState(false)
  async function submit(event: FormEvent) { event.preventDefault(); const success = await updateProfile({ display_name: name.trim(), daily_goal_minutes: goal }); setSaved(success) }
  async function exportProgress() {
    setExporting(true); setExportError('')
    try {
      const [coding, interviews, projects, assessments] = await Promise.all([
        loadFeature('coding', 'workspace', null), loadFeature('interviews', 'workspace', null),
        loadFeature('projects', 'workspace', null), loadFeature('assessments', 'diagnostics', null),
      ])
      const blob = new Blob([JSON.stringify({ version: 2, exported_at: new Date().toISOString(), ...state, features: { coding, interviews, projects, assessments } }, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url; link.download = 'devly-progress.json'; link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (cause) { setExportError(errorMessage(cause)) }
    finally { setExporting(false) }
  }

  return <Modal title={tr("Make yourself at home")} onClose={onClose}><form className="settings-form" onSubmit={submit}><LanguageSelector /><label>{tr("What should we call you?")}<input required maxLength={40} value={name} onChange={event => { setName(event.target.value); setSaved(false) }} placeholder={tr("Your name")} /></label><label>{tr("Daily learning goal")}<select value={goal} onChange={event => { setGoal(Number(event.target.value)); setSaved(false) }}>{tx([10, 20, 30, 45, 60].map(minutes => <option key={minutes} value={minutes}>{tx(minutes)} {tr("minutes a day")}</option>))}</select></label><div><span className="field-label">{tr("Appearance")}</span><div className="theme-selector">{tx([{ id: 'light', icon: Sun, label: 'Light' }, { id: 'dark', icon: Moon, label: 'Dark' }, { id: 'system', icon: Laptop, label: 'System' }].map(option => <button type="button" key={option.id} className={theme === option.id ? 'selected' : ''} aria-pressed={theme === option.id} onClick={() => setTheme(option.id as Theme)}><option.icon size={17} />{tx(option.label)}</button>))}</div></div>{tx(error && <p role="alert" className="error-message">{tx(error)}</p>)}<button className="button primary" disabled={busy || !name.trim()}>{tx(saved ? <><Check size={16} />{tr("Preferences saved")}</> : busy ? 'Saving…' : 'Save preferences')}</button></form><div className="connection-box"><span>{tx(userId ? <ShieldCheck size={18} /> : <Database size={18} />)}<strong>{tx(userId ? 'Private Supabase workspace' : 'Local workspace')}</strong></span><p>{tx(userId ? 'Your progress is saved to your account and protected by Row Level Security.' : 'Progress is saved in this browser. This local preview has no account protection or cross-device sync. Connect Supabase using the project README to enable private cloud storage.')}</p><button className="text-button" disabled={exporting} onClick={() => void exportProgress()}><ArrowDownToLine size={14} />{tx(exporting ? 'Preparing export…' : 'Export all progress')}</button>{tx(exportError && <p role="alert" className="error-message">{tx(exportError)}</p>)}{tx(userId && <button className="text-button sign-out" onClick={() => void signOut()}>{tr("Sign out")}</button>)}</div></Modal>
}
