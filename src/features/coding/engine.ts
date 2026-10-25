import type { TestCase } from './challenges'

export interface CaseResult { name: string; passed: boolean; actual: string; expected: string; error?: string }
export interface RunResult { tests: CaseResult[]; logs: string[]; error?: string; durationMs: number }
export const MAX_CODE_LENGTH = 50000
export const RUN_TIMEOUT = 3500

export const workerSource = `
const send = self.postMessage.bind(self);
const stringify = JSON.stringify.bind(JSON);
const parse = JSON.parse.bind(JSON);
const objectKeys = Object.keys.bind(Object);
const arrayIsArray = Array.isArray.bind(Array);
const canonical = value => {
  if (value === null || typeof value !== 'object') return stringify(value);
  if (arrayIsArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + objectKeys(value).sort().map(key => stringify(key) + ':' + canonical(value[key])).join(',') + '}';
};
self.onmessage = async event => {
  const { code, tests } = event.data;
  const logs = [];
  const log = (...values) => { if (logs.length < 50) logs.push(values.map(value => typeof value === 'string' ? value : stringify(value)).join(' ').slice(0, 1000)); };
  self.console = Object.freeze({ log, info: log, warn: log, error: log, debug: log });
  const results = [];
  try {
    const solve = new Function('"use strict";\\n' + code + '\\n; if (typeof solve !== "function") throw new Error("Define a function named solve."); return solve;')();
    for (const test of tests) {
      try {
        const args = parse(stringify(test.args));
        const before = canonical(args);
        const actual = await solve(...args);
        const representation = canonical(actual);
        const unchanged = canonical(args) === before;
        results.push({ name: test.name, passed: unchanged && representation === canonical(test.expected), actual: String(representation).slice(0, 3000), expected: canonical(test.expected), error: unchanged ? undefined : 'The function mutated its input.' });
      } catch (error) {
        results.push({ name: test.name, passed: false, actual: '', expected: canonical(test.expected), error: String(error.message || error).slice(0, 2000) });
      }
    }
    send({ tests: results, logs });
  } catch (error) { send({ tests: [], logs, error: String(error.message || error).slice(0, 2000) }); }
};
`

function sandboxDocument() {
  const embeddedWorker = JSON.stringify(workerSource).replace(/</g, '\\u003c')
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; worker-src blob:; connect-src 'none'; img-src 'none'; style-src 'none'; base-uri 'none'; form-action 'none'"><script>
  let accepted = false;
  addEventListener('message', event => {
    if (event.source !== parent || accepted || event.data?.kind !== 'devly:run') return;
    accepted = true;
    const token = event.data.token;
    const reply = payload => parent.postMessage({ kind: 'devly:result', token, payload }, '*');
    try {
      const url = URL.createObjectURL(new Blob([${embeddedWorker}], { type: 'text/javascript' }));
      const worker = new Worker(url);
      worker.onmessage = result => { worker.terminate(); URL.revokeObjectURL(url); reply(result.data); };
      worker.onerror = error => { worker.terminate(); URL.revokeObjectURL(url); reply({ tests: [], logs: [], error: error.message || 'Worker failed.' }); };
      worker.postMessage({ code: event.data.code, tests: event.data.tests });
      setTimeout(() => { worker.terminate(); URL.revokeObjectURL(url); }, ${RUN_TIMEOUT});
    } catch (error) { reply({ tests: [], logs: [], error: String(error.message || error) }); }
  });
  parent.postMessage({ kind: 'devly:ready' }, '*');
  </script>`
}

export function runCode(code: string, tests: TestCase[], signal?: AbortSignal): Promise<RunResult> {
  if (code.length > MAX_CODE_LENGTH) return Promise.reject(new Error('Code exceeds the 50,000 character limit.'))
  if (signal?.aborted) return Promise.reject(new Error('Run cancelled.'))
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe')
    iframe.setAttribute('sandbox', 'allow-scripts')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.display = 'none'
    iframe.srcdoc = sandboxDocument()
    const token = crypto.randomUUID()
    const start = performance.now()
    let finished = false
    let started = false
    const cleanup = () => { finished = true; window.clearTimeout(timeout); window.removeEventListener('message', receive); signal?.removeEventListener('abort', abort); iframe.remove() }
    const abort = () => { if (!finished) { cleanup(); reject(new Error('Run cancelled.')) } }
    const timeout = window.setTimeout(() => {
      if (!finished) { cleanup(); resolve({ tests: [], logs: [], error: 'Execution exceeded 3.5 seconds and was terminated.', durationMs: RUN_TIMEOUT }) }
    }, RUN_TIMEOUT + 500)
    function receive(event: MessageEvent) {
      if (event.source !== iframe.contentWindow || finished) return
      if (event.data?.kind === 'devly:ready' && !started) { started = true; iframe.contentWindow?.postMessage({ kind: 'devly:run', token, code, tests }, '*'); return }
      if (event.data?.kind !== 'devly:result' || event.data.token !== token) return
      const payload = event.data.payload
      if (!payload || !Array.isArray(payload.tests) || !Array.isArray(payload.logs) || JSON.stringify(payload).length > 100000 || payload.tests.length > tests.length) return
      const result: RunResult = {
        tests: payload.tests.map((test: CaseResult, index: number) => ({ name: tests[index]?.name ?? 'Test', passed: test.passed === true, actual: String(test.actual).slice(0, 3000), expected: JSON.stringify(tests[index]?.expected), error: test.error ? String(test.error).slice(0, 2000) : undefined })),
        logs: payload.logs.slice(0, 50).map((line: unknown) => String(line).slice(0, 1000)),
        error: payload.error ? String(payload.error).slice(0, 2000) : undefined,
        durationMs: Math.round(performance.now() - start),
      }
      cleanup(); resolve(result)
    }
    window.addEventListener('message', receive)
    signal?.addEventListener('abort', abort, { once: true })
    document.body.appendChild(iframe)
  })
}

export async function compileTypeScript(code: string): Promise<string> {
  const compiler = await import('typescript')
  const result = compiler.transpileModule(code, { compilerOptions: { target: compiler.ScriptTarget.ES2022, module: compiler.ModuleKind.ESNext, moduleDetection: compiler.ModuleDetectionKind.Legacy, strict: true }, reportDiagnostics: true })
  const errors = result.diagnostics?.filter(item => item.category === compiler.DiagnosticCategory.Error)
  if (errors?.length) throw new Error(errors.map(item => compiler.flattenDiagnosticMessageText(item.messageText, '\n')).join('\n'))
  return result.outputText
}
