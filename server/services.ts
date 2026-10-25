import type { IncomingMessage, ServerResponse } from 'node:http'
import { createClient } from '@supabase/supabase-js'
import { readJson, sendJson } from './http.ts'
import { ServiceError } from './validation.mjs'

export type Environment = Record<string, string | undefined>
export interface OwnerClient {
  auth: { getUser: (token: string) => Promise<{ data: { user: { id: string } | null }; error: { status?: number } | null }> }
  rpc: (name: string, args?: Record<string, string>) => PromiseLike<{ data: unknown; error: unknown }>
}
export interface Dependencies {
  env: Environment
  fetch: typeof fetch
  createOwnerClient: (url: string, key: string, token: string, fetcher: typeof fetch) => OwnerClient
}
export const defaults: Dependencies = {
  env: process.env,
  fetch: (...args) => fetch(...args),
  createOwnerClient: (url, key, token, fetcher) => createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` }, fetch: fetcher },
  }),
}

export function required(env: Environment, name: string): string {
  const value = env[name]?.trim()
  if (!value) throw new ServiceError(503, `Service not configured: ${name} is required.`)
  return value
}

export async function authorize(req: IncomingMessage, deps: Dependencies, signal: AbortSignal) {
  const header = req.headers.authorization
  const token = typeof header === 'string' && /^Bearer ([A-Za-z0-9._~-]+)$/i.exec(header)?.[1]
  if (!token || token.length > 8192) throw new ServiceError(401, 'A valid Bearer session is required.')
  const url = deps.env.SUPABASE_URL?.trim() || deps.env.VITE_SUPABASE_URL?.trim()
  const key = deps.env.SUPABASE_PUBLISHABLE_KEY?.trim() || deps.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!url || !key) throw new ServiceError(503, 'Authentication not configured: Supabase URL and publishable key are required.')
  try {
    const parsed = new URL(url)
    if (parsed.username || parsed.password || parsed.search || parsed.hash
      || (parsed.protocol !== 'https:' && !(deps.env.NODE_ENV !== 'production'
        && parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)))) throw new Error()
  } catch { throw new ServiceError(503, 'Invalid server Supabase URL.') }
  // Reject secret keys accidentally configured in the public-key slot.
  if (key.startsWith('sb_secret_')) throw new ServiceError(503, 'Supabase requires a publishable key.')
  if (key.split('.').length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'))
      if (payload.role !== 'anon') throw new Error()
    } catch { throw new ServiceError(503, 'Supabase requires a publishable or legacy anon key.') }
  }
  const fetcher: typeof fetch = (input, init) => deps.fetch(input, {
    ...init, signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal,
  })
  try {
    const client = deps.createOwnerClient(url, key, token, fetcher)
    const user = await client.auth.getUser(token)
    if (user.error) {
      if (user.error.status && user.error.status >= 400 && user.error.status < 500
        && user.error.status !== 429) throw new ServiceError(401, 'Session is invalid or expired.')
      throw new ServiceError(503, 'Authentication is temporarily unavailable.')
    }
    if (!user.data.user?.id) throw new ServiceError(401, 'Session is invalid or expired.')
    const owner = await client.rpc('is_owner')
    if (owner.error || typeof owner.data !== 'boolean') throw new ServiceError(503, 'Owner authorization is unavailable.')
    if (owner.data !== true) throw new ServiceError(403, 'Owner access is required.')
    return client
  } catch (error) {
    if (error instanceof ServiceError) throw error
    throw new ServiceError(signal.aborted ? 504 : 503, 'Authentication or authorization is unavailable.')
  }
}

export async function consumeBudget(client: OwnerClient, service: 'mentor' | 'execute') {
  try {
    const result = await client.rpc('consume_service_budget', { service })
    if (result.error || typeof result.data !== 'boolean') throw new ServiceError(503, 'Service budget is unavailable.')
    if (!result.data) throw new ServiceError(429, 'Service limit reached: 5 per minute and 30 per rolling day.')
  } catch (error) {
    if (error instanceof ServiceError) throw error
    throw new ServiceError(503, 'Service budget is unavailable.')
  }
}

export function serviceHandler<T>(
  service: 'mentor' | 'execute',
  validate: (body: unknown) => T,
  configure: (env: Environment) => unknown,
  execute: (body: T, deps: Dependencies, signal: AbortSignal) => Promise<unknown>,
  overrides: Partial<Dependencies> = {},
) {
  const deps = { ...defaults, ...overrides }
  return async (req: IncomingMessage, res: ServerResponse) => {
    const abort = new AbortController()
    const timer = setTimeout(() => abort.abort(), 30000)
    const disconnect = () => { if (!res.writableEnded) abort.abort() }
    req.once('aborted', disconnect); res.once('close', disconnect)
    try {
      const client = await authorize(req, deps, abort.signal)
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST')
        throw new ServiceError(405, 'Use POST.')
      }
      const body = validate(await readJson(req, abort.signal))
      configure(deps.env)
      await consumeBudget(client, service)
      abort.signal.throwIfAborted()
      sendJson(res, 200, await execute(body, deps, abort.signal))
    } catch (error) {
      const failure = error instanceof ServiceError ? error : new ServiceError(
        abort.signal.aborted ? 504 : 502,
        abort.signal.aborted ? 'Service request timed out or was cancelled.' : 'Service request failed.',
      )
      sendJson(res, failure.status, { error: failure.message })
    } finally {
      clearTimeout(timer); req.off('aborted', disconnect); res.off('close', disconnect)
    }
  }
}
