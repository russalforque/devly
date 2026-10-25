import type { IncomingMessage, ServerResponse } from 'node:http'
import { MAX_BODY_BYTES, ServiceError } from './validation.mjs'

export function sendJson(res: ServerResponse, status: number, value: unknown) {
  if (res.destroyed || res.writableEnded) return
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.end(JSON.stringify(value))
}

export async function readJson(req: IncomingMessage, signal: AbortSignal): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) {
    throw new ServiceError(415, 'Content-Type must be application/json.')
  }
  if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') {
    throw new ServiceError(415, 'Compressed bodies are not supported.')
  }
  const length = req.headers['content-length']
  if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) {
    throw new ServiceError(413, 'Request body exceeds 16 KiB.')
  }
  // Vercel may have parsed the body already. Enforce the same bound again.
  const parsed = (req as IncomingMessage & { body?: unknown }).body
  let raw: string
  if (parsed !== undefined) {
    raw = Buffer.isBuffer(parsed) ? parsed.toString('utf8')
      : typeof parsed === 'string' ? parsed : JSON.stringify(parsed)
  } else {
    raw = await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = []
      let bytes = 0
      const clean = () => {
        req.off('data', data); req.off('end', end); req.off('error', error)
        req.off('aborted', aborted); signal.removeEventListener('abort', aborted)
      }
      const error = () => { clean(); reject(new ServiceError(400, 'Unable to read request.')) }
      const aborted = () => { clean(); reject(new ServiceError(504, 'Request cancelled or timed out.')) }
      const data = (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        bytes += buffer.length
        if (bytes > MAX_BODY_BYTES) {
          clean(); req.resume(); reject(new ServiceError(413, 'Request body exceeds 16 KiB.'))
        } else chunks.push(buffer)
      }
      const end = () => { clean(); resolve(Buffer.concat(chunks).toString('utf8')) }
      if (signal.aborted || req.aborted) { aborted(); return }
      req.on('data', data); req.once('end', end); req.once('error', error)
      req.once('aborted', aborted); signal.addEventListener('abort', aborted, { once: true })
    })
  }
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) throw new ServiceError(413, 'Request body exceeds 16 KiB.')
  try { return JSON.parse(raw) as unknown } catch { throw new ServiceError(400, 'Invalid JSON body.') }
}

export async function readUpstreamJson(response: Response, maxBytes = 256 * 1024): Promise<unknown> {
  if (!response.body) throw new ServiceError(502, 'Service returned an empty response.')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) throw new ServiceError(502, 'Service response exceeded its limit.')
      chunks.push(value)
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown }
    catch { throw new ServiceError(502, 'Service returned invalid JSON.') }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}
