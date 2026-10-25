import { describe, expect, it } from 'vitest'
import { projects } from './content'
import { checklist, emptyProjects, isReady, newProgress, updateProject, validateProjects, type ProjectState } from './model'

const project = projects[0]
function readyState() {
  return checklist(project).reduce((s, check) => updateProject(s, project.id, { type: 'check', check: check.id, checked: true }, 1000), emptyProjects)
}
describe('self-reported project completion', () => {
  it('starts without completion evidence and cannot complete a partial checklist', () => {
    expect(newProgress().completedAt).toBeNull()
    expect(updateProject(emptyProjects, project.id, { type: 'complete' }, 1000)).toBe(emptyProjects)
    const partial = updateProject(emptyProjects, project.id, { type: 'check', check: 'task-0', checked: true }, 1000)
    expect(updateProject(partial, project.id, { type: 'complete' }, 1000)).toBe(partial)
  })
  it('requires explicit completion even after every task, acceptance criterion and test is checked', () => {
    const ready = readyState()
    expect(isReady(project, ready.progress[project.id])).toBe(true)
    expect(ready.progress[project.id].completedAt).toBeNull()
    const done = updateProject(ready, project.id, { type: 'complete' }, 1000)
    expect(done.progress[project.id].completedAt).toBe(1000)
    expect(updateProject(done, project.id, { type: 'complete' }, 2000).progress[project.id].completedAt).toBe(1000)
    expect(Object.keys(done.progress[project.id])).not.toContain('mastery')
  })
  it('reopens completion when any evidence is unchecked and does not silently recomplete', () => {
    const done = updateProject(readyState(), project.id, { type: 'complete' }, 1000)
    const reopened = updateProject(done, project.id, { type: 'check', check: 'test-0', checked: false }, 2000)
    expect(reopened.progress[project.id].completedAt).toBeNull()
    expect(updateProject(reopened, project.id, { type: 'check', check: 'test-0', checked: true }, 3000).progress[project.id].completedAt).toBeNull()
    expect(done.progress[project.id].completedAt).toBe(1000)
  })
  it('keeps project data isolated when revealing hints, writing notes and resetting', () => {
    let state = updateProject(emptyProjects, projects[1].id, { type: 'notes', text: 'Keep this evidence' }, 1000)
    for (let i = 0; i < 10; i++) state = updateProject(state, project.id, { type: 'hint' }, 1000)
    expect(state.progress[project.id].hints).toBe(project.hints.length)
    expect(state.progress[project.id].checks).toEqual([])
    state = updateProject(state, project.id, { type: 'reset' }, 1000)
    expect(state.progress[project.id]).toBeUndefined()
    expect(state.progress[projects[1].id].notes).toBe('Keep this evidence')
  })
  it('rejects unknown checklist entries and keeps repeat checks idempotent', () => {
    expect(updateProject(emptyProjects, project.id, { type: 'check', check: 'invented', checked: true }, 1)).toBe(emptyProjects)
    let state = emptyProjects
    for (let i = 0; i < 3; i++) state = updateProject(state, project.id, { type: 'check', check: 'task-0', checked: true }, 1)
    expect(state.progress[project.id].checks).toEqual(['task-0'])
  })
})
describe('project persistence boundary', () => {
  it('round-trips completed and in-progress work', () => {
    const state = updateProject(readyState(), project.id, { type: 'complete' }, 1000)
    expect(validateProjects(JSON.parse(JSON.stringify(state)))).toEqual(state)
  })
  it('rejects corrupt, fabricated or obsolete project evidence', () => {
    const cases: unknown[] = [null, [], { version: 2, progress: {} }, { version: 1, progress: [] }, { version: 1, progress: { unknown: newProgress() } }]
    for (const progress of [
      { ...newProgress(), checks: ['task-0', 'task-0'] },
      { ...newProgress(), checks: ['task-999'] },
      { ...newProgress(), completedAt: 123 },
      { ...newProgress(), hints: 999 },
      { ...newProgress(), notes: 'x'.repeat(8001) },
    ]) cases.push({ version: 1, progress: { [project.id]: progress } })
    for (const value of cases) expect(() => validateProjects(value)).toThrow('not been replaced')
  })
  it('all six briefs can reach a valid self-reported completion', () => {
    let state: ProjectState = emptyProjects
    for (const p of projects) {
      for (const check of checklist(p)) state = updateProject(state, p.id, { type: 'check', check: check.id, checked: true }, 1)
      state = updateProject(state, p.id, { type: 'complete' }, 2)
    }
    expect(Object.values(validateProjects(state).progress).filter(p => p.completedAt !== null)).toHaveLength(6)
  })
})
