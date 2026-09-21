import { describe, expect, it } from 'vitest'

// GitHub Actions ejecuta los tests sin .env: aquí también. Si esto falla, alguien ha vuelto a cargar las claves
// de Supabase en los tests y un import que inicialice Supabase pasaría en local y fallaría en CI.
describe('entorno de tests (igual que CI)', () => {
  it('no hay claves de Supabase cargadas', () => {
    expect(import.meta.env.VITE_SUPABASE_URL ?? '').toBe('')
    expect(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').toBe('')
  })
})
