import { useTranslation } from 'react-i18next'
import { tr, tx } from '../../i18n/text'
import { useEffect, useRef, useState } from 'react'
import { Badge, EmptyState, Modal, SectionHeading } from '../../components/ui'
import { categories, questions, type Category } from './content'
import { MAX_HISTORY, rubric, selfAssessment, startAttempt, transition, type Attempt, type Rating } from './model'
import { useInterviews } from './useInterviews'
import './interviews.css'

export default function InterviewsPage({ navigate }: { navigate: (path: string) => void }) {
  useTranslation()

  const { data, error, pending, update, retry } = useInterviews()
  const [category, setCategory] = useState<Category>('frontend')
  const [mode, setMode] = useState<Attempt['mode']>('practice')
  const [reportId, setReportId] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [confirm, setConfirm] = useState<'submit' | 'discard' | 'clear' | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const active = data?.active
  const report = data?.history.find(a => a.id === reportId) ?? (!active ? data?.history[0] : undefined)

  useEffect(() => {
    if (!active || active.deadline === null) return
    const tick = () => { const time = Date.now(); setNow(time); update(s => transition(s, { type: 'tick' }, time)) }
    const timer = window.setInterval(tick, 250)
    const onVisibility = () => { if (!document.hidden) tick() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility) }
  }, [active?.id, active?.deadline, active, update])
  useEffect(() => { heading.current?.focus() }, [active?.id, active?.index, report?.id])
  useEffect(() => {
    if (!pending && !error) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [pending, error])

  function begin(selectedCategory = category, selectedMode = mode) {
    const time = Date.now()
    setNow(time); setReportId(null)
    update(s => s.active ? s : { ...s, active: startAttempt(selectedCategory, selectedMode, time, crypto.randomUUID()) })
  }
  function confirmAction() {
    if (confirm === 'clear') { update(s => ({ ...s, history: [] })); setReportId(null) }
    else if (confirm) { update(s => transition(s, { type: confirm }, Date.now())); setReportId(null) }
    setConfirm(null)
  }
  const remaining = active?.deadline === null || !active ? null : Math.max(0, Math.ceil((active.deadline - now) / 1000))
  const question = active ? questions.find(q => q.id === active.questionIds[active.index])! : null
  const response = active?.responses[active.index]
  const summary = report ? selfAssessment(report) : null

  return <div className="page interviews-page">
    <div className="page-heading"><div><span className="eyebrow">{tr("PHASE 03 · PRACTICE WITH INTENTION")}</span><h1>{tr("Interview studio")}<span className="heading-dot">.</span></h1><p>{tr("Think it through. Write it down. Reflect on your own evidence.")}</p></div><Badge accent>{tr("8 categories · 24 questions")}</Badge></div>
    <p className="interview-storage" role="status">{tx(pending ? 'Saving changes…' : data && !error ? 'Changes saved.' : '')} {tr("Storage uses your account when cloud is configured, otherwise this browser only. Cloud mode requires sign-in. No AI grading or verified mastery. Keep personal examples anonymous.")}</p>
    {tx(error && <div className="interview-notice" role="alert"><p>{tx(error)} {tx(data ? 'Keep this page open and retry before leaving.' : 'Editing is disabled to protect existing records.')}</p><button className="button" onClick={retry} disabled={pending > 0}>{tr("Retry")}{' '}{tx(data ? 'save' : 'load')}</button></div>)}
    {tx(!data ? !error && <p role="status">{tr("Loading your interviews…")}</p> : <>
      {tx(active && question && response ? <section className="panel interview-panel" aria-label={tr("Current interview")}>
        <div className="interview-row"><Badge accent>{tx(categories[active.category])} · {tx(active.mode === 'timed' ? 'Timed interview' : 'Practice')}</Badge><span className="interview-clock" role="timer" aria-label={tr(remaining === null ? 'Untimed practice' : `${remaining} seconds remaining`)}>{tx(remaining === null ? 'No time limit' : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')} remaining`)}</span></div>
        <p className="interview-muted">{tr("Question")}{' '}{tx(active.index + 1)} {tr("of")}{' '}{tx(active.questionIds.length)} · {tx(active.responses.filter(r => r.text.trim()).length)} {tr("answered")}</p>
        <h2 ref={heading} tabIndex={-1}>{tx(question.title)}</h2><p className="interview-prompt">{tx(question.prompt)}</p>
        <label className="interview-field">{tr("Your response")}<textarea value={response.text} maxLength={12000} rows={9} onChange={e => update(s => transition(s, { type: 'answer', text: e.target.value }, Date.now()))} placeholder={tr("Explain your reasoning, tradeoffs and how you would verify the result.")} /></label>
        <div className="interview-row"><span className="interview-muted">{tx(response.text.length.toLocaleString())} {tr("/ 12,000 characters · Blank answers can be skipped.")}</span>{tx(active.mode === 'practice' && !response.revealed && <button className="button secondary" onClick={() => update(s => transition(s, { type: 'reveal' }, Date.now()))}>{tr("Reveal reference answer")}</button>)}</div>
        {tx(active.mode === 'practice' && response.revealed && <div className="interview-reference"><h3>{tr("Reference answer · revealed during practice")}</h3><p>{tx(question.sample)}</p><ul>{tx(question.signals.map(signal => <li key={signal}>{tx(signal)}</li>))}</ul></div>)}
        {tx(active.mode === 'timed' && <p className="interview-muted">{tr("12 minutes for all three questions. The timer keeps running when you leave. At expiry, your saved responses are submitted; references unlock after submission.")}</p>)}
        <div className="interview-actions"><button className="button" disabled={active.index === 0} onClick={() => update(s => transition(s, { type: 'move', index: active.index - 1 }, Date.now()))}>{tr("Previous")}</button>{tx(active.index < active.questionIds.length - 1 && <button className="button" onClick={() => update(s => transition(s, { type: 'move', index: active.index + 1 }, Date.now()))}>{tx(response.text.trim() ? 'Next question' : 'Skip question')}</button>)}<button className="button primary" onClick={() => setConfirm('submit')}>{tr("Submit interview")}</button><button className="text-button" onClick={() => setConfirm('discard')}>{tr("Discard draft")}</button></div>
      </section> : <section className="panel interview-panel">
        <SectionHeading title={tr("Choose your next conversation")} subtitle={tr("Three curated questions per session. Practice reveals are optional; timed sessions keep references hidden.")} />
        <div className="interview-setup"><label className="interview-field">{tr("Category")}<select value={category} onChange={e => setCategory(e.target.value as Category)}>{tx(Object.entries(categories).map(([id, label]) => <option key={id} value={id}>{tx(label)}</option>))}</select></label><fieldset><legend>{tr("Session mode")}</legend><label><input type="radio" name="interview-mode" checked={mode === 'practice'} onChange={() => setMode('practice')} /> {tr("Practice · untimed")}</label><label><input type="radio" name="interview-mode" checked={mode === 'timed'} onChange={() => setMode('timed')} /> {tr("Interview · 12 minutes")}</label></fieldset><button className="button primary" onClick={() => begin()}>{tr("Start session")}</button></div>
      </section>)}

      {tx(!active && report && summary && <section className="panel interview-panel" aria-label={tr("Interview report")}>
        <div className="interview-row"><h2 ref={heading} tabIndex={-1}>{tr("Your reflection report")}</h2><Badge>{tx(report.reason === 'timeout' ? 'Time expired' : 'Submitted')} · {tx(report.mode)}</Badge></div>
        <p>{tx(categories[report.category])} · {tx(new Date(report.submittedAt!).toLocaleString())} · {tx(Math.ceil((report.submittedAt! - report.startedAt) / 60000))} {tr("min elapsed")}</p>
        <div className="interview-summary"><div><strong>{tx(summary.answered)}/{tx(report.questionIds.length)}</strong><span>{tr("Responses written")}</span></div><div><strong>{tx(summary.rated)}/{tx(summary.possible)}</strong><span>{tr("Rubric ratings entered")}</span></div><div><strong>{tx(summary.average === null ? 'Not rated' : `${summary.average.toFixed(1)} / 2`)}</strong><span>{tr("Subjective self-rating average")}</span></div></div>
        <p className="interview-muted">{tr("You assess these responses yourself. This average describes only your entered ratings, not correctness, hiring readiness or mastery.")}{' '}{tx(summary.revealed > 0 && `${summary.revealed} reference answer(s) were revealed during practice.`)}</p>
        <p className="interview-muted">{tr("0 = needs work · 1 = partly demonstrated · 2 = clearly demonstrated. Leave a criterion unrated if you are unsure. Compare with the reference, identify one gap, then retry in your own words.")}</p>
        {tx(report.questionIds.map((id, index) => {
          const q = questions.find(item => item.id === id)!
          const r = report.responses[index]
          return <details className="interview-review" key={id}><summary>{tx(index + 1)}. {tx(q.title)} · {tx(r.text.trim() ? 'Answered' : 'Unanswered')}{tx(r.revealed ? ' · Reference used' : '')}</summary><p>{tx(q.prompt)}</p><h3>{tr("Your submitted response")}</h3><p className="interview-written">{tx(r.text.trim() || 'No response submitted.')}</p><div className="interview-reference"><h3>{tr("One possible answer")}</h3><p>{tx(q.sample)}</p><h3>{tr("Points to look for")}</h3><ul>{tx(q.signals.map(signal => <li key={signal}>{tx(signal)}</li>))}</ul></div><fieldset><legend>{tr("Your subjective assessment")}</legend>{tx(rubric.map((criterion, criterionIndex) => <label className="interview-field" key={criterion.id}>{tx(criterion.label)}<span className="interview-muted">{tx(criterion.description)}</span><select value={r.ratings[criterionIndex] ?? ''} onChange={e => update(s => transition(s, { type: 'rate', id: report.id, question: index, criterion: criterionIndex, value: e.target.value === '' ? null : Number(e.target.value) as Rating }, Date.now()))}><option value="">{tr("Not rated")}</option><option value="0">{tr("0 · Needs work")}</option><option value="1">{tr("1 · Partly demonstrated")}</option><option value="2">{tr("2 · Clearly demonstrated")}</option></select></label>))}</fieldset></details>
        }))}
        <div className="interview-actions"><button className="button secondary" onClick={() => begin(report.category, report.mode)}>{tr("Retry this category")}</button><button className="button" onClick={() => navigate('paths')}>{tr("Review learning paths")}</button></div>
      </section>)}
      <section className="interview-history"><SectionHeading title={tr("Session history")} subtitle={tr(`Your latest ${MAX_HISTORY} submitted sessions are retained. Reloading restores an unfinished session.`)} />{tx(!data.history.length ? <EmptyState title={tr("A fresh start")} description={tr("Your first submitted interview will appear here, along with your written answers and self-assessment.")} /> : <><div className="interview-history-list">{tx(data.history.map(a => <button className="panel interview-history-item" key={a.id} disabled={!!active} onClick={() => setReportId(a.id)} aria-pressed={report?.id === a.id}><span><strong>{tx(categories[a.category])}</strong><small>{tx(new Date(a.submittedAt!).toLocaleString())} · {tx(a.mode)}</small></span><span>{tx(selfAssessment(a).answered)}/{tx(a.questionIds.length)} {tr("answered · View report")}</span></button>))}</div>{tx(active && <p className="interview-muted">{tr("Submit or discard your current session to review earlier reports.")}</p>)}<button className="text-button" onClick={() => setConfirm('clear')}>{tr("Clear submitted history")}</button></>)}</section>
    </>)}
    {tx(confirm && <Modal title={tr(confirm === 'submit' ? 'Submit this interview?' : confirm === 'discard' ? 'Discard this draft?' : 'Clear submitted history?')} onClose={() => setConfirm(null)}><p>{tx(confirm === 'submit' ? 'Your written responses will be locked, including any blanks. References and the self-assessment rubric will then be available.' : confirm === 'discard' ? 'Your current written responses will be removed. This cannot be undone.' : 'All submitted interview reports and ratings will be removed from this workspace. An active draft is kept.')}</p><div className="interview-actions"><button className="button" onClick={() => setConfirm(null)}>{tr("Cancel")}</button><button className="button primary" onClick={confirmAction}>{tx(confirm === 'submit' ? 'Submit and review' : confirm === 'discard' ? 'Discard draft' : 'Clear history')}</button></div></Modal>)}
  </div>
}
