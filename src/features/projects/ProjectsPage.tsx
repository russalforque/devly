import { useTranslation } from 'react-i18next'
import { tr, tx } from '../../i18n/text'
import { useEffect, useRef, useState } from 'react'
import { Badge, Modal, SectionHeading } from '../../components/ui'
import { projects } from './content'
import { checklist, isReady, newProgress, updateProject, type ProjectAction } from './model'
import { useProjects } from './useProjects'
import './projects.css'

export default function ProjectsPage({ navigate }: { navigate: (path: string) => void }) {
  useTranslation()

  const { data, error, pending, update, retry } = useProjects()
  const [selected, setSelected] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'reset' | 'complete' | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const project = projects.find(p => p.id === selected)
  const progress = project ? data?.progress[project.id] ?? newProgress() : null
  const items = project ? checklist(project) : []
  useEffect(() => { heading.current?.focus() }, [selected])
  useEffect(() => {
    if (!pending && !error) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [pending, error])
  function act(action: ProjectAction) { if (project) update(s => updateProject(s, project.id, action, Date.now())) }

  return <div className="page projects-page">
    <div className="page-heading"><div><span className="eyebrow">{tr("PHASE 05 · BUILD SOMETHING USEFUL")}</span><h1>{tr("Mini projects")}<span className="heading-dot">.</span></h1><p>{tr("Small scope. Real constraints. Work you can explain.")}</p></div><Badge accent>{tr("6 guided assignments")}</Badge></div>
    <p className="project-storage" role="status">{tx(pending ? 'Saving changes…' : data && !error ? 'Changes saved.' : '')} {tr("Storage uses your account when cloud is configured, otherwise this browser only. Cloud mode requires sign-in. Completion is self-reported and does not award verified mastery.")}</p>
    {tx(error && <div className="project-notice" role="alert"><p>{tx(error)} {tx(data ? 'Keep this page open and retry before leaving.' : 'Editing is disabled to protect existing records.')}</p><button className="button" onClick={retry} disabled={pending > 0}>{tr("Retry")}{' '}{tx(data ? 'save' : 'load')}</button></div>)}
    {tx(!data ? !error && <p role="status">{tr("Loading your projects…")}</p> : project && progress ? <>
      <button className="text-button" onClick={() => setSelected(null)}>{tr("← All projects")}</button>
      <section className="panel project-brief"><div className="project-row"><Badge accent>{tx(project.stack)}</Badge><span className="project-muted">{tr("Estimated")}{' '}{tx(project.duration)}</span></div><h2 ref={heading} tabIndex={-1}>{tx(project.title)}</h2><p>{tx(project.brief)}</p><p className="project-muted">{tr("Build in your own editor and repository. Devly tracks your checklist and notes; it does not execute code, run these tests, host your project or verify completion.")}</p><div className="project-progress"><label htmlFor="project-progress">{tx(progress.checks.length)} {tr("of")}{' '}{tx(items.length)} {tr("checks recorded")}</label><progress id="project-progress" max={items.length} value={progress.checks.length} /></div>{tx(progress.completedAt !== null && <p className="project-complete" role="status">{tr("Completion self-reported on")}{' '}{tx(new Date(progress.completedAt).toLocaleString())}{tr(". Mastery has not been assessed.")}</p>)}</section>
      <div className="project-layout"><div>
        {tx(['Implementation tasks', 'Acceptance criteria', 'Test scenarios'].map(group => <section className="panel project-section" key={group}><SectionHeading title={tr(group)} subtitle={tr(group === 'Test scenarios' ? 'Run these in your own environment, then record what you verified.' : group === 'Acceptance criteria' ? 'Check each criterion only after verifying the behavior.' : 'A suggested build sequence. Adjust the implementation to your stack.')} /><div className="project-checklist">{tx(items.filter(item => item.group === group).map(item => <label key={item.id}><input type="checkbox" checked={progress.checks.includes(item.id)} onChange={e => act({ type: 'check', check: item.id, checked: e.target.checked })} /><span>{tx(item.label)}</span></label>))}</div></section>))}
        <section className="panel project-section"><SectionHeading title={tr("Build notes & evidence")} subtitle={tr("Record commands, results, decisions and what you would improve. Avoid secrets or private data.")} /><label className="project-field">{tr("Your notes")}<textarea rows={8} maxLength={8000} value={progress.notes} onChange={e => act({ type: 'notes', text: e.target.value })} placeholder={tr("Repository location, tests run, observed results, tradeoffs, next steps…")} /></label><p className="project-muted">{tx(progress.notes.length.toLocaleString())} {tr("/ 8,000 characters")}</p></section>
      </div><aside>
        <section className="panel project-section"><SectionHeading title={tr("Suggested architecture")} /><ol className="project-list">{tx(project.architecture.map(item => <li key={item}>{tx(item)}</li>))}</ol></section>
        <section className="panel project-section"><SectionHeading title={tr("A little nudge")} subtitle={tr("Reveal one hint at a time, from direction to implementation.")} />{tx(progress.hints === 0 && <p className="project-muted">{tr("Try sketching your approach before opening the first hint.")}</p>)}<ol className="project-list">{tx(project.hints.slice(0, progress.hints).map((hint, index) => <li key={hint}><strong>{tr("Hint")}{' '}{tx(index + 1)}</strong><p>{tx(hint)}</p></li>))}</ol>{tx(progress.hints < project.hints.length ? <button className="button secondary" onClick={() => act({ type: 'hint' })}>{tr("Reveal hint")}{' '}{tx(progress.hints + 1)} {tr("of")}{' '}{tx(project.hints.length)}</button> : <p className="project-muted">{tr("All hints revealed. Using hints does not reduce your progress.")}</p>)}</section>
        <section className="panel project-section"><SectionHeading title={tr("Close the loop")} /><p className="project-muted">{tr("Complete every task, acceptance check and test scenario, then record your own completion. No automatic grading is performed.")}</p><div className="project-actions">{tx(progress.completedAt === null ? <button className="button primary" disabled={!isReady(project, progress)} onClick={() => setConfirm('complete')}>{tr("Report project complete")}</button> : <button className="button" onClick={() => act({ type: 'reopen' })}>{tr("Reopen project")}</button>)}<button className="button" onClick={() => navigate('paths')}>{tr("Review learning paths")}</button><button className="text-button" onClick={() => setConfirm('reset')}>{tr("Reset this project")}</button></div>{tx(!isReady(project, progress) && <p className="project-muted">{tx(items.length - progress.checks.length)} {tr("checks remaining. Unchecking an item reopens a completed project.")}</p>)}</section>
      </aside></div>
    </> : <>
      <SectionHeading title={tr("Choose a brief")} subtitle={tr("Each assignment includes a build plan, acceptance criteria, architecture notes, tests and progressive hints.")} />
      <div className="project-grid">{tx(projects.map(p => {
        const record = data.progress[p.id] ?? newProgress()
        const total = checklist(p).length
        const started = record.checks.length > 0 || record.hints > 0 || !!record.notes.trim()
        return <article className="panel project-card" key={p.id}><div className="project-row"><Badge accent>{tx(p.stack)}</Badge><span className="project-muted">{tx(p.duration)}</span></div><h2>{tx(p.title)}</h2><p>{tx(p.brief)}</p><div className="project-progress"><label htmlFor={`progress-${p.id}`}>{tx(record.checks.length)}/{tx(total)} {tr("checks ·")}{' '}{tx(record.completedAt !== null ? 'Complete · self-reported' : started ? 'In progress' : 'Ready to start')}</label><progress id={`progress-${p.id}`} max={total} value={record.checks.length} /></div><button className="button" onClick={() => setSelected(p.id)}>{tx(record.completedAt !== null ? 'Review project' : started ? 'Continue project' : 'Open assignment')}</button></article>
      }))}</div>
    </>)}
    {tx(confirm && project && <Modal title={tr(confirm === 'reset' ? 'Reset this project?' : 'Record your completion?')} onClose={() => setConfirm(null)}><p>{tx(confirm === 'reset' ? `This clears checks, notes, revealed hints and completion for “${project.title}”. Other projects are kept. This cannot be undone.` : 'You confirm that you built the assignment and personally verified the checklist. This records your report; it is not a code review, automatic test result or mastery certification.')}</p><div className="project-actions"><button className="button" onClick={() => setConfirm(null)}>{tr("Cancel")}</button><button className="button primary" onClick={() => { act({ type: confirm }); setConfirm(null) }}>{tx(confirm === 'reset' ? 'Reset project' : 'Confirm self-reported completion')}</button></div></Modal>)}
  </div>
}
