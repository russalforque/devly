import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    execArgv: ['--no-experimental-webstorage'],
    environment: 'jsdom',
    exclude: ['node_modules/**', 'dist/**', 'supabase/tests/*.test.ts'],
    restoreMocks: true,
    clearMocks: true,
  },
})
