import { Worker } from 'node:worker_threads'
import { describe, expect, it } from 'vitest'
import { challenges } from './challenges'
import { compileTypeScript, MAX_CODE_LENGTH, runCode, workerSource, type RunResult } from './engine'

function evaluateTrustedFixture(code: string, challengeIndex: number): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(`const {parentPort}=require('node:worker_threads'); globalThis.self=globalThis; self.postMessage=value=>parentPort.postMessage(value); ${workerSource}; parentPort.on('message',data=>self.onmessage({data}));`, { eval: true, execArgv: [] })
    const timer = setTimeout(() => { void worker.terminate(); reject(new Error('Fixture timeout')) }, 2500)
    worker.once('message', result => { clearTimeout(timer); void worker.terminate(); resolve(result) })
    worker.once('error', error => { clearTimeout(timer); void worker.terminate(); reject(error) })
    worker.postMessage({ code, tests: challenges[challengeIndex].tests })
  })
}
describe('deterministic challenge harness', () => {
  it.each(challenges.map((challenge, index) => [challenge.title, index] as const))('passes the reviewed reference for %s', async (_title, index) => {
    const output = await evaluateTrustedFixture(challenges[index].reference, index)
    expect(output.error).toBeUndefined()
    expect(output.tests).toHaveLength(challenges[index].tests.length)
    expect(output.tests.every(test => test.passed)).toBe(true)
  })
  it.each(challenges.map((challenge, index) => [challenge.title, index] as const))('detects the unfinished or broken starter for %s', async (_title, index) => {
    const output = await evaluateTrustedFixture(challenges[index].starter, index)
    expect(output.tests.some(test => !test.passed)).toBe(true)
  })
  it('surfaces syntax errors and bounded console output', async () => {
    const invalid = await evaluateTrustedFixture('function solve( {', 0)
    expect(invalid.error).toBeTruthy()
    const noisy = await evaluateTrustedFixture('function solve(){ for(let index=0;index<100;index++) console.log("x".repeat(2000)); return {}; }', 0)
    expect(noisy.logs.length).toBeLessThanOrEqual(50)
    expect(noisy.logs.every(line => line.length <= 1000)).toBe(true)
  })
  it('compiles typed reference code before evaluation', async () => {
    const output = await compileTypeScript('function solve(input: { quantity: string }[]): number { return input.reduce((total, row) => total + Number(row.quantity), 0); }')
    const result = await evaluateTrustedFixture(output, 4)
    expect(result.tests.every(test => test.passed)).toBe(true)
  })
  it('rejects oversized submissions before creating an execution frame', async () => {
    await expect(runCode(' '.repeat(MAX_CODE_LENGTH + 1), [])).rejects.toThrow('limit')
    expect(document.querySelector('iframe')).toBeNull()
  })
  it('uses an opaque sandbox, blocks network, and ignores messages from other windows', async () => {
    const controller = new AbortController()
    const result = runCode('function solve(){}', [], controller.signal)
    const frame = document.querySelector('iframe')!
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts')
    expect(frame.srcdoc).toContain("connect-src 'none'")
    window.dispatchEvent(new MessageEvent('message', { data: { kind: 'devly:result', payload: { tests: [], logs: [] } }, source: window }))
    expect(document.querySelector('iframe')).not.toBeNull()
    controller.abort()
    await expect(result).rejects.toThrow('cancelled')
    expect(document.querySelector('iframe')).toBeNull()
  })
})
