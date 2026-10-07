// El puente con OwnTracks (0213) se retiró (0214): la migración deshace exactamente lo que creó y la pantalla ya no lo ofrece.
import { describe, expect, it } from 'vitest'

const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const find = (name: string) => Object.entries(MIGRATIONS).find(([f]) => f.includes(name))?.[1] ?? ''
const UP = find('0213_owntracks_background_location')
const DOWN = find('0214_remove_owntracks_background_location')
const SCREEN = (import.meta.glob('/src/ui/LocationScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/LocationScreen.tsx']

describe('retirada de OwnTracks', () => {
  it('0214 borra cada función y la tabla que creó 0213 (y nada más)', () => {
    const created = [...UP.matchAll(/create (?:or replace )?function public\.(\w+)/g)].map((m) => m[1])
    expect(created.sort()).toEqual(['create_member_location_token', 'ingest_member_location', 'list_member_location_token_status', 'revoke_member_location_token'])
    for (const fn of created) expect(DOWN).toContain(`drop function if exists public.${fn}(`)
    expect(DOWN).toContain('drop table if exists public.member_location_tokens;')
    expect(DOWN).not.toMatch(/drop table (?!if exists public\.member_location_tokens)/i)
    expect(DOWN).not.toMatch(/\b(delete|truncate)\b[^;]*\b(member_locations|member_location_history)\b/i)
  })
  it('la pantalla de Ubicación ya no ofrece nada de OwnTracks', () => {
    expect(SCREEN).not.toMatch(/owntracks|BackgroundLocationSetup/i)
  })
  it('lo que no era de OwnTracks se conserva: la antigüedad real de la posición', () => {
    expect(SCREEN).toContain('describePositionAge(loc.recordedAt, Date.now())')
  })
})
