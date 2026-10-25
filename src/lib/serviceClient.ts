import { supabase } from './supabase'

export async function callService<T>(path: 'mentor' | 'execute', body: unknown, signal?: AbortSignal): Promise<T> {
  if (!supabase) throw new Error('Connect your private Supabase account to use this optional service. Your local learning tools remain available.')
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  if (!data.session) throw new Error('Please sign in again.')
  const response = await fetch(`/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify(body), signal })
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) throw new Error('The optional backend is not available. Deploy the Vercel functions or use vercel dev; the Vite preview serves the frontend only.')
  const payload = await response.json()
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : `Service request failed (${response.status}).`)
  return payload as T
}
