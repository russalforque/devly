import i18n from '../../i18n/config'
import { useTranslation } from 'react-i18next'
import { tr, tx } from '../../i18n/text'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowRight, Lightbulb, Send, ShieldCheck, Sparkles } from 'lucide-react'
import { Badge } from '../../components/ui'
import { callService } from '../../lib/serviceClient'
import { errorMessage } from '../../lib/supabase'
import '../coding/coding.css'

export default function Mentor({ navigate }: { navigate: (path: string) => void }) {
  useTranslation()

  const [message, setMessage] = useState('')
  const [context, setContext] = useState('')
  const [level, setLevel] = useState(1)
  const [allowSolution, setAllowSolution] = useState(false)
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reflection, setReflection] = useState(0)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (level === 4 && !allowSolution) return
    setBusy(true); setError(''); setAnswer(''); controller.current = new AbortController()
    try { const response = await callService<{ answer: string }>('mentor', { message, context, level, allowSolution, locale: i18n.language }, controller.current.signal); setAnswer(response.answer) }
    catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }
  const prompts = ['What should happen? Write down the expected behavior before looking at your implementation.', 'What is the smallest input that reproduces the problem? Trace the state at each step.', 'Separate what you know from what you assume. Which one assumption could you test with a small example?']
  return <div className="page"><div className="page-heading"><div><div className="eyebrow">{tr("YOUR THINKING COMES FIRST")}</div><h1>{tr("A nudge, not the answer")}<span className="heading-dot">.</span></h1><p>{tr("Explain what you tried. Ask for just enough help to take the next step.")}</p></div><Badge accent>{tr("Optional AI mentor")}</Badge></div><form className="service-form" onSubmit={submit}><label>{tr("What are you working through?")}<textarea required maxLength={4000} value={message} onChange={event => setMessage(event.target.value)} placeholder={tr("I expected… I tried… The part I don’t understand is…")} /></label><label>{tr("Relevant code or context (optional)")}<textarea maxLength={6000} value={context} onChange={event => setContext(event.target.value)} placeholder={tr("Share only the small example needed to explain your question.")} /></label><label>{tr("How much help would be useful?")}<select value={level} onChange={event => { setLevel(Number(event.target.value)); setAllowSolution(false) }}><option value={1}>{tr("Level 1 — A conceptual hint")}</option><option value={2}>{tr("Level 2 — More specific guidance")}</option><option value={3}>{tr("Level 3 — Pseudocode or a partial explanation")}</option><option value={4}>{tr("Level 4 — A complete explanation or solution")}</option></select></label>{tx(level === 4 && <label className="inline-label"><input type="checkbox" required checked={allowSolution} onChange={event => setAllowSolution(event.target.checked)} />{tr("I explicitly request a full solution.")}</label>)}<p className="service-disclosure"><ShieldCheck size={15} /> {tr("Sending a request shares the text you enter here with the configured AI provider. Don’t include secrets or private production data. AI guidance can be wrong; validate it with tests. Requests are limited server-side.")}</p><div className="service-actions"><button className="button primary" disabled={busy || level === 4 && !allowSolution}><Send size={15} />{tx(busy ? 'Thinking with you…' : 'Ask the mentor')}</button>{tx(busy && <button type="button" className="text-button" onClick={() => controller.current?.abort()}>{tr("Cancel request")}</button>)}</div></form>{tx(error && <div className="notice error-message" role="alert">{tx(error)}</div>)}{tx(answer && <section className="panel service-response" aria-live="polite"><div className="panel-label"><span><Sparkles size={16} />{tr("Mentor guidance · Level")}{' '}{tx(level)}</span><Badge>{tr("AI-generated")}</Badge></div><p>{answer}</p></section>)}<section className="panel service-response"><div className="panel-label"><span><Lightbulb size={17} />{tr("Try a guided reflection, no AI needed")}</span></div>{tx(prompts.slice(0, reflection + 1).map(prompt => <p key={prompt}>{tx(prompt)}</p>))}{tx(reflection < 2 ? <button className="text-button" onClick={() => setReflection(current => current + 1)}>{tr("Another question")}<ArrowRight size={14} /></button> : <button className="text-button" onClick={() => navigate('challenges')}>{tr("Put it into practice")}<ArrowRight size={14} /></button>)}</section></div>
}
