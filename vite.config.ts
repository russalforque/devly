import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }
  const publicKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  if (publicKey && !publicKey.startsWith('sb_publishable_')) {
    let allowed: boolean
    try { allowed = JSON.parse(Buffer.from(publicKey.split('.')[1], 'base64url').toString()).role === 'anon' } catch { allowed = false }
    if (!allowed) throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY must be a publishable or legacy anon key. Never expose service-role credentials.')
  }
  return { plugins: [react(), tailwindcss()], server: { proxy: { '/api': 'http://127.0.0.1:8788' } } }
})
