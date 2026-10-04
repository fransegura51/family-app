// Candado de la pantalla del Plan del día editable (Fase 1). Sin jsdom: lee el código real como texto, mismo
// estilo que el resto de candados de Eventos. El comportamiento (orden, coincidencias, reconciliación) se prueba
// con datos en domain/eventDayPlan.test.ts y data/eventDayPlan.behavior.test.ts; aquí, la estructura de la UI.
import { describe, expect, it } from 'vitest'

const FILES = import.meta.glob(['/src/ui/EventDayPlan.tsx', '/src/ui/EventosScreen.tsx', '/src/ui/useDragReorder.ts', '/src/ui/InvitationDesigner.tsx', '/src/ui/AyudaScreen.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
const PLAN = FILES['/src/ui/EventDayPlan.tsx']
const SCREEN = FILES['/src/ui/EventosScreen.tsx']
const HOOK = FILES['/src/ui/useDragReorder.ts']
const INVITATIONS = FILES['/src/ui/InvitationDesigner.tsx']
const HELP = FILES['/src/ui/AyudaScreen.tsx']

function slice(source: string, start: string, end: string): string {
  const i = source.indexOf(start)
  expect(i, start).toBeGreaterThan(-1)
  const j = source.indexOf(end, i + start.length)
  expect(j, end).toBeGreaterThan(i)
  return source.slice(i, j)
}

describe('Estructura: dos zonas, tocar para editar', () => {
  it('la sección vive en su archivo y EventosScreen solo la monta (el marcador histórico del archivo se conserva)', () => {
    expect(SCREEN).toContain("import { DayPlanSection } from '@/ui/EventDayPlan'")
    expect(SCREEN).toContain("case 'plan_dia':")
    expect(SCREEN).not.toContain('function DayPlanSection(')
    expect(SCREEN).toContain('// Fase 3 — Plan del día')
  })
  it('hay una zona «Sin hora» propia y la lista con hora va primero', () => {
    expect(PLAN).toContain('Sin hora')
    expect(PLAN.indexOf('view.timed.map')).toBeLessThan(PLAN.indexOf('Sin hora'))
    expect(PLAN).toContain('splitDayPlan(items)')
  })
  it('tocar un momento lo edita (con hora y sin hora)', () => {
    expect((PLAN.match(/setEditing\(\{ mode: 'edit', item \}\)/g) ?? []).length).toBe(3) // fila con hora, fila sin hora y «Cambiar hora» del aviso de coincidencia
  })
  it('hay «+ Añadir momento»', () => {
    expect(PLAN).toContain('+ Añadir momento')
  })
})

describe('Formulario de edición (3, 4, 5, 6, 19, 21)', () => {
  const sheet = slice(PLAN, 'function DayPlanEditSheet(', '// × sobre un momento que viene de')
  it('campos: Nombre, 🕐 Hora (opcional) con etiqueta visible, Nota y «Mostrar al compartir»', () => {
    for (const text of ['Nombre', '🕐 Hora (opcional)', 'Nota (opcional)', 'Mostrar al compartir']) expect(sheet, text).toContain(text)
    expect(sheet).toContain('type="time"')
    expect(sheet).toContain('type="checkbox"')
    expect(sheet).toContain('<textarea')
  })
  it('la hora no es obligatoria y se puede quitar (nunca 00:00 por defecto)', () => {
    expect(sheet).not.toMatch(/required/)
    expect(sheet).not.toMatch(/'00:00'/)
    expect(sheet).toContain('Quitar la hora')
  })
  it('un momento nuevo nace visible al compartir; no hay casilla desmarcada de partida', () => {
    expect(sheet).toContain('EMPTY_DAY_PLAN_DRAFT')
    expect(PLAN).toContain('draft.showOnShare')
  })
  it('guardar es UNA operación sobre ESA fila: updateEventDayPlanItem(id, patch) o addEventDayPlanItem, nunca borrar+crear', () => {
    const save = slice(PLAN, 'async function saveItem(', 'async function removeManual(')
    expect((save.match(/updateEventDayPlanItem\(/g) ?? []).length).toBe(1)
    expect((save.match(/addEventDayPlanItem\(/g) ?? []).length).toBe(1)
    expect(save).not.toContain('deleteEventDayPlanItem')
    expect(save).toContain('draftToPatch(draft, target.item)')
  })
  it('para un generado explica que sigue enlazado', () => {
    expect(sheet).toContain('seguirá enlazado a su momento')
  })
})

describe('Reordenar «Sin hora»: arrastrar con asa Y alternativa accesible (9)', () => {
  it('asa ☰ con eventos de puntero (táctil + ratón), sin dependencias nuevas', () => {
    expect(HOOK).toContain('onPointerDown')
    expect(HOOK).toContain('setPointerCapture')
    expect(HOOK).toContain('onPointerCancel')
    expect(HOOK).not.toMatch(/draggable|dragstart|react-dnd|dnd-kit/i)
    expect(PLAN).toContain('className="drag-handle"')
    expect(PLAN).toContain('{...drag.handleProps(id)}')
  })
  it('el asa tiene touch-action: none (si no, en iPhone/Android el arrastre se confunde con hacer scroll)', () => {
    // (styles.css no se puede leer como texto en este entorno: ver calendarCategoryFormFixUi.test.ts; por eso va también en línea)
    expect(PLAN).toContain("style={{ touchAction: 'none' }}")
  })
  it('Subir y Bajar con etiqueta accesible, deshabilitados en los extremos', () => {
    expect(PLAN).toContain('aria-label={`Subir ${item.title}`}')
    expect(PLAN).toContain('aria-label={`Bajar ${item.title}`}')
    expect(PLAN).toContain('disabled={index === 0}')
    expect(PLAN).toContain('disabled={index === untimedOrder.length - 1}')
  })
  it('arrastrar y Subir/Bajar guardan por el MISMO camino atómico (RPC), no con varias escrituras sueltas', () => {
    expect(PLAN).toContain('useDragReorder(untimedIds, (ids) => void commitUntimedOrder(ids))')
    const commit = slice(PLAN, 'async function commitUntimedOrder(', 'function moveUntimed(')
    expect(commit).toContain('await reorderEventDayPlan(ids)')
  })
  it('solo las filas SIN hora se arrastran: las que tienen hora se colocan solas', () => {
    const timed = slice(PLAN, 'view.timed.map', 'untimedOrder.length > 0')
    expect(timed).not.toContain('drag-handle')
    expect(timed).not.toContain('Subir')
  })
})

describe('Coincidencias de hora (10, 11, 12, 15, 17, 18)', () => {
  const dialog = slice(PLAN, 'function CoincidenceDialog(', '\n}\n')
  it('tras guardar una hora se comprueba el grupo de ESE elemento y se pregunta una vez (grupo completo)', () => {
    const save = slice(PLAN, 'async function saveItem(', 'async function removeManual(')
    expect(save).toContain('pendingCoincidenceFor(fresh, itemId)')
    expect(save).toContain("setCoincidence({ time: group.time, step: 'ask' })")
  })
  it('textos pedidos: titular con el número, pregunta y las dos opciones', () => {
    expect(dialog).toContain('{coincidenceHeadline(group)}')
    expect(dialog).toContain('¿Es correcto que sean a la misma hora?')
    expect(dialog).toContain('Sí, coinciden')
    expect(dialog).toContain('No, quiero cambiar una hora')
  })
  it('«Sí, coinciden» pregunta cuál va primero y permite ordenar el grupo entero; guarda con confirmación', () => {
    expect(dialog).toContain('¿Cuál quieres que aparezca primero en el Plan del día?')
    expect(dialog).toContain('Subir ${byId.get(id)?.title}')
    expect(PLAN).toContain('await reorderEventDayPlan(ids, true)')
  })
  it('«No, quiero cambiar una hora» muestra directamente los implicados con [Cambiar hora], sin cadena de formularios', () => {
    expect(dialog).toContain('Cambiar hora')
    expect(dialog).toContain('{i.title} — {group.time}')
    expect(PLAN).toContain('onEditItem={(item) => setEditing({ mode: \'edit\', item })}')
  })
  it('se puede cerrar sin decidir: no escribe nada y queda un aviso discreto en la lista', () => {
    expect(dialog).toContain('Decidirlo más tarde')
    expect(PLAN).toContain('↳ Misma hora · ¿coinciden?')
  })
  it('una coincidencia confirmada se ve discreta («↳ Coinciden») y deja reabrir el orden', () => {
    expect(PLAN).toContain('↳ Coinciden · cambiar orden')
  })
  it('el aviso se cierra solo si el grupo deja de existir (p. ej. tras cambiar una hora)', () => {
    expect(PLAN).toContain('if (coincidence && !activeGroup) setCoincidence(null)')
  })
})

describe('× y borrado (11, 12, 22–26)', () => {
  const remove = slice(PLAN, 'function removeButton(', 'function itemLabel(')
  it('un manual se borra con el patrón de PEPA: doble toque de confirmación', () => {
    expect(remove).toContain('<ConfirmIconButton')
    expect(remove).toContain('void removeManual(item)')
  })
  it('un generado NO se borra directamente: abre el diálogo que explica la relación', () => {
    expect(remove).toContain('isLinkedGenerated(item)')
    expect(remove).toContain('setRemoving(item)')
    expect(remove.indexOf('setRemoving(item)')).toBeLessThan(remove.indexOf('ConfirmIconButton'))
  })
  it('el diálogo ofrece exactamente tres salidas con el texto pedido', () => {
    const dialog = slice(PLAN, 'function RemoveGeneratedDialog(', '// Varios momentos a la misma hora')
    expect(dialog).toContain('Este momento viene de «Comida y bebida». ¿Qué quieres hacer?')
    for (const text of ['Quitar de ambos', 'Mantener como independiente', 'Cancelar']) expect(dialog, text).toContain(text)
    expect(dialog).toContain("onChoose('both')")
    expect(dialog).toContain("onChoose('independent')")
  })
  it('cada salida llama a la función de datos que también actualiza la decisión', () => {
    const resolve = slice(PLAN, 'async function resolveGenerated(', 'async function confirmOrder(')
    expect(resolve).toContain('resolveGeneratedDayPlanItem(item, mode)')
    expect(resolve).not.toContain('deleteEventDayPlanItem')
  })
})

describe('Visibilidad y marcas en la lista', () => {
  it('un momento oculto al compartir lo dice discretamente; la nota se muestra', () => {
    expect(PLAN).toContain('solo para vosotros')
    expect(PLAN).toContain('{item.note && <span className="dayplan-note">{item.note}</span>}')
  })
  it('un generado lleva una marca discreta de su origen', () => {
    expect(PLAN).toContain('Viene de Comida y bebida')
  })
})

describe('Alcance de la Fase 1: nada de Fase 2 ni de Invitaciones (40)', () => {
  it('no hay impresión, PDF, compartir, plantillas ni enlace público en el Plan del día', () => {
    expect(PLAN).not.toMatch(/window\.print|openPrintReport|shareFiles|shareText|html2canvas|navigator\.share|jspdf|DOCUMENT_TEMPLATES|event_document_settings|day_plan_token/)
  })
  it('no toca el editor de Invitaciones ni importa nada de él', () => {
    expect(PLAN).not.toMatch(/Invitation/)
    expect(INVITATIONS).not.toMatch(/dayPlan|DayPlan|event_day_plan/)
  })
  it('la Ayuda describe el Plan del día editable', () => {
    for (const text of ['Plan del día', 'Sin hora', 'Mostrar al compartir', 'Quitar de ambos']) expect(HELP, text).toContain(text)
  })
})

// ---------------------------------------------------------------------
// Volver a marcar un momento con un independiente recuperable: se pregunta ANTES de guardar
// ---------------------------------------------------------------------
const SCREEN_SRC = SCREEN
const RECOVER = (import.meta.glob('/src/ui/RecoverMomentDialog.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/RecoverMomentDialog.tsx']

describe('Recuperar un independiente: pregunta antes de persistir (Comida y bebida)', () => {
  const saveFood = slice(SCREEN_SRC, 'async function saveFood(', 'function reloadMenu()')
  it('la pregunta se calcula ANTES de guardar la selección: cancelar no deja la decisión marcada', () => {
    expect(saveFood.indexOf('momentRecoveryPrompt(')).toBeGreaterThan(-1)
    expect(saveFood.indexOf('momentRecoveryPrompt(')).toBeLessThan(saveFood.indexOf('upsertEventDecision('))
    expect(saveFood.indexOf('setRecovery({ prompt')).toBeLessThan(saveFood.indexOf('upsertEventDecision('))
    // y al abrir el diálogo se sale sin guardar
    expect(saveFood).toMatch(/setRecovery\(\{ prompt, answer[^\n]*\n\s*return/)
  })
  it('solo se pregunta al marcar momentos, si el Plan del día está activo y no si ya hay una elección', () => {
    expect(saveFood).toContain('questionKey === FOOD_MOMENTOS_KEY && !resolution && event.enabledModules.includes(\'plan_dia\')')
  })
  it('las tres salidas: recuperar (con el id elegido), crear nuevo (forzado) y cancelar (no guarda nada)', () => {
    expect(SCREEN_SRC).toContain('{ adopt: { [pending.prompt.key]: itemId } }')
    expect(SCREEN_SRC).toContain('{ forceCreate: [pending.prompt.key] }')
    expect(SCREEN_SRC).toContain('onCancel={() => setRecovery(null)}')
    // cancelar no llama a saveFood
    expect(slice(SCREEN_SRC, 'onCancel={() => setRecovery(null)}', 'onRecover=')).not.toContain('saveFood')
  })
  it('la elección llega hasta la reconciliación del Plan del día', () => {
    expect(saveFood).toContain('desiredDayPlanMoments(event.type, nextCtx), resolution)')
  })
  it('textos pedidos: un candidato → recuperar / crear / cancelar; varios → elegir cuál', () => {
    for (const text of ['Ya hay un momento que anteriormente estaba vinculado a', '¿Qué quieres hacer?', 'Recuperar el vínculo con', 'Crear un nuevo momento', 'Cancelar', 'Hay varios momentos que anteriormente estuvieron vinculados a', '¿Cuál quieres recuperar?']) expect(RECOVER, text).toContain(text)
    expect(RECOVER).toContain("timeKey(item.itemTime) ?? 'Sin hora'")
  })
  it('doble toque: mientras se resuelve, los botones se bloquean', () => {
    expect(RECOVER).toContain('if (busy) return')
    expect((RECOVER.match(/disabled=\{busy\}/g) ?? []).length).toBeGreaterThanOrEqual(4)
  })
  it('«Mantener como independiente» explica que PEPA recordará de dónde venía y preguntará', () => {
    expect(PLAN).toContain('te preguntará si quieres recuperar el vínculo')
  })
})
