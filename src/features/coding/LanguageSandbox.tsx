import { useTranslation } from 'react-i18next'
import { tr, tx } from '../../i18n/text'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Play, ShieldCheck } from 'lucide-react'
import { Badge } from '../../components/ui'
import { callService } from '../../lib/serviceClient'
import { errorMessage } from '../../lib/supabase'
import './coding.css'

const starters = {
  python: 'import json, sys\n\nvalues = json.loads(sys.stdin.read() or "[]")\nprint(json.dumps(sum(values)))',
  php: '<?php\n$values = json_decode(stream_get_contents(STDIN), true);\necho json_encode(array_sum($values)) . PHP_EOL;',
  csharp: 'using System;\nusing System.Linq;\nusing System.Text.Json;\n\nvar values = JsonSerializer.Deserialize<double[]>(Console.In.ReadToEnd()) ?? Array.Empty<double>();\nConsole.WriteLine(JsonSerializer.Serialize(values.Sum()));',
}
export default function LanguageSandbox() {
  useTranslation()

  const [language, setLanguage] = useState<keyof typeof starters>('python')
  const [code, setCode] = useState(starters.python)
  const [input, setInput] = useState('[1, 2, 3]')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [output, setOutput] = useState<{ stdout: string; stderr: string; exitCode: number; truncated?: boolean } | null>(null)
  const controller = useRef<AbortController | null>(null)
  const drafts = useRef<Record<string, string>>({ ...starters })
  useEffect(() => () => controller.current?.abort(), [])
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setOutput(null); controller.current = new AbortController()
    try {
      if (new TextEncoder().encode(code).length > 12000 || new TextEncoder().encode(input).length > 2000) throw new Error('Program limit: 12,000 UTF-8 bytes. Standard input limit: 2,000 UTF-8 bytes.')
      setOutput(await callService('execute', { language, code, input }, controller.current.signal))
    }
    catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }
  return <div className="page"><div className="page-heading"><div><div className="eyebrow">{tr("EXPLORE BEYOND THE BROWSER")}</div><h1>{tr("Multi-language sandbox")}<span className="heading-dot">.</span></h1><p>{tr("Run a small program with standard input and inspect its output.")}</p></div><Badge>{tr("Separate service required")}</Badge></div><div className="notice"><ShieldCheck size={18} /><p>{tr("These languages run only in the dedicated Docker execution service, with network access disabled and CPU, memory, process, time, and output limits. Configure the service in the project setup guide before running. No program is executed by the main application server.")}</p></div><form className="service-form" onSubmit={submit}><label>{tr("Language")}<select value={language} disabled={busy} onChange={event => { drafts.current[language] = code; const next = event.target.value as keyof typeof starters; setLanguage(next); setCode(drafts.current[next]); setOutput(null) }}><option value="python">{tr("Python")}</option><option value="php">{tr("PHP")}</option><option value="csharp">{tr("C#")}</option></select></label><label>{tr("Program")}<textarea className="code-input" required maxLength={16000} spellCheck={false} value={code} onChange={event => setCode(event.target.value)} /></label><label>{tr("Standard input")}<textarea maxLength={4000} value={input} onChange={event => setInput(event.target.value)} /></label><div className="service-actions"><button className="button primary" disabled={busy}><Play size={14} />{tx(busy ? 'Running in container…' : 'Run program')}</button>{tx(busy && <button type="button" className="text-button" onClick={() => controller.current?.abort()}>{tr("Cancel request")}</button>)}</div></form>{tx(error && <p className="notice error-message" role="alert">{tx(error)}</p>)}{tx(output && <section className="panel service-response" aria-live="polite"><h2>{tr("Process finished · Exit")}{' '}{tx(output.exitCode)}</h2><h3>{tr("Standard output")}</h3><pre>{output.stdout || '(empty)'}</pre><h3>{tr("Standard error")}</h3><pre>{output.stderr || '(empty)'}</pre>{tx(output.truncated && <p>{tr("Output was truncated at the service limit.")}</p>)}<small>{tr("Scratch runs do not award XP or count as a passed coding challenge.")}</small></section>)}</div>
}
