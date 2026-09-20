import { ingredientsToShoppingAction, menuSetAction } from '@/pepa/actions/menuActions'
import { calendarCreateAction, shoppingAddAction } from '@/pepa/actions/talkActions'
import type { ActionContext, ProposeResult, RegisteredAction } from '@/pepa/actions/types'

// Lista CERRADA de acciones que Pepa puede proponer. Una IA (o unas reglas)
// solo puede pedir un id de esta lista; cualquier otro se rechaza. Para
// permitir algo nuevo hay que escribir su acción, con su validación, y
// añadirla aquí a propósito.
const ACTIONS: RegisteredAction[] = [menuSetAction, ingredientsToShoppingAction, shoppingAddAction, calendarCreateAction]

export function actionIds(): string[] {
  return ACTIONS.map((a) => a.id)
}

export function proposeAction(id: string, raw: unknown, ctx: ActionContext): ProposeResult {
  const action = ACTIONS.find((a) => a.id === id)
  if (!action) return { ok: false, errors: ['Acción no permitida'] }
  return action.propose(raw, ctx)
}
