// Candado de «Menú del evento» (antes «Menú y compra»). Sin jsdom: lee el código real como texto, mismo estilo que
// el resto de candados de Eventos. El comportamiento con datos se prueba en domain/eventMenuHub.test.ts y
// data/eventMenuHub.behavior.test.ts; aquí, la ESTRUCTURA: qué vive dónde y qué nunca debe volver a pasar.
import { describe, expect, it } from 'vitest'

const FILES = import.meta.glob(['/src/ui/*.tsx', '/src/domain/*.ts', '/src/data/*.ts', '/supabase/functions/**/index.ts', '/supabase/functions/_shared/ai/purposes/eventFoodDocument.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const SCREEN = FILES['/src/ui/EventosScreen.tsx']
const MENU = FILES['/src/ui/EventMenu.tsx']
const DINERS = FILES['/src/ui/EventMenuDiners.tsx']
const IMPORTER = FILES['/src/ui/EventMenuImporter.tsx']
const PICKER = FILES['/src/ui/PickIngredientsModal.tsx']
const ALIMENTACION = FILES['/src/ui/AlimentacionScreen.tsx']
const EVENTS_DOMAIN = FILES['/src/domain/events.ts']
const AYUDA = FILES['/src/ui/AyudaScreen.tsx']
const INVITATIONS = FILES['/src/ui/InvitationDesigner.tsx']

function slice(source: string, start: string, end: string): string {
  const i = source.indexOf(start)
  expect(i, start).toBeGreaterThan(-1)
  const j = source.indexOf(end, i + start.length)
  expect(j, end).toBeGreaterThan(i)
  return source.slice(i, j)
}

describe('Nombre visible y navegación (1, 2, 4)', () => {
  it('1. la tarjeta se llama «Menú del evento»; la clave interna no cambia (sin riesgo para eventos guardados)', () => {
    expect(EVENTS_DOMAIN).toContain("{ key: 'menu_compra', label: 'Menú del evento', icon: '🍽️' }")
  })
  it('1. el nombre antiguo ya no aparece en ningún texto visible (tarjeta, breadcrumb, Ayuda, pantallas)', () => {
    const visible = Object.entries(FILES).filter(([file]) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx'))
    const offenders = visible.filter(([, text]) => /Menú y compra/.test(text)).map(([file]) => file)
    expect(offenders).toEqual([])
    expect(AYUDA).toContain("title: 'Menú del evento'")
  })
  it('1. el breadcrumb sale de EVENT_MODULES (una sola fuente), así que cambia con la tarjeta', () => {
    expect(SCREEN).toContain("EVENT_MODULES.find((m) => m.key === openModule)?.label")
  })
  it('2. tocar la tarjeta abre el nuevo espacio operativo', () => {
    const open = slice(SCREEN, "case 'menu_compra':\n        return (", "case 'compras':")
    expect(open).toContain('<EventMenuSection')
    expect(SCREEN).not.toContain('function MenuSection(')
  })
  it('4. «Ir a Menú del evento» desde Comida y bebida abre ESE módulo', () => {
    expect(SCREEN).toContain("onOpenMenu={() => setOpenModule('menu_compra')}")
    expect(SCREEN).toContain('🍽️ Ir a Menú del evento')
    expect(SCREEN).toContain('🍽️ Crear / gestionar menú')
  })
  it('la tarjeta de Compras sigue siendo independiente (de solo lectura) y no se duplica dentro del menú', () => {
    expect(SCREEN).toContain("label: 'Compras'")
    expect(MENU).not.toContain('EventShoppingSection')
    expect(MENU).not.toMatch(/listShoppingItems/)
  })
  it('el acceso a Compras abre la Lista directamente', () => {
    expect(MENU).toContain("to=\"/compras\" state={{ tab: 'Lista' }}")
  })
})

describe('Comida y bebida se queda en decisiones (3)', () => {
  const block = slice(SCREEN, 'function ComidaBebidaBlock(', '// Fase 2 — Momentos genéricos')
  it('3. ya no contiene el gestor: ni editor de platos, ni secciones, ni importador, ni enlaces a Recetas/Compras, ni traspaso', () => {
    for (const forbidden of ['FoodMenuEditor', 'FoodMenuImporter', 'RecipeIngredientsToShoppingModal', 'DietaryNeedsPanel', 'addEventMenuItem', 'updateEventMenuItem', 'deleteEventMenuItem', 'MENU_SECTIONS', 'groupMenuBySection', '/alimentacion?tab=recetas', 'to="/compras"', 'transferMenuToShopping', 'Confirmar traspaso']) {
      expect(block, forbidden).not.toContain(forbidden)
    }
    expect(SCREEN).not.toContain('function FoodMenuEditor(')
    expect(SCREEN).not.toContain('function FoodMenuImporter(')
    expect(SCREEN).not.toContain('function DietaryNeedsPanel(')
  })
  it('3. conserva TODAS las decisiones que ya funcionaban', () => {
    for (const text of ['¿Quién se encargará de la comida?', '¿Qué momentos de comida habrá?', '¿Tenéis decidido el menú?', '¿Cómo vais a resolver el menú infantil?', '¿Habrá tarta?', '¿Y las bebidas?']) expect(SCREEN, text).toContain(text)
    expect(SCREEN).toContain('¿Quieres guardar el menú en PEPA?')
    expect(SCREEN).toContain('¿Quieres guardar el menú infantil en PEPA?')
    expect(block).toContain('FoodMenuSavePrompt')
    expect(block).toContain('FOOD_MENU_ESTADO_KEY')
  })
  it('«¿Quieres guardar el menú…?» = Sí → solo un acceso sencillo (no se despliega el gestor)', () => {
    const prompt = slice(SCREEN, 'function FoodMenuSavePrompt(', 'function FoodMenuLink(')
    expect(prompt).toContain('<FoodMenuLink')
    expect(prompt).not.toMatch(/FoodMenuEditor|addEventMenuItem|<form/)
  })
  it('el aviso de necesidades apunta al módulo; la pregunta «¿Habéis tenido en cuenta…?» y el alta viven en Comensales', () => {
    expect(SCREEN).toContain('Ver en Menú del evento')
    expect(DINERS).toContain('¿Habéis tenido en cuenta estas necesidades en el menú?')
  })
  it('las opciones de menú elegibles siguen en el cuestionario (configuración) y los resultados se ven en Comensales', () => {
    expect(SCREEN).toContain('Elección de menú para los invitados')
    expect(SCREEN).toContain('Lo que ha elegido cada persona se ve en «Menú del evento» → Comensales.')
    expect(DINERS).toContain('ELECCIONES DE MENÚ')
    expect(DINERS).toContain('countMenuChoices(data.options, members, guests)')
  })
})

describe('Menú: platos y secciones (5–14)', () => {
  it('5. crear menú manual desde el estado vacío, con los textos de siempre', () => {
    expect(MENU).toContain('✏️ Añadirlo manualmente')
    expect(MENU).toContain('📷 Hacer una foto · 🖼️ Elegir una foto · 📄 Subir PDF')
  })
  it('6/7/8. un plato se crea, edita y borra; la receta es OPCIONAL y el borrado pide confirmación', () => {
    expect(MENU).toContain('addEventMenuItem(event.id, values.name, isDishKind ? values.category : null, null,')
    expect(MENU).toContain('updateEventMenuItem(target.item.id, {')
    expect(MENU).toContain('<ConfirmIconButton')
    expect(MENU).toContain('Sin receta enlazada')
    expect(MENU).not.toMatch(/recipeId[^\n]*required|required[^\n]*recipe/i)
    const sheet = slice(MENU, 'function DishSheet(', 'function SectionsSheet(')
    expect(sheet).not.toMatch(/\brequired\b/) // ni la receta ni la nota son obligatorias
  })
  it('9–13. «Gestionar secciones»: activar, ocultar, recuperar, crear otra; ocultar con platos queda bloqueado', () => {
    const sheet = slice(MENU, 'function SectionsSheet(', '\n}\n')
    for (const text of ['Gestionar secciones', 'EN EL MENÚ', 'OCULTAS (toca para volver a mostrar)', '+ Añadir otra sección', 'Ocultar', 'Mostrar']) expect(sheet, text).toContain(text)
    expect(sheet).toContain('disabled={!canHide}')
    expect(sheet).toContain("muévelo o bórralo")
    expect(sheet).toContain("muévelos o bórralos")
    expect(sheet).toContain('addCustomSection(config, label)')
    expect(sheet).not.toMatch(/deleteEventMenuItem/) // ocultar jamás borra platos
  })
  it('14. orden de secciones: asa ☰ con arrastre táctil Y alternativa accesible ▲▼ (mismo patrón que el Plan del día, sin dependencias)', () => {
    const sheet = slice(MENU, 'function SectionsSheet(', '\n}\n')
    expect(sheet).toContain('useDragReorder(')
    expect(sheet).toContain('className="drag-handle" style={{ touchAction: \'none\' }}')
    expect(sheet).toContain('aria-label={`Subir ${view.label}`}')
    expect(sheet).toContain('aria-label={`Bajar ${view.label}`}')
    expect(sheet).toContain('reorderVisibleSections(config,')
  })
  it('las secciones se guardan en su sitio (event_menu_settings) y no tocan los platos', () => {
    const persist = slice(MENU, 'async function persistSections(', 'async function saveDish(')
    expect(persist).toContain('saveEventMenuSections(event.id, next)')
    expect(persist).not.toMatch(/MenuItem/)
  })
  it('solo se ven las secciones elegidas: no ocupan pantalla las vacías que se ocultaron', () => {
    expect(MENU).toContain('resolveMenuSections(data.sections, data.items, infantilNeeded)')
    expect(MENU).toContain('resolved.visible.map')
  })
})

describe('Importar (15–18, 14 del encargo)', () => {
  it('15/16. foto, galería o PDF → PROPUESTA → revisar → confirmar (un solo importador para todo)', () => {
    expect(IMPORTER).toContain('FileOrPdfPicker')
    expect(IMPORTER).toContain("analyzeEventFoodDocument(next, kind)")
    expect(IMPORTER).toContain("setPhase('review')")
    expect(IMPORTER).toContain('Revisa lo que PEPA ha entendido')
    expect(FILES['/src/ui/FileOrPdfPicker.tsx']).toContain('application/pdf')
  })
  it('17. cancelar o descartar no guarda nada: la propuesta nunca se guarda sola', () => {
    const handleFile = slice(IMPORTER, 'async function handleFile', 'async function confirm')
    expect(handleFile).not.toMatch(/importEventMenuItems|saveEventFoodDocument/)
    expect(IMPORTER).toContain('onClick={onCancel}')
    expect(IMPORTER).toContain('Descartar')
    expect(IMPORTER).toContain('No se guardará nada hasta que confirmes')
  })
  it('18. al confirmar se conserva el documento original y los platos quedan enlazados a él', () => {
    const confirm = slice(IMPORTER, 'async function confirm', 'const chosenCount')
    expect(confirm.indexOf('saveEventFoodDocument')).toBeLessThan(confirm.indexOf('importEventMenuItems'))
    expect(confirm).toContain('documentId: doc.id')
  })
  it('aviso breve antes de importar si hay necesidades: ayuda a revisar, sin prometer detección perfecta ni seguridad', () => {
    expect(IMPORTER).toContain('PEPA podrá ayudarte a detectar posibles platos que convenga revisar según las necesidades alimentarias de tus invitados.')
    expect(IMPORTER).not.toMatch(/comprobar[aá] que|es seguro|garantiz/i)
    expect(MENU).toContain('needsHint={needsState.activeNeeds.length > 0 || data.needs.length > 0}')
  })
})

describe('Comensales (19–26, 39)', () => {
  it('muestra confirmados, adultos/niños, pendientes (información provisional) y «todos han respondido»', () => {
    for (const text of ['confirmado', 'adulto', 'niño', 'todavía no', 'la información es provisional', '✓ Todos han respondido sobre comida', '👥 Comensales']) expect(DINERS, text).toContain(text)
  })
  it('necesidades: resumen sin necesidades, y a un toque QUIÉN es con el texto ORIGINAL', () => {
    expect(DINERS).toContain('No se han indicado alergias ni necesidades alimentarias.')
    expect(DINERS).toContain('«${p.originalText}»')
    expect(DINERS).toContain('ExpandableLine')
  })
  it('24. menú infantil: se hereda de Invitados / Comida y bebida, no se vuelve a preguntar', () => {
    expect(DINERS).toContain('ninosNeedMenuInfantil(decisions)')
    expect(DINERS).toContain('Menú infantil:')
    expect(DINERS).not.toContain('¿Cómo vais a resolver el menú infantil?')
  })
  it('39. preguntas de comida: solo las que la familia marcó (nunca por palabras) y las respuestas se leen del RSVP', () => {
    expect(DINERS).toContain('foodQuestionResults(')
    expect(DINERS).toContain('Es de comida')
    expect(DINERS).toContain('PEPA no lo adivina por el texto')
    expect(FILES['/src/domain/eventMenuHub.ts']).toContain("q.topic === 'comida'")
    expect(FILES['/src/domain/eventMenuHub.ts']).not.toMatch(/\.test\(question|prompt\.match|\/comida\//i)
  })
  it('lee las decisiones existentes: no guarda copias de comensales ni de necesidades', () => {
    expect(DINERS).toContain('computeDiners(guests)')
    expect(DINERS).not.toMatch(/upsertEventDecision|supabase/)
    const hub = FILES['/src/data/eventMenuHub.ts']
    // la única escritura es la decisión que ya existía (comida.necesidades_revisadas), por el mismo camino de siempre
    expect(hub.match(/upsertEventDecision\(/g)?.length).toBe(1)
    expect(hub).toContain('applyFoodDecisionGeneration(')
  })
  it('seguridad alimentaria: nunca afirma que un plato o menú sea seguro (38)', () => {
    const text = [MENU, DINERS, IMPORTER].join('\n')
    expect(text).toContain('Es un aviso para revisar, no una certeza')
    expect(text).not.toMatch(/menú es seguro|plato es seguro|es seguro para|puede comer|no puede comer|es peligroso/i)
  })
})

describe('Herramientas contextuales: Recetas y Compras (27–36)', () => {
  it('las herramientas salen SOLO del modo que calcula menuToolsMode (una fuente: la decisión de Comida y bebida)', () => {
    expect(MENU).toContain('menuToolsMode(ctx)')
    expect(MENU).toContain('showKitchenLinks(mode)')
    expect(MENU).toContain('dishHasKitchenTools(mode, dish.preparedBy, dish.kind)')
    expect(MENU).toContain("if (mode === 'sin_comida') return null")
  })
  it('31/32. «todavía no sabemos» y «no habrá comida» muestran su mensaje en vez de las herramientas', () => {
    expect(MENU).toContain('TOOLS_WAITING_MESSAGE')
    expect(MENU).toContain('NO_FOOD_MESSAGE')
    expect(MENU).toContain('Lo que ya tenías guardado se conserva.')
  })
  it('30. en un evento mixto cada plato indica quién lo prepara; sin indicar nunca se adivina', () => {
    expect(MENU).toContain("mode === 'mixto' && (")
    expect(MENU).toContain('¿Quién lo prepara?')
    expect(MENU).toContain('Sin indicar')
  })
  it('33/36. un plato sin receta no genera ingredientes; el botón 🛒 solo existe con receta con ingredientes; nada se envía solo', () => {
    expect(MENU).toContain('tools && recipe && recipe.ingredients.length > 0')
    expect(MENU).toContain('Elegir ingredientes de')
    // el único camino a Compras es el selector (confirmación explícita)
    expect(MENU).not.toContain('addRecipeIngredientsToShoppingList')
    expect(MENU).not.toContain('addShoppingItem')
    expect(PICKER).toContain('disabled={saving || selected.size === 0}')
  })
  it('34/35. se reutiliza el selector de Recetas (el mismo componente), con la opción de tienda y ligado al evento', () => {
    expect(ALIMENTACION).toContain("import { PickIngredientsModal } from '@/ui/PickIngredientsModal'")
    expect(ALIMENTACION).not.toContain('function PickIngredientsModal(')
    expect(MENU).toContain('<PickIngredientsModal')
    expect(MENU).toContain('eventId={event.id}')
    expect(PICKER).toContain('Sin tienda concreta')
    expect(PICKER).toContain('addRecipeIngredientsToShoppingList(recipe, selections, eventId)')
    expect((Object.values(FILES).join('\n').match(/function PickIngredientsModal\(|export function PickIngredientsModal\(/g) ?? []).length).toBe(1)
  })
  it('la receta se elige de las recetas REALES de La cocina de PEPA (no hay un sistema paralelo) y es opcional', () => {
    expect(FILES['/src/data/eventMenuHub.ts']).toContain('listRecipes()')
    expect(MENU).not.toMatch(/createRecipe|addRecipe\(/)
  })
})

describe('Móvil primero (40)', () => {
  it('los formularios son hojas apiladas (member-form) y no una fila «inline-fields» que se salga de la tarjeta', () => {
    expect(MENU).not.toContain('inline-fields')
    expect(MENU).toContain('className="card member-form"')
    expect(IMPORTER).toContain('menu-import-row')
    // el antiguo formulario «+ Añadir un plato / Sección…» ya no existe
    expect(MENU + SCREEN).not.toContain('+ Añadir un plato')
  })
  it('las filas de plato y sección usan clases que encogen (min-width:0 / wrap) definidas para el módulo', () => {
    for (const cls of ['menu-dish', 'menu-dish-main', 'menu-section', 'menu-toolbar']) expect(MENU).toContain(cls)
  })
})

describe('Alcance: nada de lo aplazado (45, 46)', () => {
  it('45. no se toca el editor de Invitaciones', () => {
    expect(INVITATIONS).not.toMatch(/EventMenu|event_menu_settings|PickIngredientsModal/)
    expect([MENU, DINERS, IMPORTER].join('\n')).not.toMatch(/Invitation/)
  })
  it('46. no hay impresión, PDF, compartir ni plantillas en el Menú del evento', () => {
    const text = [MENU, DINERS, IMPORTER].join('\n')
    expect(text).not.toMatch(/window\.print|openPrintReport|shareFiles|shareText|html2canvas|navigator\.share|jspdf|DOCUMENT_TEMPLATES|event_document_settings/)
  })
})

// ---------------------------------------------------------------------
// Orden del documento, tipos de elemento y revisión de la importación
// ---------------------------------------------------------------------
describe('Importador: fidelidad al documento antes que interpretación', () => {
  const PURPOSE = FILES['/supabase/functions/_shared/ai/purposes/eventFoodDocument.ts']
  it('el prompt exige el ORDEN original, prohíbe reordenar/agrupar y devuelve una lista plana (no agrupada por sección)', () => {
    expect(PURPOSE).toContain('devuelve los elementos EXACTAMENTE en el orden en que aparecen en el documento')
    expect(PURPOSE).toContain('NUNCA reordenes, agrupes por tipo ni muevas un elemento')
    expect(PURPOSE).toContain('No ordenes alfabéticamente ni por sección')
    expect(PURPOSE).toContain('La sección NO influye en el orden')
    expect(PURPOSE).toContain('{"items": [{"text"')
    expect(PURPOSE).not.toContain('Agrupa los platos en las secciones')
    expect(PURPOSE).not.toContain('"sections": [{')
  })
  it('el prompt conserva el texto con significado (encabezados, notas) y solo marca como prescindible lo claramente decorativo, devolviéndolo igualmente', () => {
    for (const text of ['kind "heading"', 'kind "note"', 'kind "skip"', 'Cambio de Tercio', 'nunca descartes texto con significado', 'Aun así devuélvelo, en su posición', 'NO elimines elementos repetidos']) expect(PURPOSE, text).toContain(text)
    expect(PURPOSE).toContain('NUNCA inventes platos, ingredientes, alérgenos, cantidades, raciones ni precios')
  })
  it('el servidor no deduplica ni reordena al interpretar la respuesta', () => {
    const parse = slice(PURPOSE, 'parseOutput(rawText)', '\n}\n')
    expect(parse).not.toMatch(/\.sort\(|\.reverse\(|\.some\(|new Set\(/)
  })
  it('la revisión muestra el orden original: la lista sale de proposal.items tal cual, sin agrupar por sección', () => {
    const handleFile = slice(IMPORTER, 'async function handleFile', 'function update(')
    expect(handleFile).toContain('proposal.items.map(')
    expect(handleFile).not.toMatch(/\.sort\(|groupBy|MENU_SECTIONS/)
  })
  it('14. cada fila ofrece incluir, texto, tipo, sección (solo platos) y orden (☰ y ▲▼)', () => {
    for (const text of ['aria-label={`Incluir', 'ariaLabel="Texto del elemento"', 'aria-label="Tipo"', 'aria-label="Sección"', 'className="drag-handle"', 'aria-label={`Subir', 'aria-label={`Bajar']) expect(IMPORTER, text).toContain(text)
    expect(IMPORTER).toContain("r.kind === 'dish' && !forcedSection")
  })
  it('28. los textos largos se LEEN completos en móvil: campo multilínea que crece, sin scroll horizontal ni input de una línea', () => {
    expect(IMPORTER).toContain('<AutoGrowTextarea value={r.text}')
    expect(IMPORTER).not.toMatch(/<input[^>]*type="text"[^>]*value=\{r\.text/)
    const grow = FILES['/src/ui/AutoGrowTextarea.tsx']
    expect(grow).toContain('el.style.height = `${el.scrollHeight}px`')
    expect(grow).toContain('rows={1}')
    expect(MENU).toContain('<AutoGrowTextarea value={name}')
  })
  it('19. con un menú ya existente se pregunta DÓNDE añadir lo nuevo y se avisa de que lo existente no se mueve', () => {
    expect(IMPORTER).toContain('Dónde añadirlo (lo que ya tienes no se mueve)')
    for (const text of ['Al final del menú', 'Al principio del menú', 'Después de «']) expect(IMPORTER, text).toContain(text)
    expect(IMPORTER).toContain("useState('end')")
    expect(MENU).toContain('existing={sequence.map((i) => ({ id: i.id, label: i.name }))}')
  })
  it('lo que se guarda sale del orden de la revisión: importRowsToSave filtra y no reordena', () => {
    const fn = slice(IMPORTER, 'export function importRowsToSave', '// «end» | «start»')
    expect(fn).toContain('.filter((r) => r.include && r.text.trim())')
    expect(fn).not.toMatch(/\.sort\(/)
  })
})

describe('Menú del evento: la secuencia es la vista principal; las secciones, clasificación', () => {
  it('«Orden del menú» es la vista por defecto y se puede cambiar a «Por secciones» (y se recuerda en el dispositivo)', () => {
    expect(MENU).toContain("localStorage.getItem(MENU_VIEW_KEY) === 'secciones' ? 'secciones' : 'secuencia'")
    expect(MENU).toContain('Orden del menú')
    expect(MENU).toContain('Por secciones')
  })
  it('la secuencia se ordena SOLO por la posición explícita y se reordena con ☰ / ▲▼ guardando el menú completo (RPC)', () => {
    expect(MENU).toContain('const sequence = useMemo(() => menuSequence(data.items), [data.items])')
    const commit = slice(MENU, 'async function commitOrder(', 'function moveItem(')
    expect(commit).toContain('reorderEventMenuItems(ids)')
  })
  it('5–8. guardar un plato editado NO toca la posición: un UPDATE de esa fila, sin sort_order', () => {
    const save = slice(MENU, 'async function saveDish(', 'async function commitOrder(')
    const update = slice(save, 'await updateEventMenuItem(', '} else {')
    expect(update).not.toContain('sortOrder')
    expect(update).not.toContain('sort_order')
    expect(save).not.toMatch(/\.sort\(/)
  })
  it('un elemento nuevo se coloca con una regla explícita (junto a su sección)', () => {
    const save = slice(MENU, 'async function saveDish(', 'async function commitOrder(')
    expect(save).toContain('placementForNewDish(')
    expect(save).toContain('placeNewIds(')
  })
  it('las secciones siguen siendo clasificación: la vista por secciones, la gestión de secciones y el menú infantil siguen ahí', () => {
    for (const text of ['Gestionar secciones', "view === 'secciones'", 'MENU_INFANTIL_SECTION_LABEL', 'Encabezados y notas']) expect(MENU, text).toContain(text)
  })
  it('un encabezado o nota no ofrece receta ni Compras: las herramientas exigen kind = dish', () => {
    expect(MENU).toContain('dishHasKitchenTools(mode, dish.preparedBy, dish.kind)')
    expect(FILES['/src/domain/eventMenuHub.ts']).toContain("return kind === 'dish' && dishOrigin(mode, preparedBy) === 'familia'")
  })
  it('31. event_menu_options sigue siendo otra cosa que event_menu_items (no se mezclan)', () => {
    expect(MENU).not.toMatch(/event_menu_options|listEventMenuOptions/)
    expect(DINERS).toContain('countMenuChoices(data.options, members, guests)')
  })
})

describe('Sección protegida: «Ocultar» se ve desactivado (22, 27)', () => {
  const sheet = slice(MENU, 'export function SectionsSheet(', '\n}\n')
  it('el botón va disabled + aria-disabled y con su explicación; la regla de protección no cambia', () => {
    expect(sheet).toContain('disabled={!canHide} aria-disabled={!canHide}')
    expect(sheet).toContain('muévelo o bórralo')
    expect(sheet).toContain('const canHide = canHideSection(view)')
  })
})
