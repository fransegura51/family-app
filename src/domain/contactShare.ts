// Compartir una lista de contactos de un grupo (texto para WhatsApp, copiar, solo correos, CSV, Excel, PDF). Dominio puro.
// REGLAS: solo campos ordinarios que la persona marca (nunca notas, alias de pago, observaciones ni datos delicados); nada se publica con un enlace; y siempre hay
// vista previa antes de enviar. Una fila = un contacto familiar de un alumno (un alumno con dos contactos sale en dos filas); si el alumno no tiene contactos vinculados,
// se usan los datos de madre/padre, teléfono y correo de su propia ficha.
import { foldText, type Participant } from '@/domain/groups'
import { makeNamer, sortByPrefs, type NamePrefs } from '@/domain/groupNames'
import { RELATION_LABEL, type Relation } from '@/domain/contactsModel'

export type ShareField = 'student' | 'studentSurname' | 'guardian' | 'relation' | 'phone' | 'email'

export const SHARE_FIELD_LABEL: Record<ShareField, string> = {
  student: 'Nombre del alumno',
  studentSurname: 'Apellidos del alumno',
  guardian: 'Nombre del padre, madre o tutor',
  relation: 'Relación familiar',
  phone: 'Teléfono',
  email: 'Correo electrónico',
}
export const SHARE_FIELDS = Object.keys(SHARE_FIELD_LABEL) as ShareField[]
export const DEFAULT_SHARE_FIELDS: ShareField[] = ['student', 'guardian', 'phone']

export interface LinkedContactRow {
  participantId: string
  contactId: string
  relation: Relation
  name: string
  surname: string | null
  phone: string | null
  email: string | null
  extraPhones: string[]
  extraEmails: string[]
}

export interface ContactEntry {
  /** Identificador estable de la fila (para marcar/desmarcar): `${participantId}:${contactId|'ficha'}`. */
  key: string
  participant: Participant
  guardian: string
  relation: string
  phone: string
  email: string
}

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

export function buildContactEntries(participants: Participant[], links: LinkedContactRow[]): ContactEntry[] {
  const out: ContactEntry[] = []
  for (const p of participants) {
    const mine = links.filter((l) => l.participantId === p.id)
    if (mine.length === 0) {
      if (clean(p.guardianName) || clean(p.phone) || clean(p.email)) {
        out.push({ key: `${p.id}:ficha`, participant: p, guardian: clean(p.guardianName), relation: '', phone: clean(p.phone), email: clean(p.email) })
      } else out.push({ key: `${p.id}:ficha`, participant: p, guardian: '', relation: '', phone: '', email: '' })
      continue
    }
    for (const l of mine) {
      out.push({
        key: `${p.id}:${l.contactId}`,
        participant: p,
        guardian: [clean(l.name), clean(l.surname)].filter(Boolean).join(' '),
        relation: RELATION_LABEL[l.relation] ?? '',
        phone: clean(l.phone) || clean(l.extraPhones[0]),
        email: clean(l.email) || clean(l.extraEmails[0]),
      })
    }
  }
  return out
}

export interface ShareConfig {
  fields: ShareField[]
  /** Claves de fila (`ContactEntry.key`) que se EXCLUYEN. Vacío = todas. */
  excluded: string[]
  /** Quita las filas que no tienen ningún dato de contacto (ni madre/padre, ni teléfono, ni correo) entre los campos elegidos. */
  skipEmpty: boolean
  /** Quita filas repetidas (mismos valores en todos los campos elegidos). */
  dedupe: boolean
  names: NamePrefs
}

export interface RenderedShare {
  headers: string[]
  rows: string[][]
  /** Nº de filas descartadas por vacías o repetidas, para decírselo a la persona en la vista previa. */
  skippedEmpty: number
  skippedDuplicates: number
}

