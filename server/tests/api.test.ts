// @vitest-environment node
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { createMentorHandler } from '../../api/mentor.ts'
import { createExecuteHandler, runnerEndpoint } from '../../api/execute.ts'
import { readJson } from '../http.ts'
import type { Dependencies, OwnerClient } from '../services.ts'

const requestBody = { message: 'How do loops work?', context: '', level: 1, allowSolution: false }
function fixture() {
  const getUser = vi.fn().mockResolvedValue({ data: { user: { id: 'owner-id' } }, error: null })
  const rpc = vi.fn().mockResolvedValue({ data: true, error: null })
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Try one iteration.' }] }],
  })))
  const createOwnerClient = vi.fn(() => ({ auth: { getUser }, rpc }) as OwnerClient)
  const deps: Dependencies = { env: {
    SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    OPENAI_API_KEY: 'server-only-secret', OPENAI_MODEL: 'configured-test-model',
    RUNNER_URL: 'https://runner.example.com', RUNNER_TOKEN: 'x'.repeat(32),
  }, fetch: fetcher as typeof fetch, createOwnerClient }
  return { deps, getUser, rpc, fetcher, createOwnerClient }
}

async function invoke(handler: ReturnType<typeof createMentorHandler>, body: unknown = requestBody,
  options: { authorization?: string; method?: string; contentType?: string; raw?: boolean } = {}) {
  const req = Readable.from(options.raw ? [String(body)] : []) as unknown as IncomingMessage & { body?: unknown }
  req.headers = { authorization: options.authorization ?? 'Bearer user-session', 'content-type': options.contentType ?? 'application/json' }
  req.method = options.method ?? 'POST'
  if (!options.raw) req.body = body
  const res = new EventEmitter() as ServerResponse
  const headers: Record<string, unknown> = {}
  res.setHeader = ((name: string, value: unknown) => { headers[name] = value; return res }) as ServerResponse['setHeader']
  let output = ''
  res.end = ((text: string) => { output = text; return res }) as ServerResponse['end']
  await handler(req, res)
  return { status: res.statusCode, body: JSON.parse(output), headers, req, res }
}

