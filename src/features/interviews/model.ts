import { categories, questions, type Category } from './content'

export const rubric = [
  { id: 'reasoning', label: 'Reasoning', description: 'Did I explain why the approach works and address the question’s key points?' },
  { id: 'evidence', label: 'Evidence & tradeoffs', description: 'Did I give a concrete example, verification plan or honest outcome, including limitations?' },
  { id: 'clarity', label: 'Clarity', description: 'Was my answer structured, specific and understandable?' },
] as const
export type Rating = 0 | 1 | 2 | null
export interface Response { text: string; revealed: boolean; ratings: [Rating, Rating, Rating] }
export interface Attempt {
  id: string; category: Category; mode: 'practice' | 'timed'; questionIds: string[]
  responses: Response[]; index: number; startedAt: number; deadline: number | null
  submittedAt: number | null; reason: 'submitted' | 'timeout' | null
}
export interface InterviewState { version: 1; active: Attempt | null; history: Attempt[] }
export const emptyInterviews: InterviewState = { version: 1, active: null, history: [] }
export const MAX_HISTORY = 30
const timestamp = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 8640000000000000

export function validateInterviews(input: unknown): InterviewState {
  const fail = () => { throw new Error('Saved interview data is invalid or from an unsupported version. It has not been replaced.') }
  if (!input || typeof input !== 'object') return fail()
  const state = input as InterviewState
  const validAttempt = (a: Attempt, finished: boolean) => {
    if (!a || typeof a !== 'object' || typeof a.id !== 'string' || !a.id || a.id.length > 100 || !Object.hasOwn(categories, a.category) || !['practice', 'timed'].includes(a.mode)) return false
    const ids = questions.filter(q => q.category === a.category).map(q => q.id)
    if (!Array.isArray(a.questionIds) || a.questionIds.length !== ids.length || new Set(a.questionIds).size !== ids.length || !a.questionIds.every(id => ids.includes(id))) return false
    if (!timestamp(a.startedAt) || !Number.isInteger(a.index) || a.index < 0 || a.index >= ids.length) return false
    if (a.mode === 'practice' ? a.deadline !== null : !timestamp(a.deadline) || a.deadline !== a.startedAt + 12 * 60_000) return false
    if (finished ? !timestamp(a.submittedAt) || a.submittedAt < a.startedAt || !['submitted', 'timeout'].includes(a.reason ?? '') : a.submittedAt !== null || a.reason !== null) return false
    if (a.reason === 'timeout' && (a.deadline === null || a.submittedAt !== a.deadline)) return false
    if (finished && a.deadline !== null && a.submittedAt! > a.deadline) return false
    return Array.isArray(a.responses) && a.responses.length === ids.length && a.responses.every(r => r && typeof r.text === 'string' && r.text.length <= 12000 && typeof r.revealed === 'boolean' && (a.mode === 'practice' || !r.revealed) && Array.isArray(r.ratings) && r.ratings.length === 3 && r.ratings.every(v => v === null || v === 0 || v === 1 || v === 2) && (finished || r.ratings.every(v => v === null)))
  }
  if (state.version !== 1 || (state.active !== null && !validAttempt(state.active, false)) || !Array.isArray(state.history) || state.history.length > MAX_HISTORY || !state.history.every(a => validAttempt(a, true))) return fail()
  const ids = [...state.history.map(a => a.id), ...(state.active ? [state.active.id] : [])]
  if (new Set(ids).size !== ids.length) return fail()
  return state
}

export function startAttempt(category: Category, mode: Attempt['mode'], now: number, id: string): Attempt {
  const questionIds = questions.filter(q => q.category === category).map(q => q.id)
  return { id, category, mode, questionIds, responses: questionIds.map(() => ({ text: '', revealed: false, ratings: [null, null, null] })), index: 0, startedAt: now, deadline: mode === 'timed' ? now + 12 * 60_000 : null, submittedAt: null, reason: null }
}
export function submitAttempt(state: InterviewState, now: number): InterviewState {
  if (!state.active) return state
  const a = state.active
  const expired = a.deadline !== null && now >= a.deadline
  const completed: Attempt = { ...a, submittedAt: expired ? a.deadline : Math.max(now, a.startedAt), reason: expired ? 'timeout' : 'submitted' }
  return { ...state, active: null, history: [completed, ...state.history].slice(0, MAX_HISTORY) }
}
export type InterviewAction =
  | { type: 'answer'; text: string } | { type: 'move'; index: number } | { type: 'reveal' }
  | { type: 'submit' } | { type: 'tick' } | { type: 'discard' }
  | { type: 'rate'; id: string; question: number; criterion: number; value: Rating }

export function transition(state: InterviewState, action: InterviewAction, now: number): InterviewState {
  if (action.type === 'rate') {
    if (!Number.isInteger(action.question) || !Number.isInteger(action.criterion) || action.criterion < 0 || action.criterion > 2 || ![null, 0, 1, 2].includes(action.value)) return state
    return { ...state, history: state.history.map(a => a.id !== action.id ? a : { ...a, responses: a.responses.map((r, i) => {
      if (i !== action.question) return r
      const ratings: Response['ratings'] = [...r.ratings]
      ratings[action.criterion] = action.value
      return { ...r, ratings }
    }) }) }
  }
  if (!state.active) return state
  if (state.active.deadline !== null && now >= state.active.deadline) return submitAttempt(state, now)
  if (action.type === 'submit') return submitAttempt(state, now)
  if (action.type === 'discard') return { ...state, active: null }
  const a = state.active
  if (action.type === 'move' && Number.isInteger(action.index) && action.index >= 0 && action.index < a.questionIds.length) return { ...state, active: { ...a, index: action.index } }
  if (action.type === 'answer' || (action.type === 'reveal' && a.mode === 'practice')) return { ...state, active: { ...a, responses: a.responses.map((r, i) => i !== a.index ? r : action.type === 'answer' ? { ...r, text: action.text.slice(0, 12000) } : { ...r, revealed: true }) } }
  return state
}
export function selfAssessment(attempt: Attempt) {
  const ratings = attempt.responses.flatMap(r => r.ratings).filter((r): r is 0 | 1 | 2 => r !== null)
  return { answered: attempt.responses.filter(r => r.text.trim()).length, rated: ratings.length, possible: attempt.responses.length * 3, average: ratings.length ? ratings.reduce<number>((sum, n) => sum + n, 0) / ratings.length : null, revealed: attempt.responses.filter(r => r.revealed).length }
}
