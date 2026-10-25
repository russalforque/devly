import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import enUI from './locales/en/ui.json'
import cebUI from './locales/ceb/ui.json'
import filUI from './locales/fil/ui.json'
import enContent from './locales/en/content.json'
import cebContent from './locales/ceb/content.json'
import filContent from './locales/fil/content.json'

export const languages = ['en', 'ceb', 'fil'] as const
export type Locale = typeof languages[number]
export const languageNames: Record<Locale, string> = { en: 'English', ceb: 'Bisaya', fil: 'Tagalog' }
export const LANGUAGE_KEY = 'devly.language'
export const isLocale = (value: unknown): value is Locale => languages.includes(value as Locale)
export function storedLanguage(): Locale {
  try { const value = localStorage.getItem(LANGUAGE_KEY); return isLocale(value) ? value : 'en' } catch { return 'en' }
}
void i18n.use(initReactI18next).init({
  resources: { en: { ui: enUI, content: enContent }, ceb: { ui: cebUI, content: cebContent }, fil: { ui: filUI, content: filContent } },
  lng: storedLanguage(), fallbackLng: 'en', supportedLngs: [...languages],
  defaultNS: 'ui', ns: ['ui', 'content'], keySeparator: false, nsSeparator: false,
  interpolation: { escapeValue: false }, initAsync: false, react: { useSuspense: false },
})
export default i18n
