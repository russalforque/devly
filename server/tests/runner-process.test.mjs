// @vitest-environment node
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
vi.mock('node:child_process', () => ({ spawn: vi.fn() }))
import { spawn } from 'node:child_process'
import { dockerCommand } from '../runner/docker.mjs'

function processMock() {
  const child = new EventEmitter()
  child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough()
  child.kill = vi.fn(() => { queueMicrotask(() => child.emit('close', null)); return true })
  vi.mocked(spawn).mockReturnValue(child)
  return child
}

describe('Docker CLI process boundary (spawn is mocked)', () => {
  it('uses an argv array without a host shell and bounds combined output', async () => {
    const child = processMock()
    const promise = dockerCommand(['start', '--attach', 'fixed-name'], { input: 'untrusted stdin', maxBytes: 8 })
    expect(spawn).toHaveBeenCalledWith('docker', ['start', '--attach', 'fixed-name'], expect.objectContaining({ shell: false, windowsHide: true }))
    child.stdout.write(Buffer.from('12345')); child.stderr.write(Buffer.from('abcdef'))
    const result = await promise
    expect(result.stdout + result.stderr).toBe('12345abc')
    expect(result.truncated).toBe(true); expect(result.exitCode).toBe(137)
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
  })

  it('kills attached CLI on wall deadline', async () => {
    vi.useFakeTimers()
    try {
      const child = processMock()
      const promise = dockerCommand(['start', 'fixed-name'], { timeoutMs: 100 })
      await vi.advanceTimersByTimeAsync(101)
      expect(await promise).toMatchObject({ timedOut: true, exitCode: 124 })
      expect(child.kill).toHaveBeenCalled()
    } finally { vi.useRealTimers() }
  })

  it('kills attached CLI on disconnect and reports missing Docker clearly', async () => {
    let child = processMock()
    const controller = new AbortController()
    const promise = dockerCommand(['start', 'fixed-name'], { signal: controller.signal })
    controller.abort()
    expect(await promise).toMatchObject({ cancelled: true })
    child = processMock()
    const missing = dockerCommand(['image', 'inspect', 'fixed-image'])
    child.emit('error', new Error('ENOENT'))
    await expect(missing).rejects.toMatchObject({ status: 503, message: expect.stringContaining('Docker is unavailable') })
  })
})
