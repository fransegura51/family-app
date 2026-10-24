import type { ActionProposal } from '@/pepa/actions/types'

// «Hacerlo directamente, sin enseñar la tarjeta» (petición real, 13/10/2026: «que tengamos la opción de mostrar tarjeta o de marcar directamente, en todo
// donde esté en la aplicación»). Es una preferencia de cada aparato (services/pepaPreferences.ts); aquí se decide, para UNA propuesta concreta, si se
// puede saltar la tarjeta. La tarjeta se mantiene siempre que:
//   · la acción toque dinero (presupuestos): se revisa siempre;
//   · la propia tarjeta traiga AVISOS (posible duplicado o conflicto de horario, algo que no cuadra): hay que verlos;
//   · quede alguna elección sin valor (p. ej. a quién va, o qué plato): hay que decidirla;
//   · al hacerlo falle algo: se enseña la tarjeta, que explica el error al pulsar el botón.
const ALWAYS_WITH_CARD = new Set(['budget.set'])

export async function autoConfirmProposal(proposal: ActionProposal): Promise<string | null> {
  if (ALWAYS_WITH_CARD.has(proposal.actionId)) return null
  const selection = proposal.initialSelection
  let view
  try {
    view = proposal.preview(selection)
  } catch {
    return null
  }
  if (view.warnings.length > 0) return null
  // Una TAREA sin persona asignada siempre enseña la tarjeta: en directo se guardaba «para toda la familia» sin dejar elegir a quién va (queja real, 24/10/2026,
  // móvil Samsung: «no me reconoce para quién le asigno la tarea»). Con la persona dicha en la frase ya viene asignada y se guarda directo.
  if (proposal.actionId === 'calendar.create' && selection.choices.kind === 'task' && selection.choices.member === 'none') return null
  if (view.choices.some((choice) => !selection.choices[choice.id])) return null
  try {
    return await proposal.confirm(selection)
  } catch {
    return null
  }
}
