// Cálculo de la actividad de uso por cuenta a partir de las filas que devuelve list_app_usage_activity (migración 0226).
// Lo usa el panel de propietaria. El centro de mando (otro proyecto) tiene una copia de la misma lógica en pepa.html.
import { OPEN_KEY, sectionLabel } from '@/domain/usageSections'

export interface ActivityRow {
  profileId: string
  familyId: string
  section: string
  hits: number
  daysUsed: number
  lastDay: string // YYYY-MM-DD
}

export interface AccountForActivity {
  profileId: string
  familyId: string
  familyName: string
  displayName: string
  email: string
  createdAt: string
  lastSignInAt: string | null
  hasPush: boolean
}

export interface SectionUse {
  key: string
  label: string
  hits: number
}

export interface AccountActivity extends AccountForActivity {
  opens: number
  daysActive: number
  lastActiveDay: string | null
  totalHits: number
  sections: SectionUse[] // de MÁS a MENOS usada
  inactive: boolean // sin ninguna apertura registrada en el periodo
}

// Pantallas ordenadas de mayor a menor número de entradas; a igualdad, por nombre.
export function rankSections(rows: { section: string; hits: number }[]): SectionUse[] {
  const totals = new Map<string, number>()
  for (const r of rows) {
    if (r.section === OPEN_KEY) continue
    totals.set(r.section, (totals.get(r.section) ?? 0) + r.hits)
  }
  return [...totals.entries()]
    .map(([key, hits]) => ({ key, label: sectionLabel(key), hits }))
    .sort((a, b) => b.hits - a.hits || a.label.localeCompare(b.label, 'es'))
}

// Una línea por cuenta: las que menos usan la app salen primero (son las que interesa detectar).
export function buildAccountActivity(accounts: AccountForActivity[], rows: ActivityRow[]): AccountActivity[] {
  const byProfile = new Map<string, ActivityRow[]>()
  for (const r of rows) {
    const list = byProfile.get(r.profileId) ?? []
    list.push(r)
    byProfile.set(r.profileId, list)
  }
  return accounts
    .map((a) => {
      const mine = byProfile.get(a.profileId) ?? []
      const openRow = mine.find((r) => r.section === OPEN_KEY)
      const sections = rankSections(mine)
      const lastActiveDay = mine.reduce<string | null>((max, r) => (max === null || r.lastDay > max ? r.lastDay : max), null)
      return {
        ...a,
        opens: openRow?.hits ?? 0,
        daysActive: openRow?.daysUsed ?? 0,
        lastActiveDay,
        totalHits: sections.reduce((s, x) => s + x.hits, 0),
        sections,
        inactive: (openRow?.hits ?? 0) === 0,
      }
    })
    .sort((a, b) => a.opens - b.opens || a.displayName.localeCompare(b.displayName, 'es'))
}

export interface OverallSectionUse extends SectionUse {
  accounts: number // cuántas cuentas distintas la han usado
}

// Pantallas más y menos usadas entre TODAS las cuentas. Las pantallas que nadie ha abierto salen con 0 al final.
export function rankOverall(rows: ActivityRow[], allSectionKeys: string[]): OverallSectionUse[] {
  const hits = new Map<string, number>()
  const people = new Map<string, Set<string>>()
  for (const r of rows) {
    if (r.section === OPEN_KEY) continue
    hits.set(r.section, (hits.get(r.section) ?? 0) + r.hits)
    if (!people.has(r.section)) people.set(r.section, new Set())
    people.get(r.section)!.add(r.profileId)
  }
  const keys = new Set([...allSectionKeys, ...hits.keys()])
  return [...keys]
    .map((key) => ({ key, label: sectionLabel(key), hits: hits.get(key) ?? 0, accounts: people.get(key)?.size ?? 0 }))
    .sort((a, b) => b.hits - a.hits || a.label.localeCompare(b.label, 'es'))
}
