import { LanguageProvider, LanguageSelector, LanguageSyncNotice } from './i18n/LanguageProvider'
import { useTranslation } from 'react-i18next'
import { tr, tx } from './i18n/text'
import { Component, Suspense, lazy, useEffect, useState, type ErrorInfo, type ReactNode } from 'react'
import { ArrowUpRight, BarChart3, Bookmark, Bug, Check, ChevronLeft, ChevronRight, Code2, FlaskConical, FolderCode, LayoutDashboard, LoaderCircle, Menu, MessageSquare, PanelLeftClose, Route, Search, Settings2, ShieldCheck, X, Target, CalendarDays, Sparkles } from 'lucide-react'
import { AuthProvider, useAuth } from './features/auth/Auth'
import { ProgressProvider, useProgress } from './features/progress/ProgressProvider'
import Dashboard from './features/dashboard/Dashboard'
import { SearchDialog, SettingsDialog, type Theme } from './components/WorkspaceDialogs'

const Paths = lazy(() => import('./features/curriculum/Paths'))
const LessonReader = lazy(() => import('./features/curriculum/LessonReader'))
const ProgressPage = lazy(() => import('./features/progress/ProgressPage'))
const CodingPage = lazy(() => import('./features/coding/CodingPage'))
const InterviewsPage = lazy(() => import('./features/interviews/InterviewsPage'))
const ProjectsPage = lazy(() => import('./features/projects/ProjectsPage'))
const Assessments = lazy(() => import('./features/assessment'))
const Reviews = lazy(() => import('./features/progress/Reviews'))
const Mentor = lazy(() => import('./features/mentor/Mentor'))
const LanguageSandbox = lazy(() => import('./features/coding/LanguageSandbox'))
const navigation: { path: string; title: string; icon: typeof Code2; phase?: number }[] = [
  { path: 'dashboard', title: 'Overview', icon: LayoutDashboard },
  { path: 'paths', title: 'Learning paths', icon: Route },
  { path: 'challenges', title: 'Coding challenges', icon: Code2 },
  { path: 'debugging', title: 'Debugging lab', icon: Bug },
  { path: 'interviews', title: 'Interview prep', icon: MessageSquare },
  { path: 'projects', title: 'Mini projects', icon: FolderCode },
  { path: 'assessments', title: 'Skill diagnostics', icon: Target },
  { path: 'reviews', title: 'Review queue', icon: CalendarDays },
  { path: 'mentor', title: 'Learning mentor', icon: Sparkles },
]
function readRoute() { return window.location.hash.slice(1).replace(/^\//, '') || 'dashboard' }
function initialTheme(): Theme { try { const value = localStorage.getItem('devly.theme'); return value === 'dark' || value === 'system' ? value : 'light' } catch { return 'light' } }

function Workspace() {
  useTranslation()

  const [route, setRoute] = useState(readRoute)
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 760px)').matches)
  const [dialog, setDialog] = useState<'search' | 'settings' | null>(null)
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const { state, busy, error, clearError } = useProgress()
  const { userId } = useAuth()
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)')
    const update = () => { setMobile(media.matches); if (!media.matches) setMobileOpen(false) }
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (!mobileOpen) return
    const previous = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.querySelector<HTMLButtonElement>('.mobile-close')?.focus()
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const focusable = [...document.querySelectorAll<HTMLElement>('.sidebar button')].filter(element => element.getClientRects().length > 0)
      const first = focusable[0], last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', trap)
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', trap); previous?.focus() }
  }, [mobileOpen])
  useEffect(() => {
    const handler = () => { setRoute(readRoute()); setMobileOpen(false); window.scrollTo({ top: 0 }); document.getElementById('main-content')?.focus() }
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setDialog(current => current === 'search' ? null : 'search') }
      if (event.key === 'Escape') setMobileOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => { document.documentElement.dataset.theme = theme === 'system' ? media.matches ? 'dark' : 'light' : theme }
    update(); media.addEventListener('change', update)
    try { localStorage.setItem('devly.theme', theme) } catch { return () => media.removeEventListener('change', update) }
    return () => media.removeEventListener('change', update)
  }, [theme])
  function navigate(path: string) { window.location.hash = `/${path}`; setMobileOpen(false) }
  const title = route === 'dashboard' ? 'Overview' : route.startsWith('paths') ? 'Learning paths' : route.startsWith('lesson') ? 'Learning paths / Lesson' : route === 'progress' ? 'My progress' : route === 'saved' ? 'Saved for later' : navigation.find(item => item.path === route)?.title ?? 'Development roadmap'
  const initials = state.profile.display_name.split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase()
  function content() {
    if (route === 'dashboard') return <Dashboard navigate={navigate} />
    if (route === 'paths' || route.startsWith('paths/')) return <Paths key={route} trackId={route.split('/')[1]} navigate={navigate} />
    if (route.startsWith('lesson/')) return <LessonReader key={route} id={route.split('/')[1]} navigate={navigate} />
    if (route === 'progress' || route === 'saved') return <ProgressPage savedOnly={route === 'saved'} navigate={navigate} />
    if (route === 'challenges' || route === 'roadmap/challenges') return <CodingPage navigate={navigate} />
    if (route === 'debugging' || route === 'roadmap/debugging') return <CodingPage debugging navigate={navigate} />
    if (route.startsWith('challenge/')) return <CodingPage challengeId={route.split('/')[1]} navigate={navigate} />
    if (route === 'interviews' || route === 'roadmap/interviews') return <InterviewsPage navigate={navigate} />
    if (route === 'projects' || route === 'roadmap/projects') return <ProjectsPage navigate={navigate} />
    if (route === 'assessments') return <Assessments navigate={navigate} />
    if (route === 'reviews') return <Reviews navigate={navigate} />
    if (route === 'mentor' || route === 'roadmap/mentor') return <Mentor navigate={navigate} />
    if (route === 'sandbox') return <LanguageSandbox />
    return <div className="page"><h1>{tr("This page took a wrong turn.")}</h1><button className="button" onClick={() => navigate('dashboard')}><ChevronLeft size={16} />{tr("Back to overview")}</button></div>
  }
  return <div className={`workspace ${collapsed ? 'sidebar-collapsed' : ''}`}>
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus() }}>{tr("Skip to content")}</a>
    {tx(mobileOpen && <button className="mobile-overlay" aria-label={tr("Close navigation")} onClick={() => setMobileOpen(false)} />)}
    <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`} inert={mobile && !mobileOpen} role={mobile ? 'dialog' : undefined} aria-modal={mobile && mobileOpen ? true : undefined} aria-label={tr("Workspace navigation")}><div className="sidebar-brand"><button className="brand" onClick={() => navigate('dashboard')} aria-label={tr("Devly home")}><span className="brand-icon"><Code2 size={23} /></span><span className="brand-name">{tr("devly")}<span>.</span></span></button><button className="sidebar-toggle icon-button" aria-label={tr(collapsed ? 'Expand sidebar' : 'Collapse sidebar')} onClick={() => setCollapsed(value => !value)}>{tx(collapsed ? <ChevronRight size={16} /> : <PanelLeftClose size={16} />)}</button><button className="mobile-close icon-button" aria-label={tr("Close navigation")} onClick={() => setMobileOpen(false)}><X size={20} /></button></div><div className="workspace-label"><span className="status-dot" /><span>{tr("Personal workspace")}</span><ShieldCheck size={12} /></div><div className="nav-section-title">{tr("WORKSPACE")}</div><nav aria-label={tr("Main navigation")}>{tx(navigation.map(item => <button key={item.path} className={`nav-item ${route === item.path || item.path === 'paths' && (route.startsWith('paths/') || route.startsWith('lesson/')) ? 'active' : ''}`} onClick={() => navigate(item.path)} aria-current={route === item.path ? 'page' : undefined} title={tr(item.phase ? `${item.title} · planned for Phase ${item.phase}` : item.title)}><item.icon size={18} /><span>{tx(item.title)}</span>{tx(item.phase && <span className="planned-dot" aria-label={tr(`Planned for Phase ${item.phase}`)} />)}</button>))}</nav><div className="nav-section-title second-section">{tr("YOUR JOURNEY")}</div><nav aria-label={tr("Personal navigation")}><button className={`nav-item ${route === 'progress' ? 'active' : ''}`} onClick={() => navigate('progress')} title={tr("My progress")}><BarChart3 size={18} /><span>{tr("My progress")}</span></button><button className={`nav-item ${route === 'saved' ? 'active' : ''}`} onClick={() => navigate('saved')} title={tr("Saved for later")}><Bookmark size={18} /><span>{tr("Saved for later")}</span>{tx(state.bookmarks.length > 0 && <span className="nav-count">{tx(state.bookmarks.length)}</span>)}</button></nav><div className="sidebar-bottom"><div className="sidebar-quote"><span className="quote-mark">“</span><p>{tr("Great developers aren’t born.")}<br />{tr("They keep learning.")}</p><div className="quote-decoration"><span /><Code2 size={15} /></div></div><button className="nav-item" onClick={() => setDialog('settings')} title={tr("Settings")}><Settings2 size={18} /><span>{tr("Settings & preferences")}</span></button><div className="profile-block"><button className="profile-button" onClick={() => setDialog('settings')} title={tr("Edit profile")}><span className="avatar">{initials}</span><span className="profile-info"><strong>{state.profile.display_name}</strong><small>{tx(userId ? 'Private workspace' : 'Local workspace')}</small></span><ChevronRight size={14} /></button></div></div></aside>
    <div className="workspace-content" inert={mobileOpen}><header className="topbar"><div className="breadcrumb"><button className="mobile-menu icon-button" aria-label={tr("Open navigation")} aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><Menu size={21} /></button><span className="desktop-breadcrumb">{tr("Workspace")}</span><ChevronRight size={13} className="desktop-breadcrumb" /><strong>{tx(title)}</strong></div><div className="topbar-actions"><LanguageSelector /><button className="search-trigger" onClick={() => setDialog('search')} aria-label={tr("Search lessons")}><Search size={16} /><span>{tr("Find something to learn")}</span><kbd>{tr("Ctrl K")}</kbd></button><span className="header-divider" /><span className="save-status" title={tr(userId ? 'Connected to Supabase' : 'Saved on this device')}>{tx(busy ? <LoaderCircle size={13} className="spin" /> : <Check size={13} />)}<span>{tx(busy ? 'Saving' : userId ? 'Connected' : 'Local mode')}</span></span><button className="header-avatar avatar" onClick={() => setDialog('settings')} aria-label={tr("Open profile settings")}>{initials}</button></div></header>
    {tx(error && <div className="error-banner" role="alert"><span>{tx(error)}</span><button className="icon-button" aria-label={tr("Dismiss error")} onClick={clearError}><X size={16} /></button></div>)}
    <main id="main-content" tabIndex={-1}><LanguageSyncNotice /><Suspense fallback={<div className="full-screen-state"><LoaderCircle className="spin" /><p>{tr("Opening your next step…")}</p></div>}>{tx(content())}</Suspense></main>
    </div>{tx(dialog === 'search' && <SearchDialog onClose={() => setDialog(null)} navigate={navigate} />)}{tx(dialog === 'settings' && <SettingsDialog onClose={() => setDialog(null)} theme={theme} setTheme={setTheme} />)}
  </div>
}

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error, info: ErrorInfo) { if (import.meta.env.DEV) console.error('Devly rendering error', error, info.componentStack) }
  render() { if (this.state.failed) return <div className="full-screen-state"><FlaskConical size={32} /><h1>{tr("Let’s get you back on track.")}</h1><p>{tr("The workspace couldn’t render. Your saved progress has not been reset.")}</p><button className="button primary" onClick={() => window.location.reload()}>{tr("Reload workspace")}<ArrowUpRight size={16} /></button></div>; return this.props.children }
}

export default function App() {
  useTranslation()
 return <LanguageProvider><ErrorBoundary><AuthProvider><ProgressProvider><Workspace /></ProgressProvider></AuthProvider></ErrorBoundary></LanguageProvider> }
