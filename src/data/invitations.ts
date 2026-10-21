import { supabase } from '@/data/supabaseClient'
import { parseInvitationCheck, type InvitationCheck } from '@/domain/invitations'
import type { GuardianLink, GuardianRelationship } from '@/domain/guardianship'

// Invitaciones y vínculos familiares (migraciones 0293–0295). Todo lo importante se decide en el SERVIDOR; aquí solo se llama a sus funciones.
// Ninguna de estas llamadas crea cuentas: la cuenta nueva solo se crea con una invitación válida (gancho de Supabase Auth) y se vincula con create_family / join_family_with_code.

/**
 * ¿Es válida esta invitación? Se llama ANTES de crear la cuenta, sin haber entrado. Devuelve solo si vale, de qué tipo es, cuándo caduca y si hay que pedir la fecha de nacimiento;
 * nunca datos de ninguna familia. No gasta ni reserva el código. Con demasiados intentos desde la misma conexión devuelve `throttled`.
 */
export async function checkInvitation(code: string): Promise<InvitationCheck> {
  const { data, error } = await supabase.rpc('check_invitation', { p_code: code })
  if (error) throw error
  return parseInvitationCheck(data)
}

export interface MemberInvitation {
  code: string
  expiresAt: string
  /** true = ya había una invitación vigente y se devuelve esa (no se crea otra). */
  reused: boolean
}

/**
 * «Dar acceso a PEPA»: la invitación de una ficha sin cuenta. La pide una administradora de la familia o una madre/padre vinculado (solo para su hijo menor): lo comprueba el servidor.
 * Si ya hay una invitación vigente la devuelve en vez de crear otra; `regenerate` fuerza una nueva (la anterior deja de valer).
 */
export async function createMemberInvitation(memberId: string, regenerate = false): Promise<MemberInvitation> {
  const { data, error } = await supabase.rpc('create_member_invitation', { p_member_id: memberId, p_regenerate: regenerate })
  if (error) throw error
  const row = (data as { o_code: string; o_expires_at: string; o_reused: boolean }[] | null)?.[0]
  if (!row) throw new Error('No se pudo generar la invitación')
  return { code: row.o_code, expiresAt: row.o_expires_at, reused: row.o_reused }
}

/** Los vínculos «madre/padre/tutor» vigentes de la familia (solo los ven las personas adultas y administradoras: lo decide la base de datos). */
export async function listGuardianships(): Promise<GuardianLink[]> {
  const { data, error } = await supabase
    .from('family_member_guardians')
    .select('id, child_member_id, guardian_member_id, relationship, declared_at')
    .eq('status', 'active')
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id as string,
    childMemberId: r.child_member_id as string,
    guardianMemberId: r.guardian_member_id as string,
    relationship: r.relationship as GuardianRelationship,
    declaredAt: r.declared_at as string,
  }))
}

/**
 * «Es mi hijo/a» (o tutela): registra la DECLARACIÓN de la propia persona. Exige haber aceptado la declaración y haberse identificado hace poco; lo comprueba el servidor.
 * No es una verificación documental de la filiación.
 */
export async function declareGuardianship(childMemberId: string, relationship: GuardianRelationship, declarationVersion: string): Promise<string> {
  const { data, error } = await supabase.rpc('declare_guardianship', {
    p_child_member: childMemberId,
    p_relationship: relationship,
    p_declaration_accepted: true,
    p_declaration_version: declarationVersion,
  })
  if (error) throw error
  return data as string
}