describe('owner-only API boundary', () => {
  it('calls getUser then owner RPC then atomic budget before invoking a provider', async () => {
    const f = fixture()
    const result = await invoke(createMentorHandler(f.deps))
    expect(result.status).toBe(200)
    expect(result.body).toEqual({ answer: 'Try one iteration.' })
    expect(f.getUser).toHaveBeenCalledWith('user-session')
    expect(f.rpc.mock.calls).toEqual([['is_owner'], ['consume_service_budget', { service: 'mentor' }]])
    expect(f.getUser.mock.invocationCallOrder[0]).toBeLessThan(f.rpc.mock.invocationCallOrder[0])
    expect(f.rpc.mock.invocationCallOrder[1]).toBeLessThan(f.fetcher.mock.invocationCallOrder[0])
    expect(result.headers['Cache-Control']).toBe('no-store')
  })

  it.each(['', 'Basic abc', 'Bearer a b', 'Bearer '])('rejects malformed auth %s', async (authorization) => {
    const f = fixture()
    expect((await invoke(createMentorHandler(f.deps), requestBody, { authorization })).status).toBe(401)
    expect(f.getUser).not.toHaveBeenCalled(); expect(f.fetcher).not.toHaveBeenCalled()
  })

  it.each([
    [{ data: { user: null }, error: null }, 401],
    [{ data: { user: null }, error: { status: 401 } }, 401],
    [{ data: { user: null }, error: { status: 503 } }, 503],
  ])('rejects failed user verification', async (value, status) => {
    const f = fixture(); f.getUser.mockResolvedValue(value)
    expect((await invoke(createMentorHandler(f.deps))).status).toBe(status)
    expect(f.rpc).not.toHaveBeenCalled(); expect(f.fetcher).not.toHaveBeenCalled()
  })

  it.each([[false, null, 403], [null, null, 503], ['true', null, 503], [true, { message: 'private error' }, 503]])(
    'fails closed on owner RPC response %s', async (data, error, status) => {
      const f = fixture(); f.rpc.mockResolvedValue({ data, error })
      const result = await invoke(createMentorHandler(f.deps))
      expect(result.status).toBe(status); expect(f.fetcher).not.toHaveBeenCalled()
      expect(JSON.stringify(result.body)).not.toContain('private error')
    },
  )

  it.each([[false, null, 429], [null, null, 503], ['true', null, 503], [true, { message: 'DB detail' }, 503]])(
    'fails closed on budget RPC response %s', async (data, error, status) => {
      const f = fixture(); f.rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data, error })
      const result = await invoke(createMentorHandler(f.deps))
      expect(result.status).toBe(status); expect(f.fetcher).not.toHaveBeenCalled()
      expect(JSON.stringify(result.body)).not.toContain('DB detail')
    },
  )

  it('fails closed on rejected RPC promises', async () => {
    const f = fixture(); f.rpc.mockResolvedValueOnce({ data: true, error: null }).mockRejectedValueOnce(new Error('secret'))
    expect((await invoke(createMentorHandler(f.deps))).status).toBe(503)
    expect(f.fetcher).not.toHaveBeenCalled()
  })

  it.each(['OPENAI_API_KEY', 'OPENAI_MODEL', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'])('reports missing %s without calling provider', async (key) => {
    const f = fixture(); delete f.deps.env[key]
    expect((await invoke(createMentorHandler(f.deps))).status).toBe(503)
    expect(f.fetcher).not.toHaveBeenCalled()
    expect(f.rpc.mock.calls.some(([name]) => name === 'consume_service_budget')).toBe(false)
  })

  it('accepts fallback public Supabase config and rejects a secret key', async () => {
    const f = fixture()
    f.deps.env.VITE_SUPABASE_URL = f.deps.env.SUPABASE_URL; delete f.deps.env.SUPABASE_URL
    f.deps.env.VITE_SUPABASE_PUBLISHABLE_KEY = f.deps.env.SUPABASE_PUBLISHABLE_KEY; delete f.deps.env.SUPABASE_PUBLISHABLE_KEY
    expect((await invoke(createMentorHandler(f.deps))).status).toBe(200)
    f.deps.env.SUPABASE_PUBLISHABLE_KEY = 'sb_secret_forbidden'
    expect((await invoke(createMentorHandler(f.deps))).status).toBe(503)
  })

  it.each([
    [null, 400], [{ ...requestBody, level: 4 }, 400], [{ ...requestBody, level: '1' }, 400],
    [{ ...requestBody, allowSolution: 'true' }, 400], [{ ...requestBody, model: 'override' }, 400],
    [{ ...requestBody, message: ' ' }, 400], [{ ...requestBody, message: 'a'.repeat(4001) }, 413],
    [{ ...requestBody, context: 'é'.repeat(4001) }, 413],
    [{ ...requestBody, message: 'a'.repeat(4000), context: 'b'.repeat(7000) }, 413],
    [{ ...requestBody, message: 'a'.repeat(17000) }, 413],
  ])('validates mentor bodies without consuming budget', async (body, status) => {
    const f = fixture()
    expect((await invoke(createMentorHandler(f.deps), body)).status).toBe(status)
    expect(f.rpc).toHaveBeenCalledTimes(1); expect(f.fetcher).not.toHaveBeenCalled()
  })

  it('validates method, MIME type and raw malformed JSON', async () => {
    const f = fixture(); const handler = createMentorHandler(f.deps)
    expect((await invoke(handler, requestBody, { method: 'GET' })).status).toBe(405)
    expect((await invoke(handler, requestBody, { contentType: 'text/plain' })).status).toBe(415)
    expect((await invoke(handler, '{bad', { raw: true })).status).toBe(400)
    expect(f.fetcher).not.toHaveBeenCalled()
  })

  it('caps chunked bodies and supports already parsed JSON', async () => {
    const f = fixture()
    expect((await invoke(createMentorHandler(f.deps), 'x'.repeat(17000), { raw: true })).status).toBe(413)
    const req = Readable.from([]) as unknown as IncomingMessage & { body: unknown }
    req.headers = { 'content-type': 'application/json', 'content-length': '17000' }; req.body = {}
    await expect(readJson(req, new AbortController().signal)).rejects.toMatchObject({ status: 413 })
  })
})

