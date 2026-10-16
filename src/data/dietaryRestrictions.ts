// Alergias e intolerancias de la ficha PRIVADA de cada miembro (DATOS DE SALUD, RGPD art. 9) — capa de datos. TODO el acceso es por las funciones del
// servidor dietary_* (supabase.rpc): las tablas no tienen ningún permiso, ni siquiera para la app (migración 0279). Reglas de este archivo:
//   · NADA se guarda fuera de la memoria de quien lo llama: sin localStorage, sin caché, sin registros (console), sin parámetros en URLs.
//   · Los errores llevan frases FIJAS (nunca el texto de la restricción, ni el error del servidor), para que nada acabe en client_errors.
//   · NO lo puede importar ningún servicio de IA, ni la voz de Pepa, ni Comunidad (prueba src/data/dietaryPrivacyLock.test.ts).
//   · Una cuenta de niño o invitado solo recibe lo suyo y no puede escribir (lo decide el servidor; aquí se refleja en `canManage`).
import { supabase } from '@/data/supabaseClient'
import {
  DIETARY_NOTICE_VERSION,
  validateDietaryDraft,
  type DietaryDraft,
  type DietaryKind,
  type DietaryRestriction,
  type DietarySeverity,
} from '@/domain/dietaryRestrictions'

export type DietaryErrorCode = 'forbidden' | 'not_found' | 'no_consent' | 'invalid' | 'duplicate' | 'limit' | 'network'

export const DIETARY_ERROR_TEXT: Record<DietaryErrorCode, string> = {
  forbidden: 'Esta cuenta no puede cambiar estos datos.',
  not_found: 'No se ha encontrado esa persona o ese dato.',
  no_consent: 'Antes hay que dar el consentimiento para guardar datos de salud de esta persona.',
  invalid: 'Algún dato no es válido. Revísalo e inténtalo de nuevo.',
  duplicate: 'Eso ya está anotado para esta persona.',
  limit: 'Se ha llegado al máximo de datos para esta persona.',
  network: 'No se ha podido completar. Inténtalo de nuevo en un momento.',
}

export class DietaryError extends Error {
  readonly code: DietaryErrorCode
  constructor(code: DietaryErrorCode) {
    super(DIETARY_ERROR_TEXT[code])
    this.name = 'DietaryError'
    this.code = code
  }
}

export interface DietaryConsent {
  memberId: string
  grantedBy: string | null
  grantedAt: string
  noticeVersion: string
}

export interface DietaryOverview {
  // true para administradoras y adultas; false para niño o invitado (solo lectura de lo suyo).
  canManage: boolean
  // Ficha de familiar de quien consulta (puede ser null si la cuenta no está enlazada a ninguna).
  myMemberId: string | null
  consents: DietaryConsent[]
  restrictions: DietaryRestriction[]
}

const KNOWN_ERRORS: readonly DietaryErrorCode[] = ['forbidden', 'not_found', 'no_consent', 'invalid', 'duplicate', 'limit']

interface RawRestriction {
  id: string
  member_id: string
  kind: DietaryKind
  allergen_key: DietaryRestriction['allergenKey']
  custom_label: string | null
  severity: DietarySeverity | null
  note: string | null
  created_at: string
  updated_at: string
}

