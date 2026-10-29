import { HELP_DETAILS, HELP_VIDEOS, SETTINGS_ENTRY, SUMMARIES } from '@/help/legacy/legacyHelp'
import { CARDS_DIA_A_DIA } from '@/help/catalog/cardsDiaADia'
import { CARDS_GENERAL } from '@/help/catalog/cardsGeneral'
import { CARDS_GRUPOS } from '@/help/catalog/cardsGrupos'
import { CARDS_OTROS } from '@/help/catalog/cardsOtros'
import { HELP_MODULES, HELP_MODULE_BY_ID } from '@/help/catalog/modules'
import type { HelpCard, HelpDocEntry, HelpModule, HelpModuleId } from '@/help/types'

// Catálogo completo de la Ayuda = fichas breves nuevas (curadas, con «Llévame»/«Enséñame») + la explicación ampliada histórica de cada módulo (nada de lo válido se tira).
export { HELP_MODULES, HELP_MODULE_BY_ID }
export { HELP_VIDEOS, SUMMARIES }

export const HELP_CARDS: HelpCard[] = [...CARDS_GENERAL, ...CARDS_DIA_A_DIA, ...CARDS_OTROS, ...CARDS_GRUPOS]
export const HELP_CARD_BY_ID = new Map(HELP_CARDS.map((c) => [c.id, c]))

export function cardsOfModule(id: HelpModuleId): HelpCard[] {
  return HELP_CARDS.filter((c) => c.module === id)
}

// Algunas entradas históricas hablan de otro módulo distinto al de la sección donde estaban escritas (la Ayuda vieja las agrupaba por pantalla): se reasignan.
const MODULE_OVERRIDES: Record<string, HelpModuleId> = {
  '/::Hablar con PEPA': 'pepa',
  '/::Botones redondos de arriba': 'pepa',
  '/::Reseñas y opiniones': 'ayuda',
  '/::Invitación a valorar': 'ayuda',
  '/familia::Permiso «Permitir siempre» (app de Android)': 'ubicacion',
  '/familia::Ubicación con la app cerrada (iPhone)': 'ubicacion',
  '/familia::Si olvidas tu PIN': 'cuentas',
  '/menu-organizar::Avisos (antes en Familia)': 'notificaciones',
  '/menu-organizar::Bloqueo de la app': 'cuentas',
  '/menu-organizar::Huella / Face ID': 'cuentas',
  '/menu-organizar::Correo y contraseña': 'cuentas',
  '/menu-organizar::Mi cuenta (antes en Familia)': 'cuentas',
  '/menu-organizar::Pepa: tarjeta de confirmación (antes en Familia)': 'pepa',
  '/menu-organizar::Botones de Pepa: mostrar u ocultar': 'pepa',
}

function moduleForLegacyRoute(route: string): HelpModuleId | undefined {
  return HELP_MODULES.find((m) => m.legacyRoute === route)?.id
}

export const LEGACY_ENTRIES: HelpDocEntry[] = (() => {
  const out: HelpDocEntry[] = []
  const add = (route: string, items: { title: string; text: string }[]) => {
    const base = moduleForLegacyRoute(route)
    if (!base) return
    items.forEach((item, i) => {
      out.push({
        kind: 'legacy',
        id: `leg:${route}:${i}`,
        module: MODULE_OVERRIDES[`${route}::${item.title}`] ?? base,
        title: item.title,
        text: item.text,
        legacyRoute: route,
      })
    })
  }
  for (const [route, items] of Object.entries(HELP_DETAILS)) add(route, items)
  add(SETTINGS_ENTRY.to, SETTINGS_ENTRY.details)
  return out
})()

export function legacyEntriesOfModule(id: HelpModuleId): HelpDocEntry[] {
  return LEGACY_ENTRIES.filter((e) => e.module === id)
}

export function summaryOfModule(mod: HelpModule): string {
  return (mod.legacyRoute === SETTINGS_ENTRY.to ? SETTINGS_ENTRY.summary : mod.legacyRoute ? SUMMARIES[mod.legacyRoute] : undefined) ?? mod.summary
}
