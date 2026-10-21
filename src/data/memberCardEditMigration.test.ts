// 0304 (pendiente de aplicar): cada persona adulta edita SU ficha y la de sus hijos/as menores. Pruebas sobre el texto del SQL y de la pantalla;
// el comportamiento real se prueba en supabase/local-sql-tests (PGlite) y, tras aplicarla, en vivo.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { canEditMemberCard, type GuardianLink } from '@/domain/guardianship'
import type { FamilyMember } from '@/domain/types'

const root = path.resolve(__dirname, '../..')
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8')
const sql = read('supabase/pending-migrations/0304_member_self_and_guardian_edit.sql')
const down = read('supabase/pending-migrations/0304_member_self_and_guardian_edit_down.sql')

describe('0304: editar la propia ficha y la de los hijos/as (SQL)', () => {
  it('no toca la política de la tabla ni el tipo de ficha ni las secciones: solo dos funciones con permisos acotados', () => {
    expect(sql).not.toMatch(/create policy|alter policy|drop policy/i)
    expect(sql).not.toMatch(/member_type\s*=/)
    expect(sql).not.toMatch(/allowed_sections\s*=/)
    expect(sql).toContain('security definer')
    expect(sql).toContain('revoke all on function public.update_member_card(uuid, text, text, date, text) from public, anon;')
    expect(sql).toContain('grant execute on function public.update_member_card(uuid, text, text, date, text) to authenticated;')
    expect(sql).toContain('revoke all on function public.set_member_photo(uuid, text) from public, anon;')
    expect(sql).toContain('grant execute on function public.set_member_photo(uuid, text) to authenticated;')
  })
  it('exige familia, rol adulto/administración, vínculo vigente para los menores, menor de 18 al editar su fecha y ruta de foto de la propia familia', () => {
    expect(sql).toContain('private.is_active_guardian_of(p_member)')
    expect(sql).toContain('CHILD_MUST_BE_MINOR')
    expect(sql).toContain('BIRTH_DATE_REQUIRED')
    expect(sql).toContain('INVALID_PHOTO_PATH')
    expect(sql).toContain('family_id = v_fam')
  })
  it('la comprobación de la foto no se rompe con la lógica de tres valores (coalesce) y el rollback las quita', () => {
    expect(sql).toContain("coalesce(v_role = 'adult' and m.linked_profile_id = auth.uid(), false)")
    expect(down).toContain('drop function if exists public.update_member_card(uuid, text, text, date, text);')
    expect(down).toContain('drop function if exists public.set_member_photo(uuid, text);')
  })
})

describe('0304: quién ve «Editar» y «Foto» en la ficha', () => {
  const NOW = new Date('2026-10-21T12:00:00Z')
  const mk = (id: string, memberType: FamilyMember['memberType'], birthDate: string | null): FamilyMember =>
    ({ id, name: id, memberType, birthDate, linkedProfileId: null, color: '#000000' }) as unknown as FamilyMember
  const mama = mk('mama', 'adult', '1985-01-01')
  const otra = mk('otra', 'adult', '1990-01-01')
  const hijo = mk('hijo', 'child', '2018-01-01')
  const mayor = mk('mayor', 'child', '2005-01-01')
  const links: GuardianLink[] = [
    { id: 'l1', childMemberId: 'hijo', guardianMemberId: 'mama', relationship: 'parent', declaredAt: '2026-10-01' },
    { id: 'l2', childMemberId: 'mayor', guardianMemberId: 'mama', relationship: 'parent', declaredAt: '2026-10-01' },
  ]
  it('administración: todas; persona adulta: la suya y la de sus hijos/as menores; nadie más', () => {
    expect(canEditMemberCard(otra, { role: 'admin' }, null, [], NOW)).toBe(true)
    expect(canEditMemberCard(mama, { role: 'adult' }, mama, links, NOW)).toBe(true)
    expect(canEditMemberCard(hijo, { role: 'adult' }, mama, links, NOW)).toBe(true)
    expect(canEditMemberCard(otra, { role: 'adult' }, mama, links, NOW)).toBe(false)
    expect(canEditMemberCard(hijo, { role: 'adult' }, otra, links, NOW)).toBe(false)
    expect(canEditMemberCard(mayor, { role: 'adult' }, mama, links, NOW)).toBe(false) // ya es mayor de edad
  })
  it('invitados y niños con cuenta: ninguna, ni la suya', () => {
    expect(canEditMemberCard(mama, { role: 'guest' }, mama, links, NOW)).toBe(false)
    expect(canEditMemberCard(mama, { role: 'child' }, mama, links, NOW)).toBe(false)
  })
  it('la pantalla ofrece el menú ⋯ a quien puede editar, y «Borrar» / código de acceso / tipo / secciones solo a la administración', () => {
    const ui = read('src/ui/FamilyScreen.tsx')
    expect(ui).toContain('canEditMemberCard(m, profile, me, links)')
    expect(ui).toContain('{isAdmin && !m.linkedProfileId && <InviteCodeButton')
    expect(ui).toContain("{isAdmin && m.linkedProfileId !== profile.id && <ConfirmButton label=\"🗑 Borrar\"")
    expect(ui).toContain('{!limited && (')
    expect(ui).toContain('await updateMemberCard(member.id,')
  })
})
