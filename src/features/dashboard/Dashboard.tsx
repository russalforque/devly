import { useTranslation } from 'react-i18next'
import { tr, tx } from '../../i18n/text'
import { ArrowRight, ArrowUpRight, BookOpen, CalendarDays, Check, CheckCheck, ChevronRight, CircleHelp, Clock3, Flame, Lightbulb, Sparkles, Target, TrendingUp, Zap } from 'lucide-react'
import { Badge, Duration, SectionHeading, TechnologyIcon } from '../../components/ui'
import { getTrack, lessons, tracks } from '../curriculum/content'
import { calculateStreak, dayKey, getStats, type LearningEvent } from '../progress/model'
import { useProgress } from '../progress/ProgressProvider'
import { useLearningSignals } from '../progress/learningSignals'

export default function Dashboard({ navigate }: { navigate: (path: string) => void }) {
  useTranslation()

  const { state } = useProgress()
  const signals = useLearningSignals()
  const stats = getStats(state)
  const codingEvents: LearningEvent[] = signals.coding.attempts.map(attempt => ({ id: attempt.id, lesson_id: null, kind: attempt.passed && !attempt.assisted ? 'practice' : 'check_failed', xp: 0, minutes: 0, created_at: attempt.createdAt }))
  const allEvents = [...state.events, ...codingEvents]
  stats.streak = calculateStreak(allEvents)
  stats.xp += signals.stats.xp
  stats.minutes += signals.stats.minutes
  stats.todayMinutes += Math.floor(signals.coding.attempts.filter(attempt => dayKey(new Date(attempt.createdAt)) === dayKey(new Date())).reduce((total, attempt) => total + attempt.seconds, 0) / 60)
  const started = state.progress.find(item => item.status === 'started')
  const nextLesson = lessons.find(lesson => lesson.id === started?.lesson_id) ?? lessons.find(lesson => lesson.id === signals.assessment?.recommendations[0]?.lessonId) ?? lessons.find(lesson => !state.progress.some(item => item.lesson_id === lesson.id && item.status === 'completed')) ?? lessons[0]
  const track = getTrack(nextLesson.trackId)
  const goalProgress = Math.min(100, stats.todayMinutes / state.profile.daily_goal_minutes * 100)
  const today = new Date()
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  const days = Array.from({ length: 7 }, (_, index) => { const day = new Date(weekStart); day.setDate(day.getDate() + index); return day })
  const activeDays = new Set(allEvents.filter(event => event.kind !== 'check_failed').map(event => dayKey(new Date(event.created_at))))
  return <div className="page dashboard-page">
    <div className="page-heading"><div><div className="eyebrow">{tr("YOUR PERSONAL DEVELOPER WORKSPACE")}</div><h1>{tr("Welcome")}{' '}{tx(stats.completed ? 'back' : 'in')}, {tx(state.profile.display_name === 'Developer' ? 'developer' : state.profile.display_name)}<span className="heading-dot">.</span></h1><p>{tr("A little focus today. A stronger developer tomorrow.")}</p></div><div className="date-label"><CalendarDays size={15} />{tx(today.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }))}</div></div>
    {tx(signals.error && <p className="error-message" role="alert">{tr("Additional learning signals could not load:")}{' '}{tx(signals.error)}</p>)}
    <div className="dashboard-top">
      <section className="hero-panel"><div className="hero-copy"><span className="hero-eyebrow"><span className="status-dot" /> {tr("BUILT FOR YOUR NEXT LEVEL")}</span><h2>{tr("Less scrolling.")}<br />{tr("More")}{' '}<span>{tr("understanding.")}</span></h2><p>{tr("Pick up a concept, put it into practice, and make it yours. Your next step is right here.")}</p><button className="button primary" onClick={() => navigate(`lesson/${nextLesson.id}`)}>{tx(started ? 'Continue learning' : 'Start learning')}<ArrowRight size={16} /></button><span className="hero-footnote"><Clock3 size={12} />{tx(nextLesson.minutes)} {tr("minutes is a great start.")}</span></div><div className="hero-art" aria-hidden="true"><div className="art-grid" /><div className="floating-symbol symbol-top">{tx('{ }')}</div><div className="code-window"><div className="code-window-bar"><i /><i /><i /><span>{tr("your-growth.ts")}</span></div><div className="code-window-content"><span className="code-muted">01</span> <span className="code-purple">{tr("const")}</span> {tr("developer =")}{' '}{tx('{')}<br /><span className="code-muted">02</span> {tr("&nbsp;curiosity:")}{' '}<span className="code-green">{tr("true")}</span>,<br /><span className="code-muted">03</span> {tr("&nbsp;progress:")}{' '}<span className="code-green">{tr("'every day'")}</span>,<br /><span className="code-muted">04</span> {tr("&nbsp;potential:")}{' '}<span className="code-purple">{tr("Infinity")}</span><br /><span className="code-muted">05</span> {tx('}')};</div><div className="code-window-footer"><span className="status-dot" />{tr("Always a work in progress.")}</div></div><div className="floating-symbol symbol-bottom"><TrendingUp size={23} /></div><div className="art-label"><Check size={12} /> {tr("Better than yesterday")}</div></div></section>
      <section className="panel daily-goal"><div className="panel-label"><span><Target size={16} />{tr("Daily focus")}</span><Badge>{tr("YOUR PACE")}</Badge></div><div className="goal-visual"><svg viewBox="0 0 120 120" aria-label={tr(`${stats.todayMinutes} of ${state.profile.daily_goal_minutes} minutes completed`)} role="img"><circle className="ring-track" cx="60" cy="60" r="48" /><circle className="ring-value" cx="60" cy="60" r="48" strokeDasharray={`${goalProgress * 3.016} 301.6`} /></svg><div className="goal-number"><strong>{tx(stats.todayMinutes)}<span> / {tx(state.profile.daily_goal_minutes)}</span></strong><small>{tr("minutes today")}</small></div></div><p>{tx(goalProgress >= 100 ? 'Daily goal complete. Nicely done.' : 'Make a little room for progress.')}</p><div className="week-days">{tx(days.map(day => <div key={dayKey(day)} className={dayKey(day) === dayKey(today) ? 'today' : ''}><span>{tx(day.toLocaleDateString('en', { weekday: 'narrow' }))}</span><span className={`day-dot ${activeDays.has(dayKey(day)) ? 'active' : ''}`}>{tx(activeDays.has(dayKey(day)) ? <Check size={12} /> : day.getDate())}</span></div>))}</div></section>
    </div>
    <div className="stats-row">
      {tx([{ icon: Flame, label: 'Current streak', value: stats.streak, suffix: 'days', note: stats.streak ? 'Keep your momentum going' : 'Your next session starts it', style: 'orange' }, { icon: Zap, label: 'Total experience', value: stats.xp, suffix: 'XP', note: 'Earned, never given', style: 'green' }, { icon: CheckCheck, label: 'Lessons completed', value: stats.completed, suffix: `/ ${lessons.length}`, note: 'Knowledge checks passed', style: 'blue' }, { icon: Clock3, label: 'Focused learning', value: stats.minutes, suffix: 'min', note: 'Time from submitted sessions', style: 'purple' }].map(item => <section className="stat" key={item.label}><div className="stat-label"><item.icon size={15} className={`stat-icon ${item.style}`} />{tx(item.label)}</div><div className="stat-number">{tx(item.value)}<span>{tx(item.suffix)}</span></div><div className="stat-note">{tx(item.note)}</div></section>))}
    </div>
    <div className="dashboard-body"><div className="dashboard-main">
      <SectionHeading title={tr(started ? 'Pick up where you left off' : 'Your next good step')} action={tr("All lessons")} onAction={() => navigate('paths')} />
      <button className="continue-card" onClick={() => navigate(`lesson/${nextLesson.id}`)}><TechnologyIcon track={track} /><div className="continue-copy"><div className="lesson-eyebrow">{tx(track.name)}<span>•</span>{tx(nextLesson.difficulty)}</div><h3>{tx(nextLesson.title)}</h3><p>{tx(nextLesson.subtitle)}</p><div className="continue-meta"><Duration minutes={nextLesson.minutes} /><span><BookOpen size={13} />{tr("Lesson + knowledge check")}</span></div></div><span className="round-arrow"><ArrowRight size={18} /></span></button>
      <SectionHeading title={tr("Build depth in your stack")} subtitle={tr("A clear path. No beginner-level gatekeeping.")} action={tr("View all paths")} onAction={() => navigate('paths')} />
      <div className="featured-tracks">{tx(tracks.slice(0, 3).map(item => {
        const trackLessons = lessons.filter(lesson => lesson.trackId === item.id)
        const completed = trackLessons.filter(lesson => state.progress.some(progress => progress.lesson_id === lesson.id && progress.status === 'completed')).length
        return <button className="track-card compact" key={item.id} onClick={() => navigate(`paths/${item.id}`)}><div className="track-card-top"><TechnologyIcon track={item} /><ArrowUpRight size={17} /></div><h3>{tx(item.name)}</h3><p>{tx(item.topics.join(' · '))}</p><div className="track-progress-label"><span>{tx(completed)} / {tx(trackLessons.length)} {tr("lessons")}</span><span>{tx(Math.round(completed / trackLessons.length * 100))}%</span></div><div className="progress-line"><span style={{ width: `${completed / trackLessons.length * 100}%` }} /></div><div className="track-level">{tx(signals.scores[item.id] === null ? 'Not assessed' : `Evidence score: ${signals.scores[item.id]}%`)}<ChevronRight size={13} /></div></button>
      }))}</div>
      <button className="learning-note full-width" onClick={() => navigate('assessments')}><span className="note-icon"><Lightbulb size={19} /></span><div style={{ textAlign: 'left' }}><strong>{tr("Find your next growth opportunity.")}</strong><p>{tr("Take a short diagnostic. Each technology gets its own baseline and targeted recommendations.")}</p></div><ArrowRight size={16} /></button>
    </div><aside className="dashboard-aside">
      <section className="panel practice-card"><div className="panel-label"><span><CodeBrackets />{tr("A small mental workout")}</span></div><Badge accent>{tr("JAVASCRIPT · INTERMEDIATE")}</Badge><h3>{tr("Parallel, but predictable.")}</h3><p>{tr("Three requests finish in a different order. What does")}{' '}<code>Promise.all</code> {tr("return?")}</p><div className="mini-code"><span>{tr("await")}</span> {tr("Promise.all([")}<br />{tr("&nbsp; getUser(), getPosts(), getStats()")}<br />]);</div><div className="practice-footer"><span><CircleHelp size={13} />{tr("2-question check")}</span><span>{tx(state.progress.some(item => item.lesson_id === 'js-async' && item.status === 'completed') ? 'Review · 0 XP' : '+50 XP')}</span></div><button className="button secondary full-width" onClick={() => navigate('lesson/js-async')}>{tr("Give it a thought")}<ArrowRight size={15} /></button></section>
      <section className="review-panel"><div className="panel-label"><span><CalendarDays size={16} />{tr("On your radar")}</span><span className="count-badge">{tx(stats.reviews.length)}</span></div>{tx(stats.reviews.length ? stats.reviews.slice(0, 2).map(review => <button className="review-item" key={review.lesson_id} onClick={() => navigate(`lesson/${review.lesson_id}`)}><span>{tx(lessons.find(lesson => lesson.id === review.lesson_id)?.title)}</span><ChevronRight size={16} /></button>) : <div className="review-empty"><span className="review-check"><Check size={17} /></span><div><strong>{tr("A clean slate.")}</strong><p>{tr("Your completed lessons return on a spaced review schedule.")}</p></div></div>)}</section>
      <button className="mentor-teaser" onClick={() => navigate('mentor')}><span><Sparkles size={17} /><strong>{tr("A nudge, not the answer.")}</strong></span><p>{tr("Choose a conceptual hint, a next step, or deeper guidance. Your own thinking comes first.")}</p><span className="teaser-link">{tr("Open your mentor")}<ArrowUpRight size={13} /></span></button>
    </aside></div><footer className="page-footer"><span><span className="status-dot" />{tr("Your journey. Your pace.")}</span><span>{tr("Learn. Practice. Debug. Master.")}</span></footer>
  </div>
}

function CodeBrackets() {
  useTranslation()
 return <span aria-hidden="true" className="bracket-icon">{tx('</>')}</span> }
