import { describe, expect, it } from 'vitest'

// Bug real (confusión reportada 2026-10-08): un código de family_invites (para "Crear una familia
// nueva") escrito en la pantalla "Ya tengo un código" (que solo consulta family_members.invite_code)
// daba el mismo "Código no válido o caducado" que un código inventado — sin ninguna pista. Este archivo
// protege que join_family_with_code() ahora distingue ese caso concreto, sin tocar ninguna otra regla.
const MIG = (import.meta.glob('/supabase/migrations/0217_join_family_code_mismatch_hint.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/supabase/migrations/0217_join_family_code_mismatch_hint.sql']
const DOWN = (import.meta.glob('/supabase/rollbacks/0217_join_family_code_mismatch_hint_down.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/supabase/rollbacks/0217_join_family_code_mismatch_hint_down.sql']

describe('join_family_with_code — aviso específico cuando el código SÍ existe, pero en el otro sistema', () => {
  it('solo comprueba family_invites DESPUÉS de no encontrar nada en family_members — nunca lo consulta primero', () => {
    const memberLookup = MIG.indexOf('from family_members')
    const invitesLookup = MIG.indexOf('from family_invites')
    expect(memberLookup).toBeGreaterThan(-1)
    expect(invitesLookup).toBeGreaterThan(memberLookup)
  })

  it('exige que el código de family_invites esté sin usar y sin caducar — nunca avisa de uno ya consumido o caducado como si fuera válido en algún sitio', () => {
    expect(MIG).toContain('where code = upper(trim(p_code)) and used_at is null and expires_at > now()')
  })

  it('el mensaje nuevo es distinto del genérico y dice explícitamente dónde sí funciona', () => {
    expect(MIG).toContain('raise exception \'Este código es para crear una familia nueva — pruébalo en "Crear una familia nueva", no aquí\'')
    expect(MIG).toContain("raise exception 'Código no válido o caducado'")
  })

  it('nunca toca ni consume el código de family_invites — sigue intacto para usarse donde corresponde (ninguna fila de family_invites se actualiza aquí)', () => {
    expect(MIG).not.toMatch(/update\s+family_invites/i)
  })

  it('ninguna otra regla cambia: sigue exigiendo sesión iniciada, sigue bloqueando a quien ya tiene profile, sigue limpiando invite_code al unirse', () => {
    expect(MIG).toContain("raise exception 'No autenticado'")
    expect(MIG).toContain("raise exception 'El usuario ya pertenece a una familia'")
    expect(MIG).toContain('set linked_profile_id = v_user_id, invite_code = null, invite_code_expires_at = null')
  })

  it('el rollback restaura el cuerpo anterior exacto, sin la comprobación nueva', () => {
    const body = DOWN.slice(DOWN.indexOf('create or replace function'))
    expect(body).not.toContain('family_invites')
    expect(body).toContain("raise exception 'Código no válido o caducado'")
  })
})
