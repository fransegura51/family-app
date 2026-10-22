import type { FeatureEntry, FeatureState, FeatureVerification, HelpCoverage } from '@/admin/features/featureTypes'
import { normalizeHelpText } from '@/admin/features/featureHelp'

export interface FeatureFilters {
  query: string
  module: string // '' = todos
  state: FeatureState | ''
  help: HelpCoverage | ''
  verification: FeatureVerification | ''
}

export const NO_FILTERS: FeatureFilters = { query: '', module: '', state: '', help: '', verification: '' }

// Busca por texto (nombre, módulo y todo lo que se cuenta de la función) y aplica los filtros combinados. `coverageOf` da la cobertura de Ayuda calculada de cada función.
export function filterFeatures(entries: FeatureEntry[], f: FeatureFilters, coverageOf: (e: FeatureEntry) => HelpCoverage): FeatureEntry[] {
  const words = normalizeHelpText(f.query).split(/\s+/).filter(Boolean)
  return entries.filter((e) => {
    if (f.module && e.module !== f.module) return false
    if (f.state && e.state !== f.state) return false
    if (f.verification && e.verification !== f.verification) return false
    if (f.help && coverageOf(e) !== f.help) return false
    if (words.length === 0) return true
    const hay = normalizeHelpText([e.module, e.name, e.works, e.missing ?? '', e.limits ?? '', e.verificationNote].join(' '))
    return words.every((w) => hay.includes(w))
  })
}

export function modulesOf(entries: FeatureEntry[]): string[] {
  return [...new Set(entries.map((e) => e.module))]
}
