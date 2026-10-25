import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores(['dist', 'node_modules']),
  ...tseslint.configs.recommended,
  { files: ['api/**/*.{ts,js,mjs}', 'server/**/*.{ts,js,mjs}', '**/*.test.{ts,tsx}', '*.config.ts'], languageOptions: { globals: globals.node } },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'error',
    },
  },
  {
    files: ['src/features/auth/Auth.tsx', 'src/features/progress/ProgressProvider.tsx'],
    rules: { 'react-refresh/only-export-components': ['error', { allowExportNames: ['useAuth', 'useProgress'] }] },
  },
])
