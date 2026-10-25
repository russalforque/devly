import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
const validUrl = url && (/^https:\/\/[^/]+\/?$/.test(url) || import.meta.env.DEV && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(url))
function publicKey(value: string | undefined) {
  if (!value) return false
  if (value.startsWith('sb_publishable_')) return true
  try { return JSON.parse(atob(value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon' } catch { return false }
}
export const configurationError = Boolean((url || key) && (!validUrl || !publicKey(key)))
export const supabase = validUrl && publicKey(key) ? createClient(url, key!) : null
export const localMode = !url && !key && (import.meta.env.DEV || import.meta.env.VITE_ENABLE_LOCAL_MODE === 'true')

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return 'Something went wrong. Please try again.'
}
