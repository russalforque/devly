import { readUpstreamJson } from '../server/http.ts'
import { required, serviceHandler, type Dependencies, type Environment } from '../server/services.ts'
import { ServiceError, validateExecution, validateExecutionResult } from '../server/validation.mjs'

export const config = { runtime: 'nodejs', maxDuration: 35 }

export function runnerEndpoint(env: Environment): string {
  const raw = required(env, 'RUNNER_URL')
  if (required(env, 'RUNNER_TOKEN').length < 32) throw new ServiceError(503, 'RUNNER_TOKEN must contain at least 32 characters.')
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
      || !['/', '/execute'].includes(url.pathname)) throw new Error()
    url.pathname = '/execute'
    return url.toString()
  } catch { throw new ServiceError(503, 'RUNNER_URL must be a dedicated HTTPS origin or its /execute endpoint.') }
}

export function createExecuteHandler(deps: Partial<Dependencies> = {}) {
  return serviceHandler('execute', validateExecution, runnerEndpoint, async (body, dependencies, signal) => {
    const response = await dependencies.fetch(runnerEndpoint(dependencies.env), {
      method: 'POST', redirect: 'error', signal,
      headers: { Authorization: `Bearer ${required(dependencies.env, 'RUNNER_TOKEN')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      await response.body?.cancel()
      throw new ServiceError(response.status === 503 ? 503 : 502,
        response.status === 503 ? 'Runner unavailable: check Docker, pre-pulled images, or retry when idle.' : 'Runner request failed.')
    }
    return validateExecutionResult(await readUpstreamJson(response, 512 * 1024))
  }, deps)
}

export default createExecuteHandler()
