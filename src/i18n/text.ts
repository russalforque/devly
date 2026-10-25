import type { ReactNode } from 'react'
import i18n from './config'
import englishContent from './locales/en/content.json'

const contentKeys = new Map(Object.entries(englishContent).map(([key, value]) => [value, key]))
/** Translate authored display text only. Never pass code, identifiers, or learner input here. */
export function tr(source: string, values?: Record<string, unknown>): string {
  const key = contentKeys.get(source)
  return String(i18n.t(key ?? source, { ns: key ? 'content' : 'ui', defaultValue: source, ...values }))
}
export function tx(value: ReactNode): ReactNode { return typeof value === 'string' ? tr(value) : value }
export function contentAvailable(source: string): boolean {
  const key = contentKeys.get(source)
  return i18n.language === 'en' || Boolean(key && i18n.getResource(i18n.language, 'content', key))
}
export function dateLocale() { return i18n.language === 'en' ? 'en-AU' : i18n.language === 'ceb' ? 'fil-PH' : 'fil-PH' }