describe('provider contracts', () => {
  it.each([1, 2, 3, 4])('sends a bounded Responses request for teaching level %s', async (level) => {
    const f = fixture()
    await invoke(createMentorHandler(f.deps), { ...requestBody, level, allowSolution: level === 4 })
    const [url, options] = f.fetcher.mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/responses')
    const body = JSON.parse(options.body)
    expect(body).toMatchObject({ model: 'configured-test-model', store: false, max_output_tokens: 1200 })
    expect(body.instructions).toContain(`teaching level ${level}`)
    expect(body.tools).toBeUndefined(); expect(options.redirect).toBe('error')
    expect(options.signal).toBeInstanceOf(AbortSignal)
    expect(JSON.stringify(body)).not.toContain('server-only-secret')
  })

  it('sanitizes upstream failures and rejects missing output', async () => {
    const f = fixture(); f.fetcher.mockResolvedValue(new Response('secret upstream detail', { status: 401 }))
    const result = await invoke(createMentorHandler(f.deps))
    expect(result.status).toBe(502); expect(JSON.stringify(result.body)).not.toContain('secret')
    f.fetcher.mockResolvedValue(new Response(JSON.stringify({ status: 'completed', output: [] })))
    expect((await invoke(createMentorHandler(f.deps))).status).toBe(502)
  })

  it('aborts a hung upstream at the service deadline', async () => {
    vi.useFakeTimers()
    try {
      const f = fixture()
      f.fetcher.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('aborted')))
      }))
      const result = invoke(createMentorHandler(f.deps))
      await vi.advanceTimersByTimeAsync(30001)
      expect((await result).status).toBe(504)
    } finally { vi.useRealTimers() }
  })

  it('forwards only validated execution fields and server token', async () => {
    const f = fixture()
    const result = { stdout: 'ok\n', stderr: '', exitCode: 0, truncated: false }
    f.fetcher.mockResolvedValue(new Response(JSON.stringify(result)))
    const body = { language: 'python', code: 'print("ok")', input: '' }
    expect((await invoke(createExecuteHandler(f.deps), body)).body).toEqual(result)
    const [url, options] = f.fetcher.mock.calls[0]
    expect(url).toBe('https://runner.example.com/execute')
    expect(options.headers.Authorization).toBe(`Bearer ${'x'.repeat(32)}`)
    expect(JSON.parse(options.body)).toEqual(body)
    expect(f.rpc).toHaveBeenCalledWith('consume_service_budget', { service: 'execute' })
  })

  it.each(['http://runner.example.com', 'https://user:pass@runner.example.com', 'https://runner.example.com/other', 'https://runner.example.com?token=secret'])('rejects unsafe runner URL %s', (RUNNER_URL) => {
    expect(() => runnerEndpoint({ RUNNER_URL, RUNNER_TOKEN: 'x'.repeat(32) })).toThrow()
  })

  it.each([
    { language: 'javascript', code: 'hello', input: '' }, { language: 'python', code: 'hello' },
    { language: 'php', code: 'hello', input: '', image: 'evil' },
  ])('rejects invalid runner requests', async (body) => {
    const f = fixture()
    expect((await invoke(createExecuteHandler(f.deps), body)).status).toBe(400)
    expect(f.fetcher).not.toHaveBeenCalled()
  })

  it('rejects malformed runner output and preserves the unavailable status', async () => {
    const f = fixture(); const body = { language: 'csharp', code: 'Console.WriteLine(1);', input: '' }
    f.fetcher.mockResolvedValue(new Response(JSON.stringify({ stdout: '', exitCode: '0' })))
    expect((await invoke(createExecuteHandler(f.deps), body)).status).toBe(502)
    f.fetcher.mockResolvedValue(new Response('private daemon paths', { status: 503 }))
    const result = await invoke(createExecuteHandler(f.deps), body)
    expect(result.status).toBe(503); expect(JSON.stringify(result.body)).not.toContain('daemon paths')
  })
})
