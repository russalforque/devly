import { projects, type Project } from './content'

export interface ProjectProgress { checks: string[]; hints: number; notes: string; completedAt: number | null }
export interface ProjectState { version: 1; progress: Record<string, ProjectProgress> }
export const emptyProjects: ProjectState = { version: 1, progress: {} }
export function newProgress(): ProjectProgress { return { checks: [], hints: 0, notes: '', completedAt: null } }
export function checklist(project: Project) {
  return [
    ...project.tasks.map((label, i) => ({ id: `task-${i}`, label, group: 'Implementation tasks' })),
    ...project.acceptance.map((label, i) => ({ id: `acceptance-${i}`, label, group: 'Acceptance criteria' })),
    ...project.tests.map((label, i) => ({ id: `test-${i}`, label, group: 'Test scenarios' })),
  ]
}
export function isReady(project: Project, progress: ProjectProgress) { return checklist(project).every(item => progress.checks.includes(item.id)) }
export function validateProjects(input: unknown): ProjectState {
  const fail = () => { throw new Error('Saved project data is invalid or from an unsupported version. It has not been replaced.') }
  if (!input || typeof input !== 'object') return fail()
  const state = input as ProjectState
  if (state.version !== 1 || !state.progress || typeof state.progress !== 'object' || Array.isArray(state.progress)) return fail()
  for (const [id, value] of Object.entries(state.progress)) {
    const project = projects.find(p => p.id === id)
    if (!project || !value || typeof value !== 'object') return fail()
    const allowed = checklist(project).map(item => item.id)
    if (!Array.isArray(value.checks) || new Set(value.checks).size !== value.checks.length || !value.checks.every(check => allowed.includes(check)) || !Number.isInteger(value.hints) || value.hints < 0 || value.hints > project.hints.length || typeof value.notes !== 'string' || value.notes.length > 8000) return fail()
    if (value.completedAt !== null && (!Number.isSafeInteger(value.completedAt) || value.completedAt < 0 || value.completedAt > 8640000000000000 || !isReady(project, value))) return fail()
  }
  return state
}
export type ProjectAction = { type: 'check'; check: string; checked: boolean } | { type: 'hint' } | { type: 'notes'; text: string } | { type: 'complete' } | { type: 'reopen' } | { type: 'reset' }
export function updateProject(state: ProjectState, id: string, action: ProjectAction, now: number): ProjectState {
  const project = projects.find(p => p.id === id)
  if (!project) return state
  const previous = state.progress[id] ?? newProgress()
  let next = previous
  if (action.type === 'reset') {
    const progress = { ...state.progress }; delete progress[id]
    return { ...state, progress }
  }
  if (action.type === 'check') {
    if (!checklist(project).some(item => item.id === action.check)) return state
    next = { ...previous, checks: action.checked ? [...new Set([...previous.checks, action.check])] : previous.checks.filter(check => check !== action.check), completedAt: action.checked ? previous.completedAt : null }
  }
  if (action.type === 'hint') next = { ...previous, hints: Math.min(project.hints.length, previous.hints + 1) }
  if (action.type === 'notes') next = { ...previous, notes: action.text.slice(0, 8000) }
  if (action.type === 'complete') {
    if (!isReady(project, previous) || !Number.isSafeInteger(now) || now < 0) return state
    next = { ...previous, completedAt: previous.completedAt ?? now }
  }
  if (action.type === 'reopen') next = { ...previous, completedAt: null }
  return { ...state, progress: { ...state.progress, [id]: next } }
}
