import { HELP_CARDS, HELP_MODULE_BY_ID, LEGACY_ENTRIES, summaryOfModule } from '@/help/catalog'
import { normalizeText } from '@/help/search/normalize'
import type { HelpModuleId } from '@/help/types'

// Todo el texto de la Ayuda de un módulo (resumen + fichas + explicación ampliada), normalizado (minúsculas, sin tildes ni signos). Con él se calcula la cobertura de la Ayuda
// de cada función del inventario del Centro de Administración: una función cuenta como «cubierta» si sus puntos clave aparecen de verdad en la Ayuda de su módulo.
const cache = new Map<HelpModuleId, string>()

export function moduleHelpText(id: HelpModuleId): string {
  const hit = cache.get(id)
  if (hit !== undefined) return hit
  const mod = HELP_MODULE_BY_ID.get(id)
  const parts: string[] = mod ? [summaryOfModule(mod)] : []
  for (const c of HELP_CARDS) {
    if (c.module !== id) continue
    parts.push(c.title, ...c.synonyms, c.quick, ...(c.steps ?? []), c.more ?? '', c.limits ?? '')
  }
  for (const e of LEGACY_ENTRIES) if (e.module === id) parts.push(e.title, e.text)
  const text = normalizeText(parts.join(' '))
  cache.set(id, text)
  return text
}
