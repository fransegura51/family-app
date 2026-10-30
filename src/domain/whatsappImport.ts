// Importar contactos desde capturas de WhatsApp (Gestión de grupos). Dominio puro.
// REGLAS: se transcribe lo visible, no se inventa nada; se usa SOLO la agenda de PEPA (tabla de contactos) para crear o vincular; las capturas sucesivas COMPLETAN lo anterior
// (duplicados por teléfono normalizado, coincidencias por nombre solo como propuesta); un contacto sin identificar queda «pendiente de vincular» (no es alumno ni cuenta en botes);
// el nombre original de WhatsApp se conserva siempre y no se pisa información confirmada.
import { findContactCandidates, phoneKey, type ContactCandidate } from '@/domain/contactsModel'
import { foldText, type Participant } from '@/domain/groups'
import { parsePhone } from '@/domain/participantImport'
import type { Contact } from '@/domain/types'

export interface WaRow {
  key: string
  /** Nombre tal como sale en WhatsApp (se conserva siempre). */
  whatsappName: string | null
  phone: string | null
  guardianHint: string | null
  studentHint: string | null
  doubts: string[]
  /** Nº de capturas en las que ha aparecido (para decir «completado con la captura 2»). */
  seenIn: number
}

export interface AiWhatsappRow {
  whatsappName?: string | null
  phone?: string | null
  guardian?: string | null
  student?: string | null
  uncertain?: boolean
}

let seq = 0
const nextKey = () => `wa-${++seq}`
const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

export function fromWhatsappAi(rows: AiWhatsappRow[]): WaRow[] {
  const out: WaRow[] = []
  for (const r of rows) {
    const whatsappName = clean(r.whatsappName) || null
    const parsed = r.phone ? parsePhone(String(r.phone)) : { phone: null, doubt: null }
    const phone = parsed.phone
    if (!whatsappName && !phone) continue
    const doubts: string[] = []
    if (parsed.doubt) doubts.push(parsed.doubt)
    if (r.uncertain) doubts.push('La lectura no estaba clara: compruébala')
    out.push({ key: nextKey(), whatsappName, phone, guardianHint: clean(r.guardian) || null, studentHint: clean(r.student) || null, doubts, seenIn: 1 })
  }
  return out
}

export interface BatchMerge {
  rows: WaRow[]
  added: number
  completed: number
  /** Avisos de datos que no cuadran entre capturas (se conserva el primero). */
  conflicts: string[]
}

/** Suma una captura nueva a las ya leídas: mismo teléfono (normalizado) = misma persona; se completan los huecos y nunca se pisa lo que ya había. */
export function mergeWhatsappBatch(existing: WaRow[], incoming: WaRow[]): BatchMerge {
  const rows = existing.map((r) => ({ ...r }))
  let added = 0
  let completed = 0
  const conflicts: string[] = []
  for (const inc of incoming) {
    const k = phoneKey(inc.phone)
    const target = rows.find((r) => (k && phoneKey(r.phone) === k) || (!k && !r.phone && inc.whatsappName && foldText(r.whatsappName) === foldText(inc.whatsappName)))
    if (!target) {
      rows.push({ ...inc })
      added++
      continue
    }
    target.seenIn += 1
    let filled = false
    const fill = (f: 'whatsappName' | 'phone' | 'guardianHint' | 'studentHint') => {
      if (!target[f] && inc[f]) {
        target[f] = inc[f]
        filled = true
      }
    }
    fill('whatsappName')
    fill('phone')
    fill('guardianHint')
    fill('studentHint')
    if (target.whatsappName && inc.whatsappName && foldText(target.whatsappName) !== foldText(inc.whatsappName)) {
      conflicts.push(`El teléfono ${target.phone ?? ''} sale como «${target.whatsappName}» y como «${inc.whatsappName}»: me quedo con el primero.`)
    }
    if (filled) completed++
  }
  return { rows, added, completed, conflicts }
}

export type WaDecision = 'crear' | 'vincular' | 'pendiente' | 'omitir'

export interface WaProposal {
  row: WaRow
  /** Contactos de la agenda que podrían ser la misma persona (teléfono = fuerte; nombre = posible). */
  candidates: ContactCandidate[]
  /** Ya hay un pendiente guardado con ese teléfono (no se duplica). */
  alreadyPending: boolean
  /** Alumno del grupo al que apunta la pista de la captura, SOLO si es único e inequívoco. */
  studentMatch: Participant | null
  suggested: WaDecision
  /** Contacto sugerido para «vincular» (solo con coincidencia por teléfono). */
  suggestedContactId: string | null
}

/** Alumno del grupo cuyo nombre coincide con la pista (nombre completo o solo nombre, si es único). Si hay duda → null. */
export function matchStudent(hint: string | null, participants: Participant[]): Participant | null {
  const h = foldText(hint)
  if (!h) return null
  const live = participants.filter((p) => !p.leftAt)
  const full = live.filter((p) => foldText([p.name, p.surname].filter(Boolean).join(' ')) === h)
  if (full.length === 1) return full[0]
  if (full.length > 1) return null
  const first = live.filter((p) => foldText(p.name) === h)
  return first.length === 1 ? first[0] : null
}

export function proposeWhatsapp(rows: WaRow[], contacts: Contact[], pendingPhones: Set<string>, participants: Participant[]): WaProposal[] {
  return rows.map((row) => {
    const candidates = findContactCandidates(contacts, { phone: row.phone, whatsappName: row.whatsappName })
    const strong = candidates.find((c) => c.by === 'telefono')
    const k = phoneKey(row.phone)
    const alreadyPending = !!k && pendingPhones.has(k)
    let suggested: WaDecision
    if (alreadyPending && !strong) suggested = 'omitir'
    else if (strong) suggested = 'vincular'
    else if (row.phone && row.whatsappName && candidates.length === 0) suggested = 'crear'
    else suggested = 'pendiente'
    return { row, candidates, alreadyPending, studentMatch: matchStudent(row.studentHint, participants), suggested, suggestedContactId: strong?.contact.id ?? null }
  })
}

/** Nombre inicial de un contacto nuevo a partir del nombre de WhatsApp (editable): se quitan solo adornos evidentes al final, no se «arregla» nada más. */
export function suggestContactName(whatsappName: string | null, phone: string | null): string {
  const n = clean(whatsappName).replace(/[\s\p{Extended_Pictographic}‍️]+$/gu, '').trim()
  return n || clean(phone) || 'Contacto de WhatsApp'
}
