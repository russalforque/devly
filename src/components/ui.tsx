import { useTranslation } from 'react-i18next'
import { tr, tx } from '../i18n/text'
import { useEffect, useRef, type ReactNode } from 'react'
import { Atom, Check, ChevronRight, Clock3, Code2, Database, GitBranch, Server, X } from 'lucide-react'
import type { Track } from '../features/curriculum/types'

export function TechnologyIcon({ track, small = false }: { track: Track; small?: boolean }) {
  useTranslation()

  const icon = track.id === 'react' ? <Atom /> : track.id === 'sql' ? <Database /> : track.id === 'git' ? <GitBranch /> : track.id === 'node' ? <Server /> : <span>{track.symbol}</span>
  return <span aria-hidden="true" className={`technology-icon ${track.color} ${small ? 'small' : ''}`}>{tx(icon)}</span>
}

export function Badge({ children, accent = false }: { children: ReactNode; accent?: boolean }) {
  useTranslation()
 return <span className={`badge ${accent ? 'accent' : ''}`}>{children}</span> }
export function SectionHeading({ title, subtitle, action, onAction }: { title: string; subtitle?: string; action?: string; onAction?: () => void }) {
  useTranslation()
 return <div className="section-heading"><div><h2>{tx(title)}</h2>{tx(subtitle && <p>{tx(subtitle)}</p>)}</div>{tx(action && <button className="text-button" onClick={onAction}>{tx(action)}<ChevronRight size={15} /></button>)}</div> }
export function EmptyState({ title, description, action, onAction }: { title: string; description: string; action?: string; onAction?: () => void }) {
  useTranslation()
 return <div className="empty-state"><span className="empty-icon"><Code2 size={24} /></span><h3>{tx(title)}</h3><p>{tx(description)}</p>{tx(action && <button className="button" onClick={onAction}>{tx(action)}<ChevronRight size={16} /></button>)}</div> }
export function Duration({ minutes }: { minutes: number }) {
  useTranslation()
 return <span className="duration"><Clock3 size={13} />{tx(minutes)} {tr("min")}</span> }
export function CheckMark({ complete }: { complete: boolean }) {
  useTranslation()
 return <span className={`check-mark ${complete ? 'complete' : ''}`}>{tx(complete && <Check size={13} />)}</span> }

export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  useTranslation()

  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { element?.close(); document.body.style.overflow = previousOverflow }
  }, [])
  return <dialog ref={dialog} aria-label={tr(title)} className={`modal ${wide ? 'wide' : ''}`} onCancel={event => { event.preventDefault(); onClose() }} onClick={event => { if (event.target === event.currentTarget) onClose() }}><div className="modal-inner"><div className="modal-heading"><h2>{tx(title)}</h2><button className="icon-button" aria-label={tr("Close dialog")} onClick={onClose}><X size={20} /></button></div>{children}</div></dialog>
}
