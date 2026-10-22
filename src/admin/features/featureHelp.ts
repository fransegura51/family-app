import type { FeatureEntry, HelpCoverage } from '@/admin/features/featureTypes'
import type { HelpModuleId } from '@/help/types'

// Cobertura de la Ayuda de cada función, CALCULADA: se buscan los puntos clave de la función (`help.terms`) en el texto real de la Ayuda de su módulo (fichas nuevas + explicación
// ampliada). Nada se escribe a mano.
//  - sin módulo de Ayuda definido o sin puntos clave definidos → «pendiente de revisión»;
//  - todos los puntos aparecen → «completa»; solo algunos → «parcial»; ninguno → «inexistente».
export type HelpTextOf = (moduleId: HelpModuleId) => string

export function normalizeHelpText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

export interface FeatureHelpResult {
  coverage: HelpCoverage
  found: string[]
  missing: string[]
}

export function featureHelpCoverage(entry: FeatureEntry, textOf: HelpTextOf): FeatureHelpResult {
  const { module, terms } = entry.help
  if (module === null || terms.length === 0) return { coverage: 'pendiente', found: [], missing: [] }
  const text = textOf(module)
  const found = terms.filter((t) => text.includes(normalizeHelpText(t)))
  const missing = terms.filter((t) => !text.includes(normalizeHelpText(t)))
  const coverage: HelpCoverage = missing.length === 0 ? 'completa' : found.length === 0 ? 'inexistente' : 'parcial'
  return { coverage, found, missing }
}