export function renderContactShare(entries: ContactEntry[], cfg: ShareConfig): RenderedShare {
  const fields = SHARE_FIELDS.filter((f) => cfg.fields.includes(f))
  const excluded = new Set(cfg.excluded)
  const chosen = entries.filter((e) => !excluded.has(e.key))
  const people = sortByPrefs([...new Map(chosen.map((e) => [e.participant.id, e.participant])).values()], cfg.names.sortBy)
  const order = new Map(people.map((p, i) => [p.id, i]))
  const namer = makeNamer(people, cfg.names)
  const sorted = [...chosen].sort((a, b) => (order.get(a.participant.id) ?? 0) - (order.get(b.participant.id) ?? 0))

  let skippedEmpty = 0
  let skippedDuplicates = 0
  const seen = new Set<string>()
  const rows: string[][] = []
  const contactFields = fields.filter((f) => f === 'guardian' || f === 'phone' || f === 'email')
  for (const e of sorted) {
    const value = (f: ShareField): string => {
      switch (f) {
        case 'student':
          // Si se pide también el apellido en su columna, el nombre va sin apellidos para no repetirlos.
          return fields.includes('studentSurname') ? clean(e.participant.name) : namer(e.participant)
        case 'studentSurname':
          return clean(e.participant.surname)
        case 'guardian':
          return e.guardian
        case 'relation':
          return e.relation
        case 'phone':
          return e.phone
        case 'email':
          return e.email
      }
    }
    if (cfg.skipEmpty && contactFields.length > 0 && contactFields.every((f) => !value(f))) {
      skippedEmpty++
      continue
    }
    const row = fields.map(value)
    if (cfg.dedupe) {
      const k = row.map((v) => foldText(v)).join('\u0001')
      if (seen.has(k)) {
        skippedDuplicates++
        continue
      }
      seen.add(k)
    }
    rows.push(row)
  }
  return { headers: fields.map((f) => SHARE_FIELD_LABEL[f]), rows, skippedEmpty, skippedDuplicates }
}

/** Texto para WhatsApp: una línea por fila, «Eric García · Jennifer (madre) · 612 345 678». Los campos vacíos no dejan huecos. */
export function toWhatsAppText(title: string, r: RenderedShare, fields: ShareField[]): string {
  const ordered = SHARE_FIELDS.filter((f) => fields.includes(f))
  const lines = r.rows.map((row) => {
    const get = (f: ShareField) => row[ordered.indexOf(f)] ?? ''
    const parts: string[] = []
    const student = [get('student'), get('studentSurname')].filter(Boolean).join(' ')
    if (student) parts.push(student)
    const guardian = get('guardian')
    const rel = get('relation')
    if (guardian) parts.push(rel ? `${guardian} (${rel.toLowerCase()})` : guardian)
    else if (rel) parts.push(rel)
    if (get('phone')) parts.push(get('phone'))
    if (get('email')) parts.push(get('email'))
    return parts.join(' · ')
  })
  return [title, '', ...lines.filter(Boolean)].join('\n')
}

/** Solo los correos, sin repetir, listos para pegar en «Para:» (separados por «; »). */
export function emailsOnly(entries: ContactEntry[], excluded: string[]): string[] {
  const ex = new Set(excluded)
  const seen = new Set<string>()
  const out: string[] = []
  for (const e of entries) {
    if (ex.has(e.key) || !e.email) continue
    const k = e.email.toLowerCase()
    if (!seen.has(k)) {
      seen.add(k)
      out.push(e.email)
    }
  }
  return out
}

function csvCell(v: string): string {
  // Protege contra «inyección de fórmulas» al abrir el CSV en una hoja de cálculo.
  const safe = /^[=+\-@]/.test(v) && !/^\+?\d[\d\s]*$/.test(v) ? `'${v}` : v
  return /[",;\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}
/** CSV con «;» (el separador que espera Excel en español) y BOM para que los acentos se vean bien. */
export function toCsv(r: RenderedShare): string {
  return '﻿' + [r.headers, ...r.rows].map((row) => row.map(csvCell).join(';')).join('\r\n') + '\r\n'
}

// ---------------------------------------------------------------------------------------------- configuraciones guardadas
export interface SharePreset {
  id: string
  name: string
  fields: ShareField[]
  skipEmpty: boolean
  dedupe: boolean
}

export function cleanPresets(raw: unknown[]): SharePreset[] {
  const out: SharePreset[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    if (typeof o.id !== 'string' || typeof o.name !== 'string' || !Array.isArray(o.fields)) continue
    const fields = o.fields.filter((f): f is ShareField => SHARE_FIELDS.includes(f as ShareField))
    if (fields.length === 0) continue
    out.push({ id: o.id, name: o.name.slice(0, 60), fields, skipEmpty: o.skipEmpty !== false, dedupe: o.dedupe !== false })
  }
  return out.slice(0, 20)
}
