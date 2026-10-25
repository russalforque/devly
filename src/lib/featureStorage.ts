import { supabase } from './supabase'

export type Feature = 'coding' | 'interviews' | 'projects' | 'assessments'

async function currentUser() {
  if (!supabase) return null
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!data.user) throw new Error('Please sign in again to access your saved work.')
  return data.user.id
}

export async function loadFeature<T>(feature: Feature, key: string, fallback: T): Promise<T> {
  const userId = await currentUser()
  if (supabase && userId) {
    const { data, error } = await supabase.from('feature_records').select('payload')
      .eq('user_id', userId).eq('feature', feature).eq('record_key', key).maybeSingle()
    if (error) throw error
    return data ? data.payload as T : structuredClone(fallback)
  }
  const raw = localStorage.getItem(`devly.${feature}.${key}.v1`)
  return raw ? JSON.parse(raw) as T : structuredClone(fallback)
}

export async function saveFeature<T>(feature: Feature, key: string, value: T): Promise<void> {
  const userId = await currentUser()
  if (supabase && userId) {
    const { error } = await supabase.from('feature_records').upsert({ user_id: userId, feature, record_key: key, payload: value, updated_at: new Date().toISOString() }, { onConflict: 'user_id,feature,record_key' })
    if (error) throw error
  } else localStorage.setItem(`devly.${feature}.${key}.v1`, JSON.stringify(value))
  window.dispatchEvent(new CustomEvent('devly:activity', { detail: feature }))
}
