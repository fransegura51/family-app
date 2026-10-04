// Candado de la fase «🍽️ Comida y bebida» (migración 0192 + datos + pantalla + edge functions). Lee el código
// fuente como texto (mismo estilo que el resto de candados de Eventos): comprueba que la migración es ADITIVA
// y protege los datos reales, que la RLS queda endurecida, que ningún importe desconocido se escribe como 0,
// que la IA nunca guarda sola y que ninguna acción envía nada a los invitados por su cuenta.
import { describe, expect, it } from 'vitest'

const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const SOURCES = import.meta.glob(
  ['/src/ui/EventosScreen.tsx', '/src/ui/RsvpScreen.tsx', '/src/ui/AyudaScreen.tsx', '/src/data/events.ts', '/src/data/food.ts', '/src/services/eventFoodDocument.ts', '/supabase/functions/event-rsvp/index.ts', '/supabase/functions/analyze-event-food-document/index.ts', '/supabase/functions/_shared/ai/purposes/eventFoodDocument.ts'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>

const MIGRATION = Object.entries(MIGRATIONS).find(([f]) => f.includes('0192_event_food_and_drink'))?.[1] ?? ''
const SCREEN = SOURCES['/src/ui/EventosScreen.tsx']
const DATA = SOURCES['/src/data/events.ts']

function slice(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker)
  expect(start, `no encuentro «${startMarker}»`).toBeGreaterThan(-1)
  const end = source.indexOf(endMarker, start + startMarker.length)
  return source.slice(start, end === -1 ? undefined : end)
}

describe('Migración 0192 — aditiva y compatible con los datos reales', () => {
  it('existe y no borra ni reescribe ninguna fila (solo alter/create)', () => {
    expect(MIGRATION.length).toBeGreaterThan(500)
    const code = MIGRATION.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
    expect(code).not.toMatch(/\bdelete\s+from\b/i)
    expect(code).not.toMatch(/\bupdate\s+\w+\s+set\b/i)
    expect(code).not.toMatch(/\btruncate\b/i)
    expect(code).not.toMatch(/\bdrop\s+(table|column)\b/i)
  })
  it('la audiencia de una opción de menú es todos por defecto (las opciones existentes no cambian de comportamiento)', () => {
    expect(MIGRATION).toContain("alter table event_menu_options add column audience text not null default 'todos'")
    expect(MIGRATION).toContain("check (audience in ('todos', 'adultos', 'ninos'))")
  })
  it('event_menu_items se EXTIENDE (columnas nulables o con valor por defecto), sin tabla paralela de menú oficial', () => {
    for (const col of ['recipe_id uuid references recipes(id) on delete set null', 'add column notes text', "add column source text not null default 'manual'", 'add column document_id uuid references event_food_documents(id) on delete set null']) {
      expect(MIGRATION).toContain(col)
    }
    expect(MIGRATION).not.toMatch(/create table\s+event_(official_)?menus?\b/i)
  })
  it('la RLS de event_menu_items queda endurecida: receta de la misma familia y documento del mismo evento y familia', () => {
    const policy = slice(MIGRATION, 'drop policy "event_menu_items: family crud"', 'create table event_guest_dietary_needs')
    expect(policy).toContain('from recipes r where r.id = recipe_id and r.family_id')
    expect(policy).toContain('d.event_id = event_menu_items.event_id')
    expect(policy).toContain('d.family_id =')
  })
  it('los documentos de comida: bucket PRIVADO con políticas por carpeta de familia, y la ruta del archivo debe ser de la familia', () => {
    expect(MIGRATION).toContain("values ('event_food_documents', 'event_food_documents', false)")
    expect(MIGRATION).toContain("bucket_id = 'event_food_documents' and (storage.foldername(name))[1] = private.current_family_id()::text")
    expect(MIGRATION).toContain('(storage.foldername(storage_path))[1] = private.current_family_id()::text')
    expect(MIGRATION).toContain('alter table event_food_documents enable row level security')
  })
  it('necesidades alimentarias: texto original + categoría operativa + tipo + persona, con RLS que ata la persona a su invitación', () => {
    const table = slice(MIGRATION, 'create table event_guest_dietary_needs', 'create index idx_event_guest_dietary_needs_event')
    for (const col of ['original_text text not null', 'category text not null', 'kind text', 'guest_id uuid not null references event_guests(id) on delete cascade', 'member_id uuid references event_guest_members(id) on delete cascade']) {
      expect(table).toContain(col)
    }
    expect(MIGRATION).toContain('m.guest_id = event_guest_dietary_needs.guest_id')
    expect(MIGRATION).toContain('g.event_id = event_guest_dietary_needs.event_id')
    expect(MIGRATION).toContain('alter table event_guest_dietary_needs enable row level security')
  })
  it('una necesidad conserva el texto original: la capa de datos solo permite corregir la clasificación', () => {
    const update = slice(DATA, 'export async function updateEventDietaryNeed', 'export async function loadEventFoodNeedsAlert')
    expect(update).not.toContain('original_text')
  })
})

describe('Capa de datos — protección de lo real', () => {
  it('la adopción de automatismos antiguos reutiliza el mismo ejecutor y nunca escribe un importe', () => {
    const adopt = slice(DATA, 'export async function applyFoodDecisionGeneration', 'export async function applyFoodDayPlan')
    expect(adopt).toContain('reconcilePairGeneration(effective, existingTask, existingBudget)')
    expect(adopt).toContain('executeReconcileActions(')
    expect(adopt).not.toContain('planned_amount: 0')
    expect(adopt).toContain(".is('decision_id', null)")
    expect(adopt).toContain(".eq('source', 'auto')")
    expect(adopt).toContain(".is('planned_amount', null)")
  })
  it('el ejecutor sigue creando los conceptos de presupuesto con importe null', () => {
    expect(DATA).toContain('planned_amount: null, sort_order: Date.now(), decision_id: decisionId')
    expect(DATA).not.toMatch(/planned_amount:\s*0\b/)
  })
  it('el Plan del día de comida va sin hora y solo vía el reconciliador puro, por identidad estable', () => {
    const plan = slice(DATA, 'export async function applyFoodDayPlan', '// Opciones de menú para invitados')
    expect(plan).toContain('reconcileDayPlan(eventType, desired, all, decisionId, resolution)')
    expect(plan).toContain('addEventDayPlanItem(eventId, action.title, null, null, { decisionId, sourceKey: foodMomentSourceKey(action.key) })')
  })
  it('borrar una opción de menú es seguro: solo borra la opción (menu_option_id es ON DELETE SET NULL)', () => {
    const del = slice(DATA, 'export async function deleteEventMenuOption', 'export async function swapEventMenuOptionOrder')
    expect(del).toContain(".from('event_menu_options').delete().eq('id', id)")
    expect(del).not.toContain('event_guest_members')
  })
  it('el documento original se guarda solo al confirmar y no queda huérfano si falla la fila', () => {
    const save = slice(DATA, 'export async function saveEventFoodDocument', 'export async function getEventFoodDocumentUrl')
    expect(save).toContain(".from('event_food_documents').remove([path])")
  })
  it('el aviso global de alertas pide las necesidades de todos los eventos en una sola consulta', () => {
    const alerts = slice(DATA, 'export async function loadAllEventAlerts', 'async function findOrCreateEventTag')
    expect(alerts).toContain(".in('event_id', foodEventIds)")
  })
})

describe('Pantalla — bloque «Comida y bebida»', () => {
  const BLOCK = slice(SCREEN, 'function ComidaBebidaBlock(', '// Fase 2 — Momentos genéricos')
  it('es un acordeón propio del configurador, recordado como los demás', () => {
    expect(SCREEN).toContain("loadConfiguratorOpen(event.id, 'comida')")
    expect(SCREEN).toContain("saveConfiguratorOpen(event.id, 'comida', next)")
    expect(SCREEN).toContain('🍽️ Comida y bebida')
    expect(SCREEN).toContain('<ComidaBebidaBlock event={event}')
  })
  it('las preguntas siguen el orden de la especificación (lugar → quién → contratación → momentos → menú → invitados → infantil → tarta → bebidas → necesidades)', () => {
    const order = ['A) Lo que ya sabemos del lugar', 'B) Quién se encarga', 'C) Contratación', 'D) Momentos de comida', 'E) Estado del menú', 'G) Elección de menú', 'H) Menú infantil', 'I) Tarta', 'J) Bebidas', 'K) Necesidades alimentarias']
    let last = -1
    for (const marker of order) {
      const idx = BLOCK.indexOf(marker)
      expect(idx, marker).toBeGreaterThan(last)
      last = idx
    }
  })
  it('Comida CONSUME los servicios del lugar (primer bloque): ya no los pregunta ni los guarda, y en casa solo dice «La celebración será en casa.»', () => {
    expect(BLOCK).not.toContain('<VenueServicesQuestion')
    expect(BLOCK).not.toContain('VENUE_SERVICES_QUESTION_KEY, a as unknown')
    expect(BLOCK).toContain('🏠 La celebración será en casa.')
    expect(BLOCK).not.toContain('no hace falta preguntar')
  })
  it('reconcilia solo lo que depende de la respuesta guardada, nunca todo el bloque', () => {
    expect(BLOCK).toContain('for (const key of dependentFoodKeys(questionKey))')
    expect(BLOCK).toContain('applyFoodDecisionGeneration(event, key, row.id, desiredForFoodKey(key, nextCtx))')
  })
  it('no preselecciona respuestas nuevas', () => {
    expect(BLOCK).not.toMatch(/useState<[^>]*>\(\s*'(si|decidido|encargar)'/)
  })
  it('lo heredado se muestra como información, no como pregunta: lugar incluido y «Necesitáis menú infantil»', () => {
    expect(BLOCK).toContain('includedByVenueLines(ctx)')
    expect(BLOCK).toContain('👧🧒 Necesitáis menú infantil')
    expect(BLOCK).toContain('guestsChooseMenu(decisions)')
  })
  it('textos literales pedidos', () => {
    for (const text of ['¿Quién se encargará de la comida?', '¿Lo tenéis ya contratado?', '¿Qué momentos de comida habrá?', '¿Tenéis decidido el menú?', '¿Quieres guardar el menú en PEPA?', '¿Cómo vais a resolver el menú infantil?', '¿Habrá tarta?', '¿Y las bebidas?', '¿Habéis tenido en cuenta estas necesidades en el menú?', 'Habéis indicado que los invitados podrán elegir. Añade las opciones que podrán escoger.', 'Elección de menú para los invitados']) {
      expect(SCREEN, text).toContain(text)
    }
    expect(SCREEN).toContain('¿Quieres guardar el menú infantil en PEPA?')
    expect(SCREEN).toContain('📷 Hacer una foto · 🖼️ Elegir una foto · 📄 Subir PDF')
    expect(SCREEN).toContain('✏️ Añadirlo manualmente')
  })
  it('opciones de quién se encarga: las pedidas, sin «El lugar la incluye»', () => {
    const options = slice(SCREEN, 'const FOOD_QUIEN_OPTIONS', 'const FOOD_QUIEN_WAY_OPTIONS')
    for (const label of ['🚚 Catering', '🍴 Restaurante / empresa externa', '👩‍🍳 La preparamos nosotros', '🔀 Combinaremos varias opciones', '🚫 No habrá comida', '⏳ Todavía no lo sabemos', '✏️ Otro']) expect(options).toContain(label)
    expect(options).not.toContain('El lugar la incluye')
  })
  it('el importador: la IA solo propone, se revisa y solo al confirmar se guarda; y no promete seguridad', () => {
    const importer = slice(SCREEN, 'function FoodMenuImporter(', 'function FoodMenuSavePrompt(')
    expect(importer).toContain("setPhase('review')")
    expect(importer).toContain('Revisa lo que PEPA ha entendido')
    expect(importer).toContain('No se guardará nada hasta que confirmes')
    const handleFile = slice(importer, 'async function handleFile', 'async function confirm')
    expect(handleFile).not.toContain('addEventMenuItemsBulk')
    expect(handleFile).not.toContain('saveEventFoodDocument')
    const confirm = slice(importer, 'async function confirm', 'return (')
    expect(confirm.indexOf('saveEventFoodDocument')).toBeLessThan(confirm.indexOf('addEventMenuItemsBulk'))
    expect(importer.toLowerCase()).not.toContain('seguro')
  })
  it('un único importador genérico sirve para el menú principal y para el infantil', () => {
    expect((SCREEN.match(/function FoodMenuImporter\(/g) ?? []).length).toBe(1)
    expect(SCREEN).toContain("kind={infantil ? 'menu_infantil' : 'menu_principal'}")
  })
  it('enlaces directos: Recetas dentro de La cocina de PEPA y Lista de la compra', () => {
    expect(SCREEN).toContain('to="/alimentacion?tab=recetas"')
    expect(SCREEN).toContain('to="/compras"')
    expect(SCREEN).toContain('→ Confirmar traspaso a Compras')
  })
  it('los ingredientes de una receta solo pasan a Compras marcados y confirmados', () => {
    const modal = slice(SCREEN, 'function RecipeIngredientsToShoppingModal(', 'function FoodMenuEditor(')
    expect(modal).toContain('addRecipeIngredientsToShoppingList(')
    expect(modal).toContain('PEPA no añade nada por su cuenta')
    expect(modal).toContain('disabled={saving || checked.size === 0}')
  })
  it('opciones de menú: alta, renombrar, destinatario, orden y baja segura con aviso de cuántos la habían elegido', () => {
    const panel = slice(SCREEN, 'function GuestMenuOptionsPanel(', 'function DietaryNeedsPanel(')
    for (const fn of ['addEventMenuOption', 'updateEventMenuOption', 'deleteEventMenuOption', 'swapEventMenuOptionOrder', 'countMenuChoices']) expect(panel).toContain(fn)
    expect(panel).toContain('quedará')
    expect(panel).toContain('alreadyRespondedMessage')
  })
  it('el panel de opciones NO envía nada a nadie por su cuenta', () => {
    const panel = slice(SCREEN, 'function GuestMenuOptionsPanel(', 'function DietaryNeedsPanel(')
    expect(panel).not.toMatch(/sendRsvp|regenerateGuestRsvpUrl|navigator\.share|wa\.me|mailto:/)
    expect(panel).toContain('PEPA no envía nada por su cuenta')
  })
  it('necesidades: sugerencias que cuentan solo al confirmar; texto original conservado; aviso de seguridad', () => {
    const panel = slice(SCREEN, 'function DietaryNeedsPanel(', 'function ComidaBebidaBlock(')
    expect(panel).toContain("source: 'invitado_nota'")
    expect(panel).toContain('Confirmar')
    expect(panel).toContain('Se conserva lo que escribieron tal cual')
    expect(panel).toContain('no es un diagnóstico')
    expect(panel).toContain('FOOD_SAFETY_DISCLAIMER')
    expect(panel).toContain('Confírmalo con el restaurante o el proveedor.')
    expect(panel).not.toContain('menú es seguro')
  })
  it('el cruce menú↔necesidades se recalcula por huella, no en cada render', () => {
    const panel = slice(SCREEN, 'function DietaryNeedsPanel(', 'function ComidaBebidaBlock(')
    expect(panel).toContain('conflictInputsSignature(menuItems, state.activeNeeds)')
    expect(panel).toContain('useMemo(() => findMenuConflicts(menuItems, state.activeNeeds), [conflictSignature])')
  })
  it('el aviso persistente de necesidades se carga también en PepaConclusions', () => {
    expect(SCREEN).toContain('loadEventFoodNeedsAlert(event.id, guests)')
    expect(SCREEN).toContain('foodNeeds,')
  })
  it('el RSVP público solo muestra a cada persona las opciones que le corresponden', () => {
    const rsvp = SOURCES['/src/ui/RsvpScreen.tsx']
    expect(rsvp).toContain('optionsForPerson(guest.menuOptions, m.personType)')
  })
})

describe('IA de documentos de comida — una sola función genérica', () => {
  const FN = SOURCES['/supabase/functions/analyze-event-food-document/index.ts']
  const PURPOSE = SOURCES['/supabase/functions/_shared/ai/purposes/eventFoodDocument.ts']
  const SERVICE = SOURCES['/src/services/eventFoodDocument.ts']
  it('usa la puerta común de IA (sesión, interruptores, topes, contador) y no guarda nada', () => {
    expect(FN).toContain('serveAiPurpose(eventFoodDocumentSpec)')
    expect(FN).not.toMatch(/\.from\(|insert\(|upsert\(/)
  })
  it('el prompt prohíbe inventar platos, ingredientes, alérgenos, cantidades y precios', () => {
    expect(PURPOSE).toContain('NUNCA inventes platos, ingredientes, alérgenos, cantidades, raciones ni precios')
    expect(PURPOSE).toContain("purpose: 'analyze-event-food-document'")
  })
  it('el cliente limpia la respuesta antes de enseñarla (sanitizeImportProposal) y usa el token de sesión', () => {
    expect(SERVICE).toContain('sanitizeImportProposal(await res.json())')
    expect(SERVICE).toContain('Authorization: `Bearer ${token}`')
  })
})

describe('event-rsvp — destinatario de las opciones', () => {
  const RSVP_FN = SOURCES['/supabase/functions/event-rsvp/index.ts']
  it('una opción para adultos o niños no se acepta para una persona de otra clase', () => {
    expect(RSVP_FN).toContain('function optionAppliesToPerson(')
    expect(RSVP_FN).toContain('if (a === "adultos") return personType === "adulto"')
    expect(RSVP_FN).toContain('if (a === "ninos") return personType === "nino"')
  })
  it('sigue sin exponer datos privados (necesidades, presupuesto, documentos)', () => {
    expect(RSVP_FN).not.toMatch(/event_guest_dietary_needs|event_food_documents|event_budget_items/)
  })
})

describe('Ayuda', () => {
  const HELP = SOURCES['/src/ui/AyudaScreen.tsx']
  it('explica Comida y bebida, servicios del lugar, menú, importación, Recetas, Compras, elección de menú, menú infantil, necesidades y la diferencia entre aviso y garantía', () => {
    const entry = slice(HELP, "title: 'Comida y bebida'", "title: 'Preguntas a los invitados'")
    for (const text of ['¿Qué incluye el lugar contratado?', 'Guardar el menú en PEPA', 'Recetas', 'Compras', 'Elección de menú para los invitados', 'Menú infantil', 'Necesidades alimentarias', 'Un aviso NO es una garantía', 'no significa que el menú sea seguro']) {
      expect(entry, text).toContain(text)
    }
  })
})
