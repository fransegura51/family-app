import type { FamilyRole } from '@/domain/types'
import { NAV_TABS, navSectionId } from '@/domain/navTabs'
import type { HelpAccessRule, HelpCard, HelpModule, HelpPlatform } from '@/help/types'

// Qué le ofrece la Ayuda a cada persona. Reutiliza las MISMAS reglas que el menú (secciones permitidas) y que Comunidad (estado de acceso que calcula el servidor):
// la Ayuda no inventa permisos, solo evita ofrecer botones que a esa persona no le van a funcionar. La seguridad de verdad la sigue haciendo el servidor.
//
//   allowed    → se enseña la ficha entera (respuesta, pasos, «Llévame», «Enséñame»).
//   restricted → la persona pregunta por algo que existe pero no puede hacer: se le explica por qué y a quién pedirlo, sin botones.
//   hidden     → ni aparece (Comunidad sin acceso, funciones de otra plataforma): para esa persona es como si no existiera, como en el resto de la app.
export type HelpAccessStatus = 'allowed' | 'restricted' | 'hidden'

export interface HelpAccessResult {
  status: HelpAccessStatus
  /** Frase para la persona cuando la ficha es «restricted». */
  reason?: string
}

// Estado de Comunidad para esta cuenta: 'ok' = puede entrar; 'no' = no puede (menor de 18, sin fecha de nacimiento, cerrada); 'unknown' = aún no se ha podido comprobar
// (sin red): se trata como «no» para no enseñar nada de Comunidad por error.
export type HelpCommunityState = 'ok' | 'no' | 'unknown'

export interface HelpContext {
  role: FamilyRole
  allowedSections: string[] | null
  platform: HelpPlatform
  community: HelpCommunityState
  /** Esta cuenta administra PEPA (se sabe de hace poco; si no se sabe, false). */
  owner?: boolean
}

export const RESTRICTED_FAMILY_ADMIN = 'Esto solo lo puede hacer la administración de tu familia en PEPA. Pídeselo a quien la administre.'
export const RESTRICTED_ADULTS = 'Esto está pensado para las personas adultas de la familia. Si lo necesitas, pídeselo a un adulto.'
export const RESTRICTED_SECTION = 'Tu cuenta no tiene acceso a esta sección. Si lo necesitas, pídeselo a la administración de tu familia.'

// Secciones que el menú enseña siempre, estén o no en allowedSections.
const ALWAYS_VISIBLE_PATHS = new Set(['/', '/ayuda', '/sugerencias', '/resenas', '/menu-organizar', '/actividad'])

// ¿Puede esta cuenta entrar en la sección de esa ruta? Misma regla que el menú (NavShell).
export function canEnterPath(path: string, ctx: Pick<HelpContext, 'allowedSections'>): boolean {
  if (ctx.allowedSections == null || ALWAYS_VISIBLE_PATHS.has(path) || path.startsWith('/comunidad')) return true
  const tab = NAV_TABS.find((t) => t.to === path)
  if (!tab) return true
  return ctx.allowedSections.includes(navSectionId(tab))
}

export function ruleResult(rule: HelpAccessRule | undefined, ctx: HelpContext): HelpAccessResult {
  if (!rule) return { status: 'allowed' }
  if (rule.platforms && !rule.platforms.includes(ctx.platform)) return { status: 'hidden' }
  if (rule.community && ctx.community !== 'ok') return { status: 'hidden' }
  if (rule.ownerOnly && !ctx.owner) return { status: 'hidden' }
  if (rule.familyAdmin && ctx.role !== 'admin') return { status: 'restricted', reason: RESTRICTED_FAMILY_ADMIN }
  if (rule.adultsOnly && (ctx.role === 'child' || ctx.role === 'guest')) return { status: 'restricted', reason: RESTRICTED_ADULTS }
  return { status: 'allowed' }
}

export function moduleAccess(mod: HelpModule, ctx: HelpContext): HelpAccessResult {
  const byRule = ruleResult(mod.access, ctx)
  if (byRule.status !== 'allowed') return byRule
  if (!canEnterPath(mod.path, ctx)) return { status: 'restricted', reason: RESTRICTED_SECTION }
  return { status: 'allowed' }
}

export function cardAccess(card: HelpCard, mod: HelpModule | undefined, ctx: HelpContext): HelpAccessResult {
  // Una función desactivada no se ofrece como función; si preguntan por ella se explica, pero eso lo decide la pantalla (no es un tema de permisos).
  if (mod) {
    const m = moduleAccess(mod, ctx)
    if (m.status === 'hidden') return m
  }
  const byRule = ruleResult(card.access, ctx)
  if (byRule.status !== 'allowed') return byRule
  if (mod) {
    const m = moduleAccess(mod, ctx)
    if (m.status !== 'allowed') return m
  }
  if (card.go && !canEnterPath(card.go.path, ctx)) return { status: 'restricted', reason: RESTRICTED_SECTION }
  return { status: 'allowed' }
}

// ¿Se puede ofrecer «Llévame»/«Enséñame» en esta ficha? Solo si hay acceso completo y la función está disponible o parcial (nunca desactivada).
export function canOfferActions(card: HelpCard, access: HelpAccessResult): boolean {
  return access.status === 'allowed' && card.state !== 'desactivada'
}
