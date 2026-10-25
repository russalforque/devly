import { useTranslation } from 'react-i18next'
import { tr, tx } from '../../i18n/text'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowRight, RotateCcw } from 'lucide-react'
import { Badge, SectionHeading, TechnologyIcon } from '../../components/ui'
import { getTrack, lessons } from '../curriculum/content'
import { diagnostics, recommendationLessons, technologies, type AssessmentTechnology } from './content'
import { createAttempt, type AssessmentAttempt, type AssessmentSnapshot } from './model'
import { readAssessments, saveAssessment } from './repository'
import './assessment.css'

const signalNotice = 'These three-question scores are diagnostic signals, not proof of coding mastery. Retakes award no XP, streak credit, or lesson completion.'
const message = (error: unknown) => error instanceof Error ? error.message : 'Assessment storage is unavailable.'
const formattedDate = (value: string) => new Date(value).toLocaleString()

export default function Assessments({ navigate }: { navigate: (path: string) => void }) {
  useTranslation()

  const [snapshot, setSnapshot] = useState<AssessmentSnapshot | null>(null)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [technology, setTechnology] = useState<AssessmentTechnology | null>(null)
  const [answers, setAnswers] = useState<number[]>([])
  const [result, setResult] = useState<AssessmentAttempt | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)
  const submissionLock = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    let active = true
    readAssessments().then(value => { if (active) setSnapshot(value) }).catch(error => { if (active) setLoadError(message(error)) })
    return () => { active = false }
  }, [reload])

  useEffect(() => { if (technology) heading.current?.focus() }, [technology, result])

  function start(next: AssessmentTechnology) {
    setTechnology(next)
    setAnswers(Array(diagnostics[next].length).fill(-1))
    setResult(null)
    setSaved(false)
    setSaveError('')
  }

  async function persist(attempt: AssessmentAttempt) {
    if (submissionLock.current) return
    submissionLock.current = true
    setSaving(true)
    setSaveError('')
    try {
      setSnapshot(await saveAssessment(attempt))
      setSaved(true)
    } catch (error) {
      setSaveError(message(error))
    } finally {
      submissionLock.current = false
      setSaving(false)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!technology || result || submissionLock.current) return
    try {
      const attempt = createAttempt(technology, answers, crypto.randomUUID(), new Date())
      setResult(attempt)
      await persist(attempt)
    } catch (error) { setSaveError(message(error)) }
  }

  const selected = technology ? getTrack(technology) : null
  const questions = technology ? diagnostics[technology] : []
  const answered = answers.filter(answer => answer >= 0).length
  const recommendation = result?.wrongTopics.length ? lessons.find(lesson => lesson.id === recommendationLessons[result.technology]) : null

  return <div className="page assessment-page">
    <div className="page-heading"><div><span className="eyebrow">{tr("YOUR STARTING POINT")}</span><h1>{tr("Skill diagnostics")}</h1><p>{tr("Find a useful next lesson, one technology at a time.")}</p></div><Badge>{tr("3 questions per technology")}</Badge></div>
    <p className="assessment-notice">{tx(signalNotice)}</p>
    {tx(!snapshot ? loadError ? <div className="assessment-panel" role="alert"><h2>{tr("Could not load your diagnostics")}</h2><p>{tx(loadError)}</p><p>{tr("Your saved history has not been replaced.")}</p><button className="button" onClick={() => { setLoadError(''); setReload(value => value + 1) }}>{tr("Retry loading")}</button></div> : <p role="status">{tr("Loading diagnostics…")}</p> : <>
      {tx(!selected ? <>
        <SectionHeading title={tr("Choose any technology")} subtitle={tr("Each baseline is independent. No prerequisites or locked assessments.")} />
        <div className="assessment-grid">{tx(technologies.map(id => {
          const track = getTrack(id)
          const latest = snapshot.latestAttempts[id]
          return <article className="assessment-panel assessment-card" key={id}>
            <div className="assessment-card-heading"><TechnologyIcon track={track} /><h2>{tx(track.name)}</h2></div>
            <p>{tx(diagnostics[id].map(question => question.topic).join(' · '))}</p>
            <div className="assessment-score">{tx(latest ? <><strong>{tx(latest.score)}%</strong><span>{tr("Latest diagnostic ·")}{' '}{tx(latest.correct)}/{tx(latest.total)}</span></> : <strong>{tr("Not assessed")}</strong>)}</div>
            {tx(latest && <time dateTime={latest.createdAt}>{tx(formattedDate(latest.createdAt))}</time>)}
            <button className="button" onClick={() => start(id)} aria-label={tr(`${latest ? 'Retake' : 'Start'} ${track.name} diagnostic`)}>{tx(latest ? 'Retake diagnostic' : 'Start diagnostic')}<ArrowRight size={15} /></button>
          </article>
        }))}</div>
        <section className="assessment-section" aria-label={tr("Adaptive recommendations")}>
          <SectionHeading title={tr("Your next focus")} subtitle={tr("Based on missed topics in each technology’s latest attempt, weakest signal first.")} />
          {tx(snapshot.recommendations.length ? snapshot.recommendations.map(item => {
            const lesson = lessons.find(value => value.id === item.lessonId)!
            return <article className="assessment-panel assessment-recommendation" key={item.technology}><div><Badge>{tx(getTrack(item.technology).name)}</Badge><h3>{tx(lesson.title)}</h3><p>{tr("Review:")}{' '}{tx(item.wrongTopics.join(', '))}.</p></div><button className="button" onClick={() => navigate(`lesson/${item.lessonId}`)}>{tr("Open lesson")}<ArrowRight size={15} /></button></article>
          }) : <p className="assessment-muted">{tx(snapshot.attempts.length ? 'No missed topics in your latest diagnostics. Try applying the concepts in a project, or assess another technology.' : 'Complete a diagnostic to get targeted lesson suggestions.')}</p>)}
        </section>
      </> : <section className="assessment-session" aria-label={tr(`${selected.name} diagnostic`)}>
        <button className="text-button" disabled={saving} onClick={() => { setTechnology(null); setResult(null); setSaveError('') }}>{tr("Back to all diagnostics")}</button>
        <div className="assessment-card-heading"><TechnologyIcon track={selected} /><h2 ref={heading} tabIndex={-1}>{tx(selected.name)}{tx(result ? ' diagnostic result' : ' diagnostic')}</h2></div>
        {tx(!result ? <form onSubmit={submit}>
          <p className="assessment-muted" role="status">{tx(answered)} {tr("of")}{' '}{tx(questions.length)} {tr("answered. Choose one answer for each question.")}</p>
          {tx(questions.map((question, index) => <fieldset className="assessment-question" key={question.id}>
            <legend><span className="assessment-topic">{tx(index + 1)}. {tx(question.topic)}</span>{tx(question.prompt)}</legend>
            {tx(question.options.map((option, optionIndex) => <label className={`assessment-option ${answers[index] === optionIndex ? 'selected' : ''}`} key={option}>
              <input type="radio" required name={question.id} value={optionIndex} checked={answers[index] === optionIndex} onChange={() => setAnswers(current => current.map((answer, position) => position === index ? optionIndex : answer))} />
              <span>{tx(option)}</span>
            </label>))}
          </fieldset>))}
          {tx(saveError && <p role="alert" className="error-message">{tx(saveError)}</p>)}
          <button className="button primary" disabled={answered !== questions.length || saving} type="submit">{tr("Get diagnostic result")}<ArrowRight size={15} /></button>
        </form> : <>
          <div className="assessment-panel assessment-result">
            <strong className="assessment-result-score">{tx(result.score)}%</strong><h3>{tx(result.correct)} {tr("of")}{' '}{tx(result.total)} {tr("concepts answered correctly")}</h3>
            <p>{tx(result.wrongTopics.length ? `Next focus: ${result.wrongTopics.join(', ')}.` : 'No gaps detected in this small sample. Apply these concepts in code to check your understanding.')}</p>
            <time dateTime={result.createdAt}>{tx(formattedDate(result.createdAt))}</time>
            <p role="status">{tx(saving ? 'Saving diagnostic…' : saved ? 'Diagnostic saved.' : 'This result has not been saved. Keep this page open to retry.')}</p>
            {tx(saveError && <div role="alert"><p className="error-message">{tr("Could not save:")}{' '}{tx(saveError)}</p><button className="button" onClick={() => void persist(result)} disabled={saving}>{tr("Retry saving")}</button></div>)}
          </div>
          <SectionHeading title={tr("Review your answers")} />
          {tx(questions.map((question, index) => <article className="assessment-panel assessment-review" key={question.id}>
            <Badge accent={result.answers[index] === question.answer}>{tx(result.answers[index] === question.answer ? 'Correct' : 'Review')} · {tx(question.topic)}</Badge>
            <h3>{tx(question.prompt)}</h3><p>{tr("Your answer:")}{' '}{tx(question.options[result.answers[index]])}</p>
            {tx(result.answers[index] !== question.answer && <p><strong>{tr("Correct answer:")}</strong> {tx(question.options[question.answer])}</p>)}
            <p>{tx(question.explanation)}</p>
          </article>))}
          {tx(recommendation && <div className="assessment-panel assessment-recommendation"><div><h3>{tr("Recommended:")}{' '}{tx(recommendation.title)}</h3><p>{tr("Practice the missed concepts with the existing lesson and exercise.")}</p></div><button className="button primary" disabled={saving} onClick={() => navigate(`lesson/${recommendation.id}`)}>{tr("Open recommended lesson")}<ArrowRight size={15} /></button></div>)}
          <button className="button" disabled={saving} onClick={() => start(technology!)}><RotateCcw size={15} />{tr("Retake diagnostic")}</button>
        </>)}
        <details className="assessment-history"><summary>{tr("Saved attempts for")}{' '}{tx(selected.name)} ({tx(snapshot.attempts.filter(attempt => attempt.technology === technology).length)})</summary>
          <ul>{tx(snapshot.attempts.filter(attempt => attempt.technology === technology).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(attempt => <li key={attempt.id}><time dateTime={attempt.createdAt}>{tx(formattedDate(attempt.createdAt))}</time> — {tx(attempt.score)}% ({tx(attempt.correct)}/{tx(attempt.total)})</li>))}</ul>
        </details>
      </section>)}
    </>)}
  </div>
}
