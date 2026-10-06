// «Menú del evento»: carga de TODO lo que la pantalla lee, de una vez. Solo LEE las fuentes que ya existen
// (decisiones de Comida y bebida / Invitados, invitados y personas, necesidades, opciones de menú elegibles,
// preguntas y respuestas del RSVP, platos, recetas); no mantiene ninguna copia propia de nada de eso.
import {
  applyFoodDecisionGeneration,
  getEventMenuSections,
  listEventDecisions,
  listEventDietaryNeeds,
  listEventDietarySuggestionDismissals,
  listEventMenuPersonAlternatives,
  listEventGuestMembersForEvent,
  listEventGuestQuestionAnswers,
  listEventGuestQuestionOptionsForEvent,
  listEventGuestQuestions,
  listEventGuests,
  listEventMenuItems,
  listEventMenuOptions,
  listEventMoments,
  upsertEventDecision,
} from '@/data/events'
import { listRecipes } from '@/data/food'
import { listShoppingStores } from '@/data/shoppingStores'
import { buildFoodContext, desiredForFoodKey, FOOD_BLOCK_KEY, FOOD_NECESIDADES_KEY, type NecesidadesAnswer } from '@/domain/eventFood'
import { computeFoodNeedsState } from '@/domain/eventDietaryNeeds'
import type { StoredSection } from '@/domain/eventMenuHub'
import type {
  EventDecision,
  EventDietaryNeed,
  EventDietarySuggestionDismissal,
  EventMenuPersonAlternative,
  EventGuest,
  EventGuestMember,
  EventGuestQuestion,
  EventGuestQuestionAnswer,
  EventGuestQuestionOption,
  EventMenuItem,
  EventMenuOption,
  EventMoment,
  FamilyEvent,
  Recipe,
  ShoppingStoreEntry,
} from '@/domain/types'

export interface MenuHubData {
  decisions: EventDecision[]
  items: EventMenuItem[]
  guests: EventGuest[]
  members: EventGuestMember[]
  needs: EventDietaryNeed[]
  dismissals: EventDietarySuggestionDismissal[]
  alternatives: EventMenuPersonAlternative[]
  options: EventMenuOption[]
  questions: EventGuestQuestion[]
  questionOptions: EventGuestQuestionOption[]
  answers: EventGuestQuestionAnswer[]
  moments: EventMoment[]
  sections: StoredSection[] | null
  recipes: Recipe[]
  stores: ShoppingStoreEntry[]
}

export async function loadMenuHubData(eventId: string): Promise<MenuHubData> {
  const [decisions, items, guests, members, needs, dismissals, alternatives, options, questions, questionOptions, answers, moments, sections, recipes, stores] = await Promise.all([
    listEventDecisions(eventId),
    listEventMenuItems(eventId),
    listEventGuests(eventId),
    listEventGuestMembersForEvent(eventId),
    listEventDietaryNeeds(eventId),
    listEventDietarySuggestionDismissals(eventId),
    listEventMenuPersonAlternatives(eventId),
    listEventMenuOptions(eventId),
    listEventGuestQuestions(eventId),
    listEventGuestQuestionOptionsForEvent(eventId),
    listEventGuestQuestionAnswers(eventId),
    listEventMoments(eventId),
    getEventMenuSections(eventId),
    listRecipes(),
    listShoppingStores(),
  ])
  return { decisions, items, guests, members, needs, dismissals, alternatives, options, questions, questionOptions, answers, moments, sections, recipes, stores }
}

// «¿Habéis tenido en cuenta estas necesidades en el menú?» es una decisión del bloque Comida y bebida
// (comida.necesidades_revisadas): se guarda en el MISMO sitio y con la MISMA reconciliación de siempre
// (applyFoodDecisionGeneration: 'revisar' crea la tarea; 'sí' la marca resuelta). Esta pantalla solo ofrece
// responderla donde viven las necesidades.
export async function saveNecesidadesReview(
  event: FamilyEvent,
  data: Pick<MenuHubData, 'decisions' | 'items' | 'guests' | 'members' | 'needs' | 'moments'>,
  answer: NecesidadesAnswer,
) {
  const saved = await upsertEventDecision(event.id, { blockKey: FOOD_BLOCK_KEY, questionKey: FOOD_NECESIDADES_KEY, answer: answer as unknown as Record<string, unknown> })
  const next = [...data.decisions.filter((d) => d.questionKey !== FOOD_NECESIDADES_KEY), saved]
  const needsState = computeFoodNeedsState(data.guests, data.members, data.needs)
  const ctx = buildFoodContext(event, next, data.items, needsState, data.moments.some((m) => Boolean(m.locationLabel?.trim())))
  const result = await applyFoodDecisionGeneration(event, FOOD_NECESIDADES_KEY, saved.id, desiredForFoodKey(FOOD_NECESIDADES_KEY, ctx))
  return { decisions: next, actions: result.actions }
}
