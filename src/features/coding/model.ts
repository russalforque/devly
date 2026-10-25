import { challenges } from './challenges'
import type { RunResult } from './engine'

export interface Attempt { id: string; challengeId: string; createdAt: string; language: string; code: string; passed: boolean; result: RunResult; seconds: number; assisted: boolean }
export interface CodingState { drafts: Record<string, string>; attempts: Attempt[] }
export const initialCodingState: CodingState = { drafts: {}, attempts: [] }
export function validateCoding(value: unknown): CodingState {
  if (!value || typeof value !== 'object') throw new Error('Invalid coding history.')
  const state = value as CodingState
  if (!state.drafts || Array.isArray(state.drafts) || typeof state.drafts !== 'object' || !Object.values(state.drafts).every(code => typeof code === 'string' && code.length <= 50000)) throw new Error('Invalid saved drafts.')
  if (!Array.isArray(state.attempts) || !state.attempts.every(attempt => attempt && typeof attempt.id === 'string' && challenges.some(challenge => challenge.id === attempt.challengeId) && typeof attempt.passed === 'boolean' && typeof attempt.code === 'string' && attempt.result && Array.isArray(attempt.result.tests) && Array.isArray(attempt.result.logs) && Number.isFinite(Date.parse(attempt.createdAt)) && Number.isFinite(attempt.seconds))) throw new Error('Invalid saved attempts.')
  return state
}
export function codingStats(state: CodingState) {
  const solved = new Set(state.attempts.filter(attempt => attempt.passed && !attempt.assisted).map(attempt => attempt.challengeId))
  return { completed: solved.size, xp: solved.size * 100, failed: state.attempts.filter(attempt => !attempt.passed).length, minutes: Math.floor(state.attempts.reduce((total, attempt) => total + attempt.seconds, 0) / 60) }
}
