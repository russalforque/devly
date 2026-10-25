import { useTranslation } from 'react-i18next'
import { tr, tx } from '../../i18n/text'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, Code2, History, Lightbulb, Play, RotateCcw, Save, ShieldCheck, XCircle } from 'lucide-react'
import type { editor } from 'monaco-editor'
import { Badge, Duration, EmptyState, Modal, TechnologyIcon } from '../../components/ui'
import { getTrack } from '../curriculum/content'
import { challenges, type Challenge } from './challenges'
import { compileTypeScript, runCode, type RunResult } from './engine'
import { codingStats, initialCodingState, validateCoding, type Attempt, type CodingState } from './model'
import { loadFeature, saveFeature } from '../../lib/featureStorage'
import { errorMessage } from '../../lib/supabase'
import { suggestedDifficulty } from '../progress/learningSignals'
import './coding.css'

const Editor = lazy(() => import('./Editor'))

export default function CodingPage({ challengeId, debugging = false, navigate }: { challengeId?: string; debugging?: boolean; navigate: (path: string) => void }) {
  useTranslation()

  const [state, setState] = useState<CodingState>(initialCodingState)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('All levels')
  const [query, setQuery] = useState('')
  useEffect(() => {
    let active = true
    loadFeature('coding', 'workspace', initialCodingState).then(value => { if (active) { setState(validateCoding(value)); setLoaded(true) } }).catch(cause => { if (active) setError(errorMessage(cause)) })
    return () => { active = false }
  }, [])
  async function persist(next: CodingState) { await saveFeature('coding', 'workspace', next); setState(next) }
  const challenge = challenges.find(item => item.id === challengeId)
  if (error && !loaded) return <div className="page"><EmptyState title={tr("Your coding workspace could not be loaded")} description={tr(error)} action={tr("Retry")} onAction={() => window.location.reload()} /></div>
  if (!loaded) return <div className="full-screen-state"><Code2 /><p>{tr("Opening your coding workspace…")}</p></div>
  if (challengeId && !challenge) return <div className="page"><EmptyState title={tr("Challenge not found")} description={tr("Choose a challenge from your workspace.")} action={tr("Browse challenges")} onAction={() => navigate('challenges')} /></div>
  if (challenge) return <Playground key={challenge.id} challenge={challenge} state={state} persist={persist} navigate={navigate} />
  const stats = codingStats(state)
  const recommended = suggestedDifficulty(state)
  const filtered = challenges.filter(item => item.kind === (debugging ? 'debug' : 'challenge') && (filter === 'All levels' || item.difficulty === filter) && `${item.title} ${tr(item.title)} ${tr(item.topic)}`.toLowerCase().includes(query.toLowerCase()))
    .sort((left, right) => Number(right.difficulty === recommended) - Number(left.difficulty === recommended))
  return <div className="page"><div className="page-heading"><div><div className="eyebrow">{tx(debugging ? 'INVESTIGATE. REPRODUCE. REPAIR.' : 'TURN UNDERSTANDING INTO WORKING CODE')}</div><h1>{tx(debugging ? 'Debugging lab' : 'Coding challenges')}<span className="heading-dot">.</span></h1><p>{tx(debugging ? 'Realistic bug reports. Broken code. A test suite to tell you when it’s fixed.' : 'Small, useful problems. Deterministic tests. Your own way through.')}</p></div><Badge accent>{tx(stats.completed)} {tr("independently solved")}</Badge></div><div className="filter-toolbar"><div className="filter-tabs">{tx(['All levels', 'Beginner', 'Intermediate', 'Advanced'].map(level => <button key={level} className={filter === level ? 'selected' : ''} onClick={() => setFilter(level)}>{tx(level)}</button>))}</div><label className="search-field"><input aria-label={tr("Search challenges")} placeholder={tr("Find a problem…")} value={query} onChange={event => setQuery(event.target.value)} /></label></div><div className="paths-grid">{tx(filtered.map(item => { const solved = state.attempts.some(attempt => attempt.challengeId === item.id && attempt.passed && !attempt.assisted); return <button className="track-card challenge-card" key={item.id} onClick={() => navigate(`challenge/${item.id}`)}><div className="track-card-top"><TechnologyIcon track={getTrack(item.trackId)} /><Badge accent={solved}>{tx(solved ? 'Solved independently' : item.difficulty)}</Badge></div><h2>{tx(item.title)}</h2><p className="track-description">{tx(item.description)}</p><div className="topic-tags"><span>{tx(item.topic)}</span><span>{tx(item.tests.length)} {tr("tests")}</span></div><div className="challenge-card-footer"><Duration minutes={item.minutes} /><span>{tx(item.kind === 'debug' ? 'Investigate' : 'Open challenge')}<ArrowRight size={14} /></span></div></button> }))}</div>{tx(!filtered.length && <EmptyState title={tr("No matching challenges")} description={tr("Try another level or search term.")} />)}<div className="notice"><ShieldCheck size={18} /><p>{tr("JavaScript and TypeScript run in an opaque-origin sandbox with a disposable worker, blocked network access, a timeout, and bounded output. Browser memory cannot be strictly capped. Python, PHP, and C# use the separate resource-limited execution service.")}</p><button className="text-button" onClick={() => navigate('sandbox')}>{tr("Open multi-language sandbox")}<ArrowRight size={14} /></button></div></div>
}

