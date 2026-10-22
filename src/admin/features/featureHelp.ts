import type { FeatureEntry, HelpCoverage } from '@/admin/features/featureTypes'

// Cobertura de la Ayuda de cada función, CALCULADA: se buscan los puntos clave de la función (`help.terms`) en el texto real de su sección de Ayuda. Nada se escribe a mano.
//  - sin sección de Ayuda definida (route = null) o sin puntos clave definidos → «pendiente de revisión»;
//  - todos los puntos aparecen → «completa»; solo algunos → «parcial»; ninguno → «inexistente».
export interface HelpSource {
  summaries: Record<string, string>
  details: Record<string, { title: string; text: string }[]>
}

export function normalizeHelpText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function helpTextForRoute(src: HelpSource, route: string): string {
  const parts = [src.summaries[route] ?? '', ...(src.details[route] ?? []).map((i) => `${i.title} ${i.text}`)]
  return normalizeHelpText(parts.join(' '))
}

export interface FeatureHelpResult {
  coverage: HelpCoverage
  found: string[]
  missing: string[]
}

export function featureHelpCoverage(entry: FeatureEntry, src: HelpSource): FeatureHelpResult {
  const { route, terms } = entry.help
  if (route === null || terms.length === 0) return { coverage: 'pendiente', found: [], missing: [] }
  const text = helpTextForRoute(src, route)
  const found = terms.filter((t) => text.includes(normalizeHelpText(t)))
  const missing = terms.filter((t) => !text.includes(normalizeHelpText(t)))
  const coverage: HelpCoverage = missing.length === 0 ? 'completa' : found.length === 0 ? 'inexistente' : 'parcial'
  return { coverage, found, missing }
}
