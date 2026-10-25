import { useTranslation } from 'react-i18next'
import { tr, tx } from '../../i18n/text'
import { useEffect, useState } from 'react'
import { ArrowRight, Award, Bookmark, CheckCircle2, Clock3, Flame, RotateCcw, Zap } from 'lucide-react'
import { Badge, EmptyState, SectionHeading, TechnologyIcon } from '../../components/ui'
import { getTrack, lessons, tracks } from '../curriculum/content'
import { challenges } from '../coding/challenges'
import { calculateStreak, dayKey, getStats, type LearningEvent } from './model'
import { useProgress } from './ProgressProvider'
import { useLearningSignals } from './learningSignals'
import { loadFeature } from '../../lib/featureStorage'
import { errorMessage } from '../../lib/supabase'

export default function ProgressPage({ navigate, savedOnly = false }: { navigate: (path: string) => void; savedOnly?: boolean }) {
  useTranslation()

  const { state } = useProgress()
  const signals = useLearningSignals()
  const stats = getStats(state)
  const [other, setOther] = useState({ interviews: 0, projects: 0, error: '' })
  useEffect(() => {
    let active = true
    async function load() {
      try {
        const [interviewsModel, projectsModel] = await Promise.all([import('../interviews/model'), import('../projects/model')])
        const [interviews, projects] = await Promise.all([loadFeature('interviews', 'workspace', interviewsModel.emptyInterviews), loadFeature('projects', 'workspace', projectsModel.emptyProjects)])
        if (active) setOther({ interviews: interviewsModel.validateInterviews(interviews).history.length, projects: Object.values(projectsModel.validateProjects(projects).progress).filter(progress => progress.completedAt !== null).length, error: '' })
      } catch (cause) { if (active) setOther({ interviews: 0, projects: 0, error: errorMessage(cause) }) }
    }
    void load()
    return () => { active = false }
  }, [])
  const savedLessons = lessons.filter(lesson => state.bookmarks.includes(lesson.id))
  if (savedOnly) return <div className="page"><div className="page-heading"><div><div className="eyebrow">{tr("KEEP THE GOOD STUFF CLOSE")}</div><h1>{tr("Saved for later")}<span className="heading-dot">.</span></h1><p>{tr("Your own little library of concepts worth coming back to.")}</p></div><Bookmark className="text-accent" /></div>{tx(savedLessons.length ? <div className="saved-lessons">{tx(savedLessons.map(lesson => <button className="continue-card" key={lesson.id} onClick={() => navigate(`lesson/${lesson.id}`)}><TechnologyIcon track={getTrack(lesson.trackId)} /><div className="continue-copy"><span className="eyebrow">{tx(getTrack(lesson.trackId).name)}</span><h3>{tx(lesson.title)}</h3><p>{tx(lesson.subtitle)}</p></div><ArrowRight size={18} /></button>))}</div> : <EmptyState title={tr("A place for your next rabbit hole")} description={tr("Use “Save lesson” in any lesson to keep it here.")} action={tr("Explore learning paths")} onAction={() => navigate('paths')} />)}</div>
  const codingEvents: LearningEvent[] = signals.coding.attempts.map(attempt => ({ id: attempt.id, lesson_id: null, kind: attempt.passed && !attempt.assisted ? 'practice' : 'check_failed', xp: 0, minutes: 0, created_at: attempt.createdAt }))
  const allEvents = [...state.events, ...codingEvents]
  const streak = calculateStreak(allEvents)
  const days = Array.from({ length: 84 }, (_, index) => { const day = new Date(); day.setDate(day.getDate() - 83 + index); return day })
  const activeDays = new Map<string, number>()
  allEvents.forEach(event => { const day = dayKey(new Date(event.created_at)); activeDays.set(day, (activeDays.get(day) ?? 0) + 1) })
  const monday = new Date(); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7)); monday.setHours(0, 0, 0, 0)
  const weeklyDays = new Set(allEvents.filter(event => event.kind !== 'check_failed' && Date.parse(event.created_at) >= monday.getTime()).map(event => dayKey(new Date(event.created_at)))).size
  const knownScores = Object.entries(signals.scores).filter((entry): entry is [string, number] => entry[1] !== null).sort((left, right) => right[1] - left[1])
  const missed = [...new Set(state.events.filter(event => event.kind === 'check_failed').map(event => event.lesson_id))]
  const recent = [
    ...state.events.map(event => ({ id: event.id, title: lessons.find(lesson => lesson.id === event.lesson_id)?.title ?? 'Lesson check', description: event.kind === 'check_failed' ? 'Check attempted' : event.kind === 'practice' ? 'Review passed' : 'Lesson completed', date: event.created_at })),
    ...signals.coding.attempts.map(attempt => ({ id: attempt.id, title: challenges.find(challenge => challenge.id === attempt.challengeId)?.title ?? 'Coding challenge', description: attempt.passed ? attempt.assisted ? 'Passed with solution assistance' : 'Tests passed' : 'Tests need work', date: attempt.createdAt })),
  ].sort((left, right) => Date.parse(right.date) - Date.parse(left.date)).slice(0, 8)
  return <div className="page">
    <div className="page-heading"><div><div className="eyebrow">{tr("PROGRESS YOU CAN POINT TO")}</div><h1>{tr("Your learning, in perspective")}<span className="heading-dot">.</span></h1><p>{tr("Real activity. Honest signals. A clearer next step.")}</p></div><Badge accent>{tr("Recorded activity only")}</Badge></div>
    {tx((signals.error || other.error) && <p className="error-message" role="alert">{tr("Some activity could not be loaded:")}{' '}{tx(signals.error || other.error)}</p>)}
    <div className="stats-row analytics-stats">{tx([
      { icon: Zap, label: 'Experience earned', value: `${stats.xp + signals.stats.xp} XP` },
      { icon: CheckCircle2, label: 'Lessons completed', value: `${stats.completed} / ${lessons.length}` },
      { icon: Flame, label: 'Learning streak', value: `${streak} days` },
      { icon: Clock3, label: 'Recorded practice', value: `${stats.minutes + signals.stats.minutes} min` },
    ].map(item => <section className="stat" key={item.label}><div className="stat-label"><item.icon size={16} />{tx(item.label)}</div><div className="stat-number">{tx(item.value)}</div></section>))}</div>
    <div className="analytics-grid">
      <section className="panel activity-panel"><SectionHeading title={tr("Showing up adds up")} subtitle={tr("Your last 12 weeks · lesson and coding attempts")} /><div className="heatmap" aria-label={tr("Learning activity over the last 84 days")}>{tx(days.map(day => <div key={dayKey(day)} className={`heatmap-day intensity-${Math.min(3, activeDays.get(dayKey(day)) ?? 0)}`} title={tr(`${day.toLocaleDateString()}: ${activeDays.get(dayKey(day)) ?? 0} attempts`)} aria-label={tr(`${day.toLocaleDateString()}: ${activeDays.get(dayKey(day)) ?? 0} attempts`)} />))}</div><div className="heatmap-caption"><span>{tx(allEvents.length)} {tr("recorded attempts")}</span><span>{tr("Less")}{' '}<i /><i /><i /><i /> {tr("More")}</span></div><div className="activity-summary"><strong>{tr("This week:")}{' '}{tx(Math.min(weeklyDays, 5))} {tr("/ 5 active learning days")}</strong><p>{tr("A suggested weekly goal. A passed lesson check or independently solved challenge makes an active day.")}</p></div></section>
      <section className="panel milestones-panel"><SectionHeading title={tr("Small wins, earned")} />{tx([
        { title: 'First principles', description: 'Complete one lesson check', earned: stats.completed >= 1 },
        { title: 'From idea to implementation', description: 'Solve a challenge without revealing the solution', earned: signals.stats.completed >= 1 },
        { title: 'Find your rhythm', description: 'Build a three-day learning streak', earned: streak >= 3 },
      ].map(milestone => <div className={`milestone ${milestone.earned ? 'unlocked' : ''}`} key={milestone.title}><Award /><div><strong>{tx(milestone.title)}</strong><p>{tx(milestone.description)}</p></div>{tx(milestone.earned && <CheckCircle2 size={18} />)}</div>))}</section>
    </div>
    <div className="stats-row"><section className="stat"><div className="stat-label">{tr("Challenges solved")}</div><div className="stat-number">{tx(signals.stats.completed)}<span>/ {tx(challenges.length)}</span></div></section><section className="stat"><div className="stat-label">{tr("Failed coding attempts")}</div><div className="stat-number">{tx(signals.stats.failed)}</div></section><section className="stat"><div className="stat-label">{tr("Interview reports")}</div><div className="stat-number">{tx(other.interviews)}</div><button className="text-button" onClick={() => navigate('interviews')}>{tr("Review self-assessments")}</button></section><section className="stat"><div className="stat-label">{tr("Projects reported complete")}</div><div className="stat-number">{tx(other.projects)}</div><div className="stat-note">{tr("Self-reported · no mastery credit")}</div></section></div>
    <SectionHeading title={tr("A closer look at your stack")} subtitle={tr("Evidence score: 40% diagnostic accuracy + 60% independently solved available challenges. A small sample, not certification.")} action={tr("Take a diagnostic")} onAction={() => navigate('assessments')} />
    <div className="skill-table-wrapper"><table className="skill-table"><thead><tr><th>{tr("Technology")}</th><th>{tr("Lessons")}</th><th>{tr("Diagnostic signal")}</th><th>{tr("Evidence score")}</th><th><span className="sr-only">{tr("Action")}</span></th></tr></thead><tbody>{tx(tracks.map(track => {
      const available = lessons.filter(lesson => lesson.trackId === track.id)
      const done = available.filter(lesson => state.progress.some(progress => progress.lesson_id === lesson.id && progress.status === 'completed')).length
      const baseline = signals.assessment?.assessedScores[track.id as keyof typeof signals.assessment.assessedScores]
      return <tr key={track.id}><td><TechnologyIcon track={track} small /><strong>{tx(track.name)}</strong></td><td>{tx(available.length ? `${done} / ${available.length}` : 'Curriculum planned')}</td><td>{tx(baseline === undefined ? 'Not assessed' : `${baseline}% on 3 questions`)}</td><td><Badge accent={signals.scores[track.id] !== null}>{tx(signals.scores[track.id] === null ? 'Not assessed' : `${signals.scores[track.id]} / 100`)}</Badge></td><td><button className="icon-button" aria-label={tr(`Open ${track.name} path`)} onClick={() => navigate(`paths/${track.id}`)}><ArrowRight size={16} /></button></td></tr>
    }))}</tbody></table></div>
    <div className="analytics-grid"><section><SectionHeading title={tr("Your next useful step")} />{tx(knownScores.length ? <div className="notice"><strong>{tr("Strongest sampled signal:")}{' '}{tx(getTrack(knownScores[0][0]).name)}</strong><p>{tr("Lowest sampled signal:")}{' '}{tx(getTrack(knownScores.at(-1)![0]).name)}{tr(". Scores are independent and reflect only the available content.")}</p></div> : <div className="notice">{tr("Take a diagnostic to establish your starting point. No track is locked behind prerequisites.")}</div>)}{tx(signals.assessment?.recommendations.map(recommendation => <button className="review-item panel" key={recommendation.technology} onClick={() => navigate(`lesson/${recommendation.lessonId}`)}><RotateCcw size={16} /><span>{tx(getTrack(recommendation.technology).name)}: {tx(recommendation.wrongTopics.join(', '))}</span><ArrowRight size={15} /></button>))}{tx(missed.length > 0 && <button className="text-button" onClick={() => navigate('reviews')}>{tx(missed.length)} {tr("lesson topic(s) with missed checks · Open reviews")}<ArrowRight size={14} /></button>)}</section><section><SectionHeading title={tr("Recent activity")} />{tx(recent.length ? <div className="activity-list">{tx(recent.map(event => <div className="activity-item" key={event.id}><span className="activity-dot" /><div><strong>{tx(event.title)}</strong><p>{tx(event.description)} · {tx(new Date(event.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }))}</p></div></div>))}</div> : <div className="notice">{tr("Your lesson checks and coding attempts will appear here.")}</div>)}</section></div>
  </div>
}