function Playground({ challenge, state, persist, navigate }: { challenge: Challenge; state: CodingState; persist: (next: CodingState) => Promise<void>; navigate: (path: string) => void }) {
  useTranslation()

  const [language, setLanguage] = useState<'javascript' | 'typescript'>('javascript')
  const [code, setCode] = useState(state.drafts[`${challenge.id}:javascript`] ?? challenge.starter)
  const [running, setRunning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<RunResult | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [hintLevel, setHintLevel] = useState(0)
  const [solution, setSolution] = useState(false)
  const [history, setHistory] = useState(false)
  const [reset, setReset] = useState(false)
  const [tab, setTab] = useState<'problem' | 'editor' | 'results'>('problem')
  const [dark, setDark] = useState(document.documentElement.dataset.theme === 'dark')
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const controller = useRef<AbortController | null>(null)
  const seconds = useRef(0)
  const drafts = useRef({ ...state.drafts })
  const busy = useRef(false)
  const assistance = useRef(false)
  const runRef = useRef<() => void>(() => {})
  const saveRef = useRef<() => void>(() => {})
  useEffect(() => {
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible' && document.hasFocus()) seconds.current += 1 }, 1000)
    const observer = new MutationObserver(() => setDark(document.documentElement.dataset.theme === 'dark'))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); runRef.current() }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); saveRef.current() }
    }
    window.addEventListener('keydown', shortcut)
    return () => { clearInterval(interval); observer.disconnect(); window.removeEventListener('keydown', shortcut); controller.current?.abort() }
  }, [])
  function edit(value: string) { setCode(value); drafts.current[`${challenge.id}:${language}`] = value; setNotice('Unsaved draft') }
  async function save() {
    if (busy.current) return
    busy.current = true; setSaving(true); setError('')
    try { drafts.current[`${challenge.id}:${language}`] = code; await persist({ ...state, drafts: drafts.current }); setNotice('Draft saved') }
    catch (cause) { setError(errorMessage(cause)) }
    finally { busy.current = false; setSaving(false) }
  }
  async function run() {
    if (busy.current) return
    busy.current = true; setRunning(true); setError(''); setResult(null)
    controller.current = new AbortController()
    try {
      const javascript = language === 'typescript' ? await compileTypeScript(code) : code
      const output = await runCode(javascript, challenge.tests, controller.current.signal)
      setResult(output); setTab('results')
      const passed = !output.error && output.tests.length === challenge.tests.length && output.tests.every(test => test.passed)
      const attempt: Attempt = { id: crypto.randomUUID(), challengeId: challenge.id, createdAt: new Date().toISOString(), language, code, passed, result: output, seconds: seconds.current, assisted: assistance.current }
      drafts.current[`${challenge.id}:${language}`] = code
      await persist({ drafts: drafts.current, attempts: [...state.attempts, attempt] })
      seconds.current = 0; setNotice('Attempt and draft saved')
    } catch (cause) { setError(errorMessage(cause)) }
    finally { busy.current = false; setRunning(false) }
  }
  useEffect(() => { runRef.current = () => void run(); saveRef.current = () => void save() })
  const attempts = state.attempts.filter(attempt => attempt.challengeId === challenge.id)
  return <div className="page coding-page"><div className="lesson-topline"><button className="text-button back-link" onClick={() => navigate(challenge.kind === 'debug' ? 'debugging' : 'challenges')}><ArrowLeft size={15} />{tx(challenge.kind === 'debug' ? 'Debugging lab' : 'Coding challenges')}</button><button className="text-button" onClick={() => setHistory(true)}><History size={15} />{tx(attempts.length)} {tr("attempts")}</button></div><div className="coding-heading"><div><h1>{tx(challenge.title)}</h1><div className="coding-meta"><Badge accent>{tx(challenge.difficulty)}</Badge><span>{tx(challenge.topic)}</span><Duration minutes={challenge.minutes} /></div></div><button className="button" onClick={() => navigate('mentor')}>{tr("Ask the mentor")}<Lightbulb size={15} /></button></div><div className="mobile-coding-tabs">{tx((['problem', 'editor', 'results'] as const).map(item => <button key={item} className={tab === item ? 'selected' : ''} onClick={() => setTab(item)}>{tx(item)}</button>))}</div><div className={`playground-grid show-${tab}`}><section className="problem-panel panel"><div className="problem-scroll"><h2>{tx(challenge.kind === 'debug' ? 'Bug report' : 'The problem')}</h2><p>{tx(challenge.description)}</p>{tx(challenge.bug && <div className="bug-report"><strong>{tr("Expected behavior")}</strong><p>{tx(challenge.bug.expected)}</p><strong>{tr("Actual behavior")}</strong><p>{tx(challenge.bug.actual)}</p><pre>{challenge.bug.logs}</pre></div>)}<h3>{tr("Requirements")}</h3><ul>{tx(challenge.requirements.map(requirement => <li key={requirement}>{tx(requirement)}</li>))}</ul><h3>{tr("Visible test cases")}</h3>{tx(challenge.tests.map((test, index) => <div className="test-example" key={test.name}><strong>{tx(index + 1)}. {tx(test.name)}</strong><pre>Input: {JSON.stringify(test.args)}{'\n'}Expected: {JSON.stringify(test.expected)}</pre></div>))}<p className="small muted">{tr("All tests are visible. Browser-side tests are learning evidence, not tamper-proof assessment.")}</p><div className="hint-box"><h3>{tr("A nudge when you need it")}</h3>{tx(challenge.hints.slice(0, hintLevel).map((hint, index) => <p key={hint}><strong>{tr("Hint")}{' '}{tx(index + 1)}.</strong> {tx(hint)}</p>))}<button className="button" disabled={hintLevel >= 3} onClick={() => setHintLevel(level => Math.min(3, level + 1))}><Lightbulb size={14} />{tx(hintLevel === 3 ? 'All hints revealed' : `Reveal hint ${hintLevel + 1}`)}</button></div><button className="text-button" onClick={() => { setSolution(true); assistance.current = true }}>{tr("Explicitly reveal reference solution")}</button>{tx(solution && <div className="solution-panel"><h3>{tr("Reference solution & root cause")}</h3><p>{tx(challenge.explanation)}</p><pre>{challenge.reference}</pre><small>{tr("Subsequent runs in this session are marked assisted and earn no independent-completion XP.")}</small></div>)}</div></section><section className="editor-panel panel"><div className="editor-toolbar"><label><span className="sr-only">{tr("Editor language")}</span><select value={language} disabled={running} onChange={event => { const next = event.target.value as 'javascript' | 'typescript'; drafts.current[`${challenge.id}:${language}`] = code; setLanguage(next); setCode(drafts.current[`${challenge.id}:${next}`] ?? (next === 'typescript' ? challenge.typescript : challenge.starter)) }}><option value="javascript">{tr("JavaScript")}</option><option value="typescript">{tr("TypeScript")}</option></select></label><div><button className="text-button" onClick={() => void editorRef.current?.getAction('editor.action.formatDocument')?.run()}>{tr("Format")}</button><button className="icon-button" aria-label={tr("Reset code")} onClick={() => setReset(true)}><RotateCcw size={14} /></button><button className="icon-button" aria-label={tr("Save draft")} disabled={saving || running} onClick={() => void save()}><Save size={15} /></button></div></div><Suspense fallback={<p className="editor-loading">{tr("Loading Monaco Editor…")}</p>}><Editor code={code} language={language} onChange={edit} dark={dark} onMount={(instance, monaco) => { editorRef.current = instance; instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current()); instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current()) }} /></Suspense><div className="editor-bottom"><span>{tx(notice || 'Ctrl + Enter to run · Ctrl + S to save')}</span><button className="button primary" disabled={running || saving || code.length > 50000} onClick={() => void run()}><Play size={14} />{tx(running ? 'Running…' : 'Run tests')}</button></div></section><section className="results-panel panel" aria-live="polite"><div className="results-heading"><h2>{tr("Results & console")}</h2>{tx(result && <span><Clock3 size={13} />{tx(result.durationMs)} {tr("ms")}</span>)}</div>{tx(error && <p role="alert" className="error-message">{tx(error)}</p>)}{tx(result ? <><div className="result-summary">{tx(result.error ? <><XCircle size={18} />{tx(result.error)}</> : <><CheckCircle2 size={18} />{tx(result.tests.filter(test => test.passed).length)} / {tx(challenge.tests.length)} {tr("tests passed")}</>)}</div><div className="test-results">{tx(result.tests.map(test => <div className={`test-result ${test.passed ? 'passed' : 'failed'}`} key={test.name}><span>{tx(test.passed ? <CheckCircle2 size={16} /> : <XCircle size={16} />)}{tx(test.name)}</span>{tx(!test.passed && <pre>{test.error ?? `Expected: ${test.expected}\nReceived: ${test.actual}`}</pre>)}</div>))}</div><div className="console-output"><h3>{tr("Console")}</h3><pre>{result.logs.join('\n') || 'No console output.'}</pre></div></> : <p className="muted small">{tx(running ? 'Your solution is running in an isolated worker…' : 'Run your solution to see deterministic results and console output.')}</p>)}</section></div>{tx(reset && <Modal title={tr("Reset this draft?")} onClose={() => setReset(false)}><p className="muted small">{tr("This replaces the current editor contents with the starter. Saved submission history is retained.")}</p><button className="button primary" onClick={() => { edit(language === 'typescript' ? challenge.typescript : challenge.starter); setReset(false) }}>{tr("Reset to starter")}</button></Modal>)}{tx(history && <Modal title={tr("Submission history")} onClose={() => setHistory(false)} wide>{tx(attempts.length ? [...attempts].reverse().map(attempt => <div className="history-entry" key={attempt.id}><div><Badge accent={attempt.passed}>{tx(attempt.passed ? 'Passed' : 'Needs work')}{tx(attempt.assisted ? ' · Assisted' : '')}</Badge><span>{tx(new Date(attempt.createdAt).toLocaleString())} · {tx(attempt.language)}</span></div><details><summary>{tr("View submitted code")}</summary><pre>{attempt.code}</pre></details></div>) : <p className="muted small">{tr("Your first run will start your history.")}</p>)}</Modal>)}</div>
}
