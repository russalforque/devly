import { lessons } from '../curriculum/content'

export interface Profile { display_name: string; daily_goal_minutes: number }
export interface LessonProgress { lesson_id: string; status: 'started' | 'completed'; answers: number[]; updated_at: string }
export interface LearningEvent { id: string; lesson_id: string | null; kind: 'lesson_completed' | 'check_failed' | 'practice'; xp: number; minutes: number; created_at: string }
export interface LearningState { profile: Profile; progress: LessonProgress[]; events: LearningEvent[]; bookmarks: string[] }
export const emptyState: LearningState = { profile: { display_name: 'Developer', daily_goal_minutes: 20 }, progress: [], events: [], bookmarks: [] }
export const STORAGE_KEY = 'devly.workspace.v1'

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function validateState(input: unknown): LearningState {
  if (!input || typeof input !== 'object') throw new Error('Saved workspace is invalid.')
  const state = input as LearningState
  if (!state.profile || typeof state.profile.display_name !== 'string' || !state.profile.display_name.trim() || state.profile.display_name.length > 40 || ![10, 20, 30, 45, 60].includes(state.profile.daily_goal_minutes)) throw new Error('Saved profile is invalid.')
  const knownLesson = (id: unknown) => typeof id === 'string' && lessons.some(lesson => lesson.id === id)
  const validDate = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value))
  if (!Array.isArray(state.progress) || !state.progress.every(item => item && knownLesson(item.lesson_id) && ['started', 'completed'].includes(item.status) && Array.isArray(item.answers) && item.answers.every(answer => Number.isInteger(answer) && answer >= -1 && answer <= 2) && validDate(item.updated_at))) throw new Error('Saved lesson progress is invalid.')
  if (!Array.isArray(state.events) || !state.events.every(item => item && typeof item.id === 'string' && (item.lesson_id === null || knownLesson(item.lesson_id)) && ['lesson_completed', 'check_failed', 'practice'].includes(item.kind) && Number.isInteger(item.xp) && item.xp >= 0 && Number.isInteger(item.minutes) && item.minutes >= 0 && validDate(item.created_at))) throw new Error('Saved activity is invalid.')
  if (!Array.isArray(state.bookmarks) || !state.bookmarks.every(knownLesson)) throw new Error('Saved bookmarks are invalid.')
  return state
}

export function calculateStreak(events: LearningEvent[], now = new Date()): number {
  const dates = new Set(events.filter(event => event.kind !== 'check_failed').map(event => dayKey(new Date(event.created_at))))
  const cursor = new Date(now)
  if (!dates.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1)
  let count = 0
  while (dates.has(dayKey(cursor))) { count += 1; cursor.setDate(cursor.getDate() - 1) }
  return count
}

export function getStats(state: LearningState, now = new Date()) {
  const today = dayKey(now)
  const completed = state.progress.filter(item => item.status === 'completed')
  const checks = state.events.filter(event => ['lesson_completed', 'check_failed', 'practice'].includes(event.kind))
  return {
    xp: state.events.reduce((total, event) => total + event.xp, 0),
    minutes: state.events.reduce((total, event) => total + event.minutes, 0),
    todayMinutes: state.events.filter(event => dayKey(new Date(event.created_at)) === today).reduce((total, event) => total + event.minutes, 0),
    completed: completed.length,
    streak: calculateStreak(state.events, now),
    accuracy: checks.length ? Math.round(checks.filter(event => event.kind !== 'check_failed').length / checks.length * 100) : null,
    reviews: completed.filter(item => reviewSchedule(state).some(review => review.lessonId === item.lesson_id && review.dueAt <= now.getTime())),
  }
}

export function reviewSchedule(state: LearningState) {
  return state.progress.filter(progress => progress.status === 'completed').flatMap(progress => {
    const events = state.events.filter(event => event.lesson_id === progress.lesson_id).sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at))
    let passes = 0
    let dueAt = 0
    let intervalDays = 3
    for (const event of events) {
      if (event.kind !== 'check_failed') {
        passes += 1
        intervalDays = [3, 7, 14, 30][Math.min(passes - 1, 3)]
        dueAt = Date.parse(event.created_at) + intervalDays * 86400000
      } else if (dueAt) dueAt = Math.min(dueAt, Date.parse(event.created_at) + 86400000)
    }
    return dueAt ? [{ lessonId: progress.lesson_id, passes, dueAt, intervalDays }] : []
  }).sort((left, right) => left.dueAt - right.dueAt)
}

export function recordCheck(state: LearningState, lessonId: string, answers: number[], minutes: number, now = new Date(), eventId: string = crypto.randomUUID()): LearningState {
  const lesson = lessons.find(item => item.id === lessonId)
  if (!lesson) throw new Error('Lesson not found.')
  if (!Number.isFinite(minutes) || minutes < 0) throw new Error('Invalid practice duration.')
  const passed = lesson.questions.every((question, index) => answers[index] === question.answer)
  const previous = state.progress.find(item => item.lesson_id === lessonId)
  const rewarded = state.events.some(event => event.lesson_id === lessonId && event.kind === 'lesson_completed')
  const event: LearningEvent = { id: eventId, lesson_id: lessonId, kind: passed ? rewarded ? 'practice' : 'lesson_completed' : 'check_failed', xp: passed && !rewarded ? 50 : 0, minutes: Math.min(120, Math.floor(minutes)), created_at: now.toISOString() }
  const progress: LessonProgress = { lesson_id: lessonId, status: passed || previous?.status === 'completed' ? 'completed' : 'started', answers, updated_at: passed || !previous ? now.toISOString() : previous.updated_at }
  return { ...state, progress: [...state.progress.filter(item => item.lesson_id !== lessonId), progress], events: [...state.events, event] }
}