function toRestriction(r: RawRestriction): DietaryRestriction {
  return {
    id: r.id,
    memberId: r.member_id,
    kind: r.kind,
    allergenKey: r.allergen_key,
    customLabel: r.custom_label,
    severity: r.severity,
    note: r.note,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function toConsent(c: { member_id: string; granted_by: string | null; granted_at: string; notice_version: string }): DietaryConsent {
  return { memberId: c.member_id, grantedBy: c.granted_by, grantedAt: c.granted_at, noticeVersion: c.notice_version }
}

// Llama a una función del servidor. Las funciones devuelven {ok:false,error:'…'} en los fallos esperados (sin lanzar excepción, para que ningún dato de
// salud entre en los registros de errores del servidor). Cualquier otro fallo de red se convierte en un error con frase fija.
async function call(fn: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  let result: { data: unknown; error: unknown }
  try {
    result = await supabase.rpc(fn, args)
  } catch {
    throw new DietaryError('network')
  }
  if (result.error) throw new DietaryError('network')
  const data = result.data as { ok?: boolean; error?: string } | null
  if (!data || typeof data !== 'object') throw new DietaryError('network')
  if (data.ok !== true) {
    const code = KNOWN_ERRORS.find((c) => c === data.error)
    throw new DietaryError(code ?? 'network')
  }
  return data as Record<string, unknown>
}

// Una sola lectura pequeña por sesión de Cocina/Familia: devuelve lo que a esta cuenta le toca ver (todo si es adulta; solo lo suyo si es niño o invitado).
export async function loadDietaryOverview(): Promise<DietaryOverview> {
  const data = await call('dietary_list', {})
  return {
    canManage: data.can_manage === true,
    myMemberId: typeof data.my_member_id === 'string' ? data.my_member_id : null,
    consents: ((data.consents as unknown[]) ?? []).map((c) => toConsent(c as Parameters<typeof toConsent>[0])),
    restrictions: ((data.restrictions as unknown[]) ?? []).map((r) => toRestriction(r as RawRestriction)),
  }
}

// Consentimiento expreso de UNA persona (quién y cuándo lo registra el servidor). Sin él no se puede guardar nada de esa persona.
export async function grantDietaryConsent(memberId: string): Promise<DietaryConsent> {
  const data = await call('dietary_grant_consent', { p_member_id: memberId, p_notice_version: DIETARY_NOTICE_VERSION })
  return toConsent(data.consent as Parameters<typeof toConsent>[0])
}

// Retirar el consentimiento BORRA de verdad todo lo registrado de esa persona.
export async function revokeDietaryConsent(memberId: string): Promise<{ deleted: number }> {
  const data = await call('dietary_revoke_consent', { p_member_id: memberId })
  return { deleted: typeof data.deleted === 'number' ? data.deleted : 0 }
}

export async function addDietaryRestriction(memberId: string, draft: DietaryDraft): Promise<DietaryRestriction> {
  const checked = validateDietaryDraft(draft)
  if (!checked.ok) throw new DietaryError('invalid')
  const v = checked.value
  const data = await call('dietary_add', {
    p_member_id: memberId,
    p_kind: v.kind,
    p_allergen_key: v.allergenKey,
    p_custom_label: v.customLabel,
    p_severity: v.severity,
    p_note: v.note,
  })
  return toRestriction(data.restriction as RawRestriction)
}

// Edita tipo, gravedad y nota (y el texto, si es de texto libre). La clave del catálogo no se cambia: se borra y se añade otra.
export async function updateDietaryRestriction(
  current: Pick<DietaryRestriction, 'id' | 'allergenKey' | 'customLabel'>,
  patch: { kind: DietaryKind; customLabel?: string | null; severity: DietarySeverity | null; note: string | null },
): Promise<DietaryRestriction> {
  // Se valida con la misma regla que el alta (para el texto libre se usa el nuevo o, si no se cambia, el actual).
  const draft: DietaryDraft = current.allergenKey
    ? { kind: patch.kind, allergenKey: current.allergenKey, severity: patch.severity, note: patch.note }
    : { kind: patch.kind, customLabel: patch.customLabel ?? current.customLabel, severity: patch.severity, note: patch.note }
  const checked = validateDietaryDraft(draft)
  if (!checked.ok) throw new DietaryError('invalid')
  const v = checked.value
  const data = await call('dietary_update', {
    p_id: current.id,
    p_kind: v.kind,
    p_custom_label: current.allergenKey ? null : v.customLabel,
    p_severity: v.severity,
    p_note: v.note,
  })
  return toRestriction(data.restriction as RawRestriction)
}

export async function deleteDietaryRestriction(id: string): Promise<void> {
  await call('dietary_delete', { p_id: id })
}

// Utilidades de lectura sobre lo ya cargado (sin llamadas nuevas).
export function restrictionsOfMember(overview: DietaryOverview, memberId: string): DietaryRestriction[] {
  return overview.restrictions.filter((r) => r.memberId === memberId)
}
export function hasDietaryConsent(overview: DietaryOverview, memberId: string): boolean {
  return overview.consents.some((c) => c.memberId === memberId)
}
