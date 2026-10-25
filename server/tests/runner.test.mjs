// @vitest-environment node
import { readFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { configuredImage, containerArgs, createDockerRunner, CSHARP_COMMAND, WALL_MS } from '../runner/docker.mjs'
import { createRunnerServer, validToken } from '../runner/index.mjs'

const digest = 'a'.repeat(64)
const env = {
  RUNNER_TOKEN: 's'.repeat(48),
  RUNNER_PYTHON_IMAGE: `python:3.13-slim@sha256:${digest}`,
  RUNNER_PHP_IMAGE: `php:8.4-cli@sha256:${digest}`,
  RUNNER_CSHARP_IMAGE: `mcr.microsoft.com/dotnet/sdk:8.0@sha256:${digest}`,
}
const name = 'devly-11111111-1111-4111-8111-111111111111'
const directory = path.join(tmpdir(), 'devly-test-args')
const body = { language: 'python', code: 'untrusted text; $(nothing)', input: 'input\n' }
const ok = { stdout: '', stderr: '', exitCode: 0, truncated: false, timedOut: false, cancelled: false }

describe('container configuration', () => {
  it.each(['python', 'php', 'csharp'])('restricts %s to official digest-pinned images', (language) => {
    const image = configuredImage(language, env)
    const args = containerArgs(language, image, directory, name)
    for (const flag of ['--pull=never', '--network=none', '--read-only', '--user=65534:65534', '--cap-drop=ALL',
      '--security-opt=no-new-privileges=true', '--memory=512m', '--memory-swap=512m', '--cpus=1', '--pids-limit=64', '--log-driver=none']) {
      expect(args).toContain(flag)
    }
    expect(args).toContain(`type=bind,src=${directory},dst=/source,readonly`)
    expect(args).not.toContain('--privileged')
    expect(args).not.toContain(body.code)
    expect(args.filter((arg) => arg === '--tmpfs')).toHaveLength(2)
  })

  it.each(['python:latest', 'evil/python:3@sha256:' + digest, 'python:3@sha256:bad', '--privileged', 'python:3@sha256:' + digest + '\n'])('rejects invalid image %s at argument boundary', (image) => {
    expect(() => containerArgs('python', image, directory, name)).toThrow()
  })

  it('rejects missing config, unknown languages and mount-option injection', () => {
    expect(() => configuredImage('python', {})).toThrow(/pre-pulled/)
    expect(() => configuredImage('__proto__', env)).toThrow()
    expect(() => containerArgs('python', env.RUNNER_PYTHON_IMAGE, directory + ',rw', name)).toThrow()
    expect(() => containerArgs('python', env.RUNNER_PYTHON_IMAGE, directory, '--privileged')).toThrow()
  })

  it('builds C# offline with a fixed SDK command and runtime execution', () => {
    const args = containerArgs('csharp', env.RUNNER_CSHARP_IMAGE, directory, name)
    expect(args.slice(-2)).toEqual(['-c', CSHARP_COMMAND])
    expect(CSHARP_COMMAND).toContain('--configfile NuGet.Config')
    expect(CSHARP_COMMAND).toContain('--no-restore')
    expect(CSHARP_COMMAND).toContain('exec dotnet /work/out/Devly.dll')
  })
})

describe('Docker lifecycle with every process mocked', () => {
  function fakeCommand(start = {}) {
    return vi.fn(async (args) => args[0] === 'start' ? { ...ok, ...start }
      : args[0] === 'inspect' ? { ...ok, stdout: 'false 0\n' } : { ...ok })
  }

  it('writes only source/project files, pipes stdin, and removes ephemeral files and container', async () => {
    let mounted
    const command = fakeCommand()
    command.mockImplementation(async (args) => {
      if (args[0] === 'create') {
        mounted = args[args.indexOf('--mount') + 1].slice('type=bind,src='.length).split(',dst=')[0]
        expect(await readFile(path.join(mounted, 'Program.cs'), 'utf8')).toBe('Console.WriteLine(1);')
        expect(await readFile(path.join(mounted, 'NuGet.Config'), 'utf8')).toContain('<clear />')
        expect(await readFile(path.join(mounted, 'Devly.csproj'), 'utf8')).toContain('<TargetFramework>net8.0</TargetFramework>')
      }
      return args[0] === 'inspect' ? { ...ok, stdout: 'false 7\n' } : { ...ok }
    })
    const result = await createDockerRunner({ env, command })({ ...body, language: 'csharp', code: 'Console.WriteLine(1);' })
    expect(result.exitCode).toBe(7)
    const call = command.mock.calls.find(([args]) => args[0] === 'start')
    expect(call[1]).toMatchObject({ input: 'input\n', timeoutMs: WALL_MS, maxBytes: 65536 })
    expect(command.mock.calls.at(-1)[0].slice(0, 3)).toEqual(['rm', '--force', '--volumes'])
    await expect(access(mounted)).rejects.toThrow()
  })

  it.each([
    [{ timedOut: true, exitCode: 124 }, 124],
    [{ truncated: true, exitCode: 137 }, 137],
  ])('removes a container after execution is stopped', async (start, exitCode) => {
    const command = fakeCommand(start)
    const result = await createDockerRunner({ env, command })(body)
    expect(result.exitCode).toBe(exitCode)
    expect(command.mock.calls.at(-1)[0][0]).toBe('rm')
    expect(command.mock.calls.some(([args]) => args[0] === 'inspect')).toBe(false)
  })

  it('removes on disconnect without passing the aborted signal to cleanup', async () => {
    const command = fakeCommand({ cancelled: true, exitCode: 137 })
    await expect(createDockerRunner({ env, command })(body)).rejects.toMatchObject({ status: 499 })
    expect(command.mock.calls.at(-1)).toHaveLength(1)
    expect(command.mock.calls.at(-1)[0][0]).toBe('rm')
  })

  it('rejects parallel jobs before launching a second container', async () => {
    let finish
    let started
    const ready = new Promise((resolve) => { started = resolve })
    const command = fakeCommand()
    command.mockImplementation(async (args) => {
      if (args[0] === 'start') { started(); return new Promise((resolve) => { finish = resolve }) }
      return args[0] === 'inspect' ? { ...ok, stdout: 'false 0\n' } : { ...ok }
    })
    const run = createDockerRunner({ env, command })
    const first = run(body); await ready
    await expect(run(body)).rejects.toMatchObject({ status: 503 })
    finish({ ...ok }); await first
    expect(command.mock.calls.filter(([args]) => args[0] === 'create')).toHaveLength(1)
  })

  it('disables further jobs when container cleanup fails', async () => {
    const command = fakeCommand()
    command.mockImplementation(async (args) => args[0] === 'rm' ? { ...ok, exitCode: 1 }
      : args[0] === 'inspect' ? { ...ok, stdout: 'false 0\n' } : { ...ok })
    const run = createDockerRunner({ env, command })
    await expect(run(body)).rejects.toThrow(/cleanup failed/)
    const calls = command.mock.calls.length
    await expect(run(body)).rejects.toThrow(/cleanup and restart/)
    expect(command).toHaveBeenCalledTimes(calls)
  })

  it('fails clearly without an image and never creates or starts a container', async () => {
    const command = vi.fn().mockResolvedValue({ ...ok, exitCode: 1 })
    await expect(createDockerRunner({ env, command })(body)).rejects.toThrow(/pre-pull/)
    expect(command).toHaveBeenCalledTimes(1)
    expect(command.mock.calls[0][0].slice(0, 2)).toEqual(['image', 'inspect'])
  })
})

describe('runner HTTP boundary with execution mocked', () => {
  const servers = []
  afterEach(async () => {
    for (const server of servers.splice(0)) {
      server.cancelJobs(); server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    }
  })
  async function start(run = vi.fn().mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0, truncated: false })) {
    const server = createRunnerServer({ env, run }); servers.push(server)
    server.listen(0, '127.0.0.1'); await once(server, 'listening')
    const url = `http://127.0.0.1:${server.address().port}/execute`
    const send = (value = body, headers = {}) => fetch(url, { method: 'POST', headers: {
      Authorization: `Bearer ${env.RUNNER_TOKEN}`, 'Content-Type': 'application/json', ...headers,
    }, body: JSON.stringify(value) })
    return { server, url, send, run }
  }

  it('requires a configured token and performs a fixed-size secure comparison', () => {
    expect(() => createRunnerServer({ env: {} })).toThrow(/RUNNER_TOKEN/)
    expect(validToken(`Bearer ${env.RUNNER_TOKEN}`, env.RUNNER_TOKEN)).toBe(true)
    expect(validToken('Bearer short', env.RUNNER_TOKEN)).toBe(false)
    expect(validToken(`Basic ${env.RUNNER_TOKEN}`, env.RUNNER_TOKEN)).toBe(false)
  })

  it('rejects auth, oversized and invalid bodies before invoking run', async () => {
    const f = await start()
    expect((await f.send(body, { Authorization: 'Bearer wrong' })).status).toBe(401)
    expect((await f.send({ ...body, language: 'javascript' })).status).toBe(400)
    expect((await f.send({ ...body, code: 'a'.repeat(17000) })).status).toBe(413)
    expect((await f.send(body, { 'Content-Type': 'text/plain' })).status).toBe(415)
    expect(f.run).not.toHaveBeenCalled()
    expect((await f.send()).status).toBe(200)
  })

  it('has no queue and cancels an active job when the client disconnects', async () => {
    let started
    let cancelled
    const ready = new Promise((resolve) => { started = resolve })
    const aborted = new Promise((resolve) => { cancelled = resolve })
    const run = vi.fn((_body, signal) => new Promise((_resolve, reject) => {
      started()
      signal.addEventListener('abort', () => { cancelled(); reject(new Error('cancelled')) }, { once: true })
    }))
    const f = await start(run)
    const controller = new AbortController()
    const pending = fetch(f.url, { method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${env.RUNNER_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).catch(() => null)
    await ready
    expect((await f.send()).status).toBe(503)
    controller.abort(); await pending; await aborted
    expect(run).toHaveBeenCalledTimes(1)
  })
})
