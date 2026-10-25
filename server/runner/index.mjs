import http from 'node:http'
import { createHash, timingSafeEqual } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { MAX_BODY_BYTES, ServiceError, validateExecution } from '../validation.mjs'
import { createDockerRunner } from './docker.mjs'

function reply(res, status, value) {
  if (res.destroyed || res.writableEnded) return
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  res.end(JSON.stringify(value))
}

export function validToken(header, expected) {
  if (typeof expected !== 'string' || expected.length < 32 || typeof header !== 'string' || header.length > 8192) return false
  const match = /^Bearer ([\x21-\x7e]+)$/.exec(header)
  if (!match) return false
  // Hash first so different token lengths still use a fixed-length comparison.
  const digest = (value) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(match[1]), digest(expected))
}

function readBody(req, signal) {
  return new Promise((resolve, reject) => {
    let bytes = 0
    const chunks = []
    const clean = () => {
      req.off('data', data); req.off('end', end); req.off('error', error)
      signal.removeEventListener('abort', abort)
    }
    const abort = () => { clean(); reject(new ServiceError(408, 'Request cancelled or timed out.')) }
    const error = () => { clean(); reject(new ServiceError(400, 'Unable to read body.')) }
    const data = (chunk) => {
      bytes += chunk.length
      if (bytes > MAX_BODY_BYTES) {
        clean(); req.resume(); reject(new ServiceError(413, 'Request body exceeds 16 KiB.'))
      } else chunks.push(chunk)
    }
    const end = () => {
      clean()
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
      catch { reject(new ServiceError(400, 'Invalid JSON.')) }
    }
    if (signal.aborted) { abort(); return }
    req.on('data', data); req.once('end', end); req.once('error', error)
    signal.addEventListener('abort', abort, { once: true })
  })
}

export function createRunnerServer({ env = process.env, run = createDockerRunner({ env }) } = {}) {
  const token = env.RUNNER_TOKEN?.trim()
  if (!token || token.length < 32 || !/^[\x21-\x7e]+$/.test(token)) {
    throw new ServiceError(503, 'Set RUNNER_TOKEN to at least 32 printable non-space characters before starting the runner.')
  }
  let active = false
  const controllers = new Set()
  const server = http.createServer({ maxHeaderSize: 12 * 1024 }, async (req, res) => {
    const controller = new AbortController()
    controllers.add(controller)
    const disconnect = () => { if (!res.writableEnded) controller.abort() }
    const timer = setTimeout(() => controller.abort(), 25000)
    req.once('aborted', disconnect); res.once('close', disconnect)
    let ownsSlot = false
    try {
      if (!validToken(req.headers.authorization, token)) throw new ServiceError(401, 'Runner authentication required.')
      if (req.url !== '/execute') throw new ServiceError(404, 'Not found.')
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); throw new ServiceError(405, 'Use POST.') }
      if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')
        || (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity')) {
        throw new ServiceError(415, 'Send uncompressed application/json.')
      }
      const length = req.headers['content-length']
      if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) throw new ServiceError(413, 'Request body exceeds 16 KiB.')
      if (active) throw new ServiceError(503, 'Runner is busy. Retry later.')
      active = true; ownsSlot = true
      // A separate deadline prevents slow request uploads holding the job slot.
      const bodyTimeout = setTimeout(() => controller.abort(), 5000)
      let body
      try { body = validateExecution(await readBody(req, controller.signal)) }
      finally { clearTimeout(bodyTimeout) }
      reply(res, 200, await run(body, controller.signal))
    } catch (error) {
      const status = error instanceof ServiceError ? error.status : controller.signal.aborted ? 408 : 503
      reply(res, status === 499 ? 408 : status, { error: error instanceof ServiceError ? error.message : 'Runner unavailable.' })
    } finally {
      if (ownsSlot) active = false
      clearTimeout(timer); controllers.delete(controller)
      req.off('aborted', disconnect); res.off('close', disconnect)
      if (!req.complete) { req.resume(); res.once('finish', () => req.destroy()) }
    }
  })
  server.requestTimeout = 10000
  server.headersTimeout = 10000
  server.keepAliveTimeout = 1000
  server.maxConnections = 16
  server.cancelJobs = () => { for (const controller of controllers) controller.abort() }
  return server
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const server = createRunnerServer()
    const host = process.env.RUNNER_HOST?.trim() || '127.0.0.1'
    const port = Number(process.env.RUNNER_PORT || 8787)
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid RUNNER_PORT.')
    server.listen(port, host, () => process.stdout.write(`Devly runner listening on ${host}:${port}\n`))
    server.on('error', () => { process.stderr.write('Runner could not listen. Check host and port.\n'); process.exitCode = 1 })
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
      server.cancelJobs()
      server.close()
      server.closeIdleConnections()
    })
  } catch (error) {
    process.stderr.write(`${error instanceof ServiceError ? error.message : 'Invalid runner configuration.'}\n`)
    process.exitCode = 1
  }
}
