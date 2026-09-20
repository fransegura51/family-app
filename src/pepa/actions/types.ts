// Sistema de acciones de Pepa: la ÚNICA vía por la que algo que Pepa ha
// interpretado (con reglas hoy, con IA mañana) puede acabar escrito.
//
//   1. Alguien —las reglas o la IA— propone una acción: un id de una lista
//      cerrada y unos parámetros en bruto.
//   2. El código de la acción los VALIDA de forma estricta (fechas reales,
//      que las recetas existan, sin campos de más). Nada validado, nada se
//      prepara.
//   3. Se enseña una tarjeta con lo que se va a hacer, donde el usuario puede
//      ajustar opciones.
//   4. Solo cuando el usuario confirma se VUELVE a validar y se ejecuta con
//      las funciones de datos de siempre (sesión del usuario, permisos de
//      siempre). La IA no tiene acceso a nada de esto.
import type { Recipe, MenuEntry } from '@/domain/types'

// Datos ya cargados que las acciones necesitan para validar y describir.
export interface ActionContext {
  recipes: Recipe[]
  menuEntries: MenuEntry[]
  shoppingItemNames: string[]
  members: { id: string; name: string }[]
  // Tiendas dadas de alta por la familia (para elegir tienda en una tarjeta).
  storeNames?: string[]
  today: Date
}

export interface Choice {
  id: string
  label: string
  options: { key: string; label: string }[]
}

export interface CheckOption {
  key: string
  label: string
  note?: string
}

// Lo que se enseña en la tarjeta de confirmación.
export interface Presentation {
  title: string
  lines: string[]
  warnings: string[]
  choices: Choice[]
  checks: CheckOption[]
  confirmLabel: string
}

// Lo que el usuario ha elegido en la tarjeta.
export interface Selection {
  choices: Record<string, string>
  checked: string[]
}

export type ParamsCheck<P> = { ok: true; params: P } | { ok: false; errors: string[] }

export interface ActionDefinition<P> {
  id: string
  validate(raw: unknown, ctx: ActionContext): ParamsCheck<P>
  initialSelection(params: P, ctx: ActionContext): Selection
  // Aplica lo elegido en la tarjeta a los parámetros (sin validar todavía).
  applySelection(params: P, selection: Selection): P
  present(params: P, ctx: ActionContext): Presentation
  // Escribe de verdad y devuelve el mensaje de "hecho".
  execute(params: P, ctx: ActionContext): Promise<string>
}

export interface ActionProposal {
  actionId: string
  initialSelection: Selection
  preview(selection: Selection): Presentation
  confirm(selection: Selection): Promise<string>
}

export type ProposeResult = { ok: true; proposal: ActionProposal } | { ok: false; errors: string[] }

export interface RegisteredAction {
  id: string
  propose(raw: unknown, ctx: ActionContext): ProposeResult
}

// Convierte una definición tipada en una acción registrable, con el
// contrato de seguridad fijo: validar al proponer y VOLVER a validar al
// confirmar (lo elegido en la tarjeta también pasa por la validación).
export function defineAction<P>(def: ActionDefinition<P>): RegisteredAction {
  return {
    id: def.id,
    propose(raw, ctx) {
      const checked = def.validate(raw, ctx)
      if (!checked.ok) return { ok: false, errors: checked.errors }
      const base = checked.params
      return {
        ok: true,
        proposal: {
          actionId: def.id,
          initialSelection: def.initialSelection(base, ctx),
          preview: (selection) => def.present(def.applySelection(base, selection), ctx),
          confirm: async (selection) => {
            const final = def.validate(def.applySelection(base, selection), ctx)
            if (!final.ok) throw new Error(final.errors[0] ?? 'Los datos no son válidos')
            return def.execute(final.params, ctx)
          },
        },
      }
    },
  }
}
