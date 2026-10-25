import { useTranslation } from 'react-i18next'
import { tr, tx } from '../../i18n/text'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Bookmark, Check, CheckCircle2, ChevronRight, Copy, ExternalLink, Lightbulb, RotateCcw, Target } from 'lucide-react'
import { Badge, Duration, EmptyState, TechnologyIcon } from '../../components/ui'
import { getTrack, lessons } from './content'
import { useProgress } from '../progress/ProgressProvider'

export default function LessonReader({ id, navigate }: { id: string; navigate: (path: string) => void }) {
  useTranslation()

  const lesson = lessons.find(item => item.id === id)
  const { state, busy, beginLesson, submitCheck, toggleBookmark } = useProgress()
  const [answers, setAnswers] = useState<number[]>([])
  const [feedback, setFeedback] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState('')
  const elapsed = useRef(0)
  const started = useRef(false)
  const resultRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (lesson && !started.current) { started.current = true; void beginLesson(lesson.id) }
  }, [lesson, beginLesson])
  useEffect(() => {
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible' && document.hasFocus()) elapsed.current += 1 }, 1000)
    return () => window.clearInterval(interval)
  }, [])
  useEffect(() => { if (feedback) resultRef.current?.focus() }, [feedback])
  if (!lesson) return <div className="page"><EmptyState title={tr("Lesson not found")} description={tr("This lesson may have moved. Explore the available learning paths.")} action={tr("Learning paths")} onAction={() => navigate('paths')} /></div>
  const track = getTrack(lesson.trackId)
  const completed = state.progress.some(item => item.lesson_id === lesson.id && item.status === 'completed')
  const passed = lesson.questions.every((question, index) => answers[index] === question.answer)
  const bookmarked = state.bookmarks.includes(id)
  const nextLesson = lessons[(lessons.findIndex(item => item.id === id) + 1) % lessons.length]
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!lesson || answers.filter(answer => answer !== undefined).length < lesson.questions.length) return
    const saved = await submitCheck(lesson.id, answers, Math.floor(elapsed.current / 60))
    if (saved) { elapsed.current %= 60; setFeedback(true) }
  }
  async function copyCode() {
    try { await navigator.clipboard.writeText(lesson!.code); setCopied(true); setCopyError('') }
    catch { setCopyError('Clipboard unavailable. Select the code to copy it manually.') }
  }
  return <div className="page lesson-page"><div className="lesson-topline"><button className="text-button back-link" onClick={() => navigate(`paths/${track.id}`)}><ArrowLeft size={15} />{tx(track.name)} {tr("learning path")}</button><button className={`button small-button ${bookmarked ? 'saved' : ''}`} onClick={() => void toggleBookmark(id)} disabled={busy} aria-pressed={bookmarked}><Bookmark size={15} fill={bookmarked ? 'currentColor' : 'none'} />{tx(bookmarked ? 'Saved' : 'Save lesson')}</button></div><div className="lesson-layout"><article className="lesson-content"><div className="lesson-badges"><Badge accent>{tx(lesson.difficulty)}</Badge><Duration minutes={lesson.minutes} />{tx(completed && <span className="completed-label"><CheckCircle2 size={15} />{tr("Check passed")}</span>)}</div><h1>{tx(lesson.title)}</h1><p className="lesson-subtitle">{tx(lesson.subtitle)}</p><div className="objective"><Target size={20} /><div><strong>{tr("What you’ll be able to do")}</strong><p>{tx(lesson.objective)}</p></div></div><section id="concept"><div className="eyebrow">{tr("01 / UNDERSTAND")}</div><h2>{tr("The idea behind the code")}</h2>{tx(lesson.concept.map(paragraph => <p key={paragraph}>{tx(paragraph)}</p>))}</section><section id="example"><div className="eyebrow">{tr("02 / CONNECT")}</div><h2>{tr("A real-world example")}</h2><p>{tx(lesson.scenario)}</p><div className="lesson-code"><div className="code-heading"><span>{tx(lesson.language)}</span><button onClick={() => void copyCode()} aria-label={tr("Copy code example")}>{tx(copied ? <Check size={14} /> : <Copy size={14} />)}{tx(copied ? 'Copied' : 'Copy')}</button></div><pre><code>{lesson.code}</code></pre></div>{tx(copyError && <p role="status">{tx(copyError)}</p>)}<div className="common-mistakes"><h3>{tr("Watch out for")}</h3><ul>{tx(lesson.mistakes.map(mistake => <li key={mistake}>{tx(mistake)}</li>))}</ul></div></section><section id="practice"><div className="eyebrow">{tr("03 / TRY IT YOURSELF")}</div><h2>{tr("Make it yours")}</h2><div className="exercise-box"><Lightbulb size={21} /><p>{tx(lesson.exercise)}</p></div><p className="small muted">{tr("Try this exercise in your own environment, then explore the coding challenges for executable practice. Code examples on this page are not executed.")}</p></section><button className="button" onClick={() => navigate('challenges')}>{tr("Open coding challenges")}<ArrowRight size={15} /></button><section id="knowledge"><div className="eyebrow">{tr("04 / CHECK YOUR UNDERSTANDING")}</div><h2>{tr("Think it through")}</h2><p>{tr("Two questions to connect the dots. Pass both to complete this lesson. A first completion earns 50 XP; repeat reviews earn no additional XP.")}</p><form onSubmit={submit} className="knowledge-form">{tx(lesson.questions.map((question, questionIndex) => <fieldset key={question.prompt} disabled={feedback || busy}><legend><span>{tx(questionIndex + 1)}.</span> {tx(question.prompt)}</legend>{tx(question.options.map((option, optionIndex) => <label className={`answer-option ${answers[questionIndex] === optionIndex ? 'chosen' : ''} ${feedback && optionIndex === question.answer ? 'correct' : ''} ${feedback && answers[questionIndex] === optionIndex && optionIndex !== question.answer ? 'incorrect' : ''}`} key={option}><input type="radio" name={`question-${questionIndex}`} value={optionIndex} required checked={answers[questionIndex] === optionIndex} onChange={() => setAnswers(current => { const next = [...current]; next[questionIndex] = optionIndex; return next })} /><span>{tx(option)}</span>{tx(feedback && optionIndex === question.answer && <Check size={16} />)}</label>))}{tx(feedback && <p className="answer-explanation">{tx(question.explanation)}</p>)}</fieldset>))}{tx(!feedback && <button className="button primary" disabled={busy}>{tx(busy ? 'Saving your check…' : 'Check my understanding')}<ArrowRight size={16} /></button>)}</form>{tx(feedback && <div ref={resultRef} tabIndex={-1} className={`check-result ${passed ? 'passed' : ''}`} role="status"><CheckCircle2 size={24} /><div><h3>{tx(passed ? 'That’s a concept worth keeping.' : 'A useful mistake. Let’s learn from it.')}</h3><p>{tx(passed ? 'Your knowledge check is saved. Come back in three days for a review, and practice the exercise to build deeper understanding.' : 'Your attempt is saved. Review the explanations, revisit the example, and give it another try.')}</p><button className="text-button" onClick={() => { setFeedback(false); setAnswers([]) }}><RotateCcw size={14} />{tx(passed ? 'Practice again' : 'Try again')}</button></div></div>)}</section><section id="takeaway"><div className="eyebrow">{tr("05 / TAKE IT WITH YOU")}</div><h2>{tr("The takeaway")}</h2><p>{tx(lesson.summary)}</p><a className="source-link" href={lesson.source.url} target="_blank" rel="noreferrer">{tx(lesson.source.label)}<ExternalLink size={14} /></a><div className="next-topic"><span>{tr("Next in this curriculum")}</span><strong>{tx(lesson.next)}</strong><Badge>{tr("Planned lesson")}</Badge></div>{tx(completed && <button className="button primary" onClick={() => navigate(`lesson/${nextLesson.id}`)}>{tr("Explore another concept")}<ArrowRight size={16} /></button>)}</section></article><aside className="lesson-aside"><div className="lesson-toc panel"><div className="toc-track"><TechnologyIcon track={track} small /><strong>{tx(track.name)}</strong></div><span className="eyebrow">{tr("IN THIS LESSON")}</span>{tx([['concept', 'Understand the concept'], ['example', 'A real-world example'], ['practice', 'Try it yourself'], ['knowledge', 'Knowledge check'], ['takeaway', 'The takeaway']].map(([sectionId, label]) => <button key={sectionId} onClick={() => document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{tx(label)}<ChevronRight size={13} /></button>))}<hr /><strong className="small">{tr("Before you start")}</strong><ul>{tx(lesson.prerequisites.map(item => <li key={item}>{tx(item)}</li>))}</ul></div><div className="quiet-note"><Lightbulb size={18} /><p>{tr("Pause before reading on.")}<br />{tr("Can you explain the idea in your own words?")}</p></div></aside></div></div>
}
