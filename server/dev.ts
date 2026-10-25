import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import mentor from '../api/mentor.ts'
import execute from '../api/execute.ts'
import { sendJson } from './http.ts'

// Optional local API process. Vite can proxy /api to this loopback listener.
export function createApiServer() {
  const server = createServer({ maxHeaderSize: 12 * 1024 }, (req, res) => {
    const pathname = req.url?.split('?')[0]
    const handler = pathname === '/api/mentor' ? mentor : pathname === '/api/execute' ? execute : null
    if (!handler) { sendJson(res, 404, { error: 'Not found.' }); return }
    void handler(req, res).finally(() => {
      if (!req.complete) { req.resume(); res.once('finish', () => req.destroy()) }
    })
  })
  server.requestTimeout = 10000
  server.headersTimeout = 10000
  server.keepAliveTimeout = 1000
  return server
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.API_PORT || 8788)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid API_PORT.')
  const server = createApiServer()
  server.listen(port, '127.0.0.1', () => process.stdout.write(`Devly API listening on 127.0.0.1:${port}\n`))
  server.on('error', () => { process.stderr.write('API could not listen. Check API_PORT.\n'); process.exitCode = 1 })
}
