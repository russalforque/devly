export const MAX_BODY_BYTES = 16 * 1024
export const MAX_OUTPUT_BYTES = 64 * 1024

export class ServiceError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'ServiceError'
    this.status = status
  }
}

export function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function fields(value, allowed) {
  if (!record(value) || Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new ServiceError(400, 'Invalid request fields.')
  }
}

function text(value, name, maxBytes, required = false) {
  if (typeof value !== 'string' || (required && !value.trim()) || value.includes('\0')) {
    throw new ServiceError(400, `Invalid ${name}.`)
  }
  if (Buffer.byteLength(value, 'utf8') > maxBytes) {
    throw new ServiceError(413, `${name} is too large.`)
  }
  return value
}

export function validateMentor(value) {
  fields(value, ['message', 'context', 'level', 'allowSolution', 'locale'])
  const locale = value.locale ?? 'en'
  if (!['en', 'ceb', 'fil'].includes(locale)) throw new ServiceError(400, 'Unsupported response language.')
  const message = text(value.message, 'message', 4000, true)
  const context = value.context === undefined ? '' : text(value.context, 'context', 8000)
  if (![1, 2, 3, 4].includes(value.level) || typeof value.allowSolution !== 'boolean') {
    throw new ServiceError(400, 'level must be 1–4 and allowSolution must be boolean.')
  }
  if (value.level === 4 && !value.allowSolution) {
    throw new ServiceError(400, 'Level 4 requires explicit solution permission.')
  }
  // Byte limits conservatively bound text tokens, including non-ASCII input.
  if (Buffer.byteLength(message + context, 'utf8') > 10000) {
    throw new ServiceError(413, 'Combined mentor input is too large.')
  }
  return { message, context, level: value.level, allowSolution: value.allowSolution, locale }
}

export function validateExecution(value) {
  fields(value, ['language', 'code', 'input'])
  if (!['python', 'php', 'csharp'].includes(value.language)) {
    throw new ServiceError(400, 'Supported languages: python, php, csharp.')
  }
  return {
    language: value.language,
    code: text(value.code, 'code', 12000, true),
    input: text(value.input, 'input', 2000),
  }
}

export function validateExecutionResult(value) {
  if (!record(value) || typeof value.stdout !== 'string' || typeof value.stderr !== 'string'
    || !Number.isInteger(value.exitCode) || value.exitCode < 0 || value.exitCode > 255
    || typeof value.truncated !== 'boolean'
    || Buffer.byteLength(value.stdout + value.stderr) > MAX_OUTPUT_BYTES * 3) {
    throw new ServiceError(502, 'Runner returned an invalid response.')
  }
  return { stdout: value.stdout, stderr: value.stderr, exitCode: value.exitCode, truncated: value.truncated }
}
