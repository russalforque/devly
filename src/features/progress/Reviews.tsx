import { useTranslation } from 'react-i18next'
import { tr, tx } from '../../i18n/text'
import { ArrowRight, CalendarDays, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge, EmptyState, TechnologyIcon } from '../../components/ui'
import { getTrack, lessons } from '../curriculum/content'
import { useProgress } from './ProgressProvider'
import { reviewSchedule } from './model'

export default function Reviews({ navigate }: { navigate: (path: string) => void }) {
  useTranslation()

  const { state } = useProgress()
  const schedule = reviewSchedule(state)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer) }, [])
  return <div className="page"><div className="page-heading"><div><div className="eyebrow">{tr("MAKE IT STICK")}</div><h1>{tr("Review, then move forward")}<span className="heading-dot">.</span></h1><p>{tr("Recall first. Revisit the explanation only when you need it.")}</p></div><Badge accent>{tx(schedule.filter(review => review.dueAt <= now).length)} {tr("due")}</Badge></div><div className="notice"><CalendarDays size={18} /><p>{tr("Successful checks space reviews at 3, 7, 14, and 30 days. A missed review brings the next review forward to within one day. Repeated reviews earn no extra lesson XP.")}</p></div>{tx(schedule.length ? <div className="saved-lessons">{tx(schedule.map(review => { const lesson = lessons.find(item => item.id === review.lessonId)!; return <button className="continue-card" key={review.lessonId} onClick={() => navigate(`lesson/${review.lessonId}`)}><TechnologyIcon track={getTrack(lesson.trackId)} /><div className="continue-copy"><Badge accent={review.dueAt <= now}>{tx(review.dueAt <= now ? 'Due for review' : `Due ${new Date(review.dueAt).toLocaleDateString()}`)}</Badge><h3>{tx(lesson.title)}</h3><p>{tx(review.passes)} {tr("passed check")}{tx(review.passes === 1 ? '' : 's')} · {tx(review.intervalDays)}{tr("-day spacing")}</p></div><ArrowRight size={17} /></button> }))}</div> : <EmptyState title={tr("A little practice comes first")} description={tr("Complete a lesson’s knowledge check to start its review schedule.")} action={tr("Explore lessons")} onAction={() => navigate('paths')} />)}<div className="learning-note"><RotateCcw size={19} /><p>{tr("These are transparent scheduling rules, not a claim about your memory or long-term mastery.")}</p></div></div>
}
