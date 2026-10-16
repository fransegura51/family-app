// ESLint 9 exige este archivo (formato "flat"); sin él `npm run lint`
// fallaba al arrancar y nunca ha comprobado nada. Solo reglas de
// TypeScript sobre src/ — las funciones de Supabase (Deno) tienen otro
// runtime y se quedan fuera.
import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  { ignores: ['dist/**', 'dev-dist/**', 'node_modules/**', 'supabase/**', 'workers/**', '*.config.*'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
    },
    plugins: { '@typescript-eslint': tsPlugin, 'react-hooks': reactHooks },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Un hook después de un `return` condicional rompe la app entera en
      // producción (bug real: "Minified React error #310", ver HomeScreen).
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  // PRIVACIDAD (datos de salud, migración 0279): las alergias e intolerancias de la ficha privada no se pueden importar desde los servicios de IA, la voz
  // de Pepa, Comunidad ni los avisos. Además lo comprueba src/data/dietaryPrivacyLock.test.ts.
  {
    files: ['src/services/**/*.{ts,tsx}', 'src/pepa/**/*.{ts,tsx}', 'src/ui/community/**/*.{ts,tsx}', 'src/data/community*.ts', 'src/domain/community*.ts', 'src/data/notification*.ts', 'src/data/errorReports.ts'],
    // Las pruebas de la propia barrera sí necesitan importarlas.
    ignores: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['**/dietaryRestrictions*', '**/dietaryRestrictionsRules*'], message: 'Las alergias y intolerancias son datos de salud privados: no se importan desde IA, voz, Comunidad ni avisos.' }] }],
    },
  },
]
