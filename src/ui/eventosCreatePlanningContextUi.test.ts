import { describe, expect, it } from 'vitest'

// Eventos — alta MÍNIMA (corrección estructural posterior a "Comida y bebida"): CreateEventModal solo pide nombre,
// tipo y módulos; fecha, lugar, edad y servicios incluidos (antiguos pasos 1/2 del "inicio inteligente") viven
// ahora en el primer bloque del configurador. Se mantiene el selector de 14 módulos siempre visibles con los
// recomendados premarcados. No hay jsdom en este proyecto — se comprueba estructuralmente sobre el código fuente real,
// mismo patrón que el resto de tests de EventosScreen.tsx.
const SRC = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('CreateEventModal — alta MÍNIMA para todos los eventos (nombre, tipo, módulos)', () => {
  const fn = slice(SRC, 'function CreateEventModal(', '\n// Petición real: "reorganizar Eventos')

  it('A. pide el nombre del evento', () => {
    expect(fn).toContain('Nombre del evento')
    expect(fn).toContain("setError('Ponle un nombre al evento.')")
  })
  it('B. pide el tipo de evento (y la variante solo en «celebración», que identifica el tipo)', () => {
    expect(fn).toContain('<select value={type} onChange={(e) => handleTypeChange(e.target.value as EventType)}>')
    expect(fn).toContain("type === 'celebracion' && (")
  })
  it('C. permite elegir los módulos a organizar, con los recomendados premarcados', () => {
    expect(fn).toContain('¿Qué quieres organizar en PEPA?')
    expect(fn).toContain('<ModulePickerChips modules={modules} onChange={setModules} recommended={new Set(recommendedModules)} />')
  })
  it('D/E. NO pide fecha ni fecha fin', () => {
    expect(fn).not.toMatch(/type="date"/)
    expect(fn).not.toMatch(/DATE_STATUS|setDateStatus|setEventDate|Fecha provisional|Fecha fin/)
    // La fecha nace «Todavía no lo sabemos»: se decide después, en el configurador.
    expect(fn).toContain("dateStatus: 'pendiente'")
    expect(fn).toContain('eventDate: null')
  })
  it('F/G. NO pide lugar ni pregunta restaurante / casa', () => {
    expect(fn).not.toMatch(/¿Dónde se celebra|¿Dónde es la celebración|Prefiero no decirlo|casa_propia|restaurante_local|setVenueType|venueType/)
  })
  it('H. NO pregunta qué incluye el lugar ni ofrece el catálogo antiguo (fotógrafo, flores, música/DJ)', () => {
    expect(fn).not.toMatch(/¿Qué incluye ya|INCLUDABLE_SERVICES_BY_TYPE|EVENT_SERVICE_META|includedServices|setIncludedServices/)
  })
  it('I. un cumpleaños NO pide la edad en el alta', () => {
    expect(fn).not.toMatch(/ageTurning|¿Cuántos años cumple|setAgeTurning/)
    expect(fn).toContain('details: {}')
  })
  it('J. el evento puede crearse incompleto: el único dato obligatorio es el nombre', () => {
    const submit = slice(fn, 'async function handleSubmit', 'return (')
    expect(submit.match(/setError\(/g)?.length).toBe(3) // nombre vacío, limpiar antes de guardar y error al guardar
    expect(submit).not.toMatch(/eventDate\.trim|!eventDate|!ageTurning/)
  })
  it('una plantilla solo preconfigura la identidad (tipo, variante, tema, módulos): nunca fechas, lugares ni servicios', () => {
    const useTemplate = slice(fn, 'function handleUseTemplate', '\n  async function handleSubmit')
    for (const field of ['setType(t.type)', 'setTheme(t.theme)', 'setModules(t.enabledModules)']) expect(useTemplate).toContain(field)
    expect(useTemplate).not.toMatch(/venue|date|included|age/i)
  })
  it('cambiar de tipo recalcula los módulos recomendados', () => {
    const handleTypeChange = slice(fn, 'function handleTypeChange(next: EventType) {', '\n  }')
    expect(handleTypeChange).toContain('setModules(RECOMMENDED_MODULES[next])')
  })
})

describe('CreateEventModal — «¿Qué quieres organizar en PEPA?» (sustituye "Recomendado"/"Elegir yo")', () => {
  const fn = slice(SRC, 'function CreateEventModal(', '\n// Petición real: "reorganizar Eventos')

  it('ya no existe el toggle "Recomendado"/"Elegir yo" ni el estado moduleMode', () => {
    expect(fn).not.toContain('moduleMode')
    // El propio comentario que explica el cambio menciona el nombre del toggle antiguo a propósito —
    // se comprueba que no quede ningún botón real con ese texto, no que la cadena no aparezca nunca.
    expect(fn).not.toMatch(/>\s*Elegir yo\s*</)
  })

  it('los 14 módulos están SIEMPRE visibles — ModulePickerChips se renderiza sin ningún guard "{...&&(" delante', () => {
    const block = slice(fn, '¿Qué quieres organizar en PEPA?</strong>', '<ModulePickerChips')
    // Entre el título del paso 3 y el propio componente solo hay el párrafo "Pepa te recomienda..." —
    // ningún "{condición && (" sin cerrar que pudiera estar ocultando el picker.
    expect(block).not.toMatch(/\{[^}]*&&\s*\($/)
    expect(fn).toContain('<ModulePickerChips modules={modules} onChange={setModules} recommended={new Set(recommendedModules)} />')
  })

  it('el resumen "Pepa te recomienda N de 14 módulos para este evento" usa RECOMMENDED_MODULES[type], la misma fuente de siempre — no un sistema nuevo', () => {
    expect(fn).toContain('const recommendedModules = RECOMMENDED_MODULES[type]')
    // Retoque UX (2026-09-30): "para este evento", ya no "para este tipo de evento" — el contador sigue
    // siendo dinámico (recommendedModules.length / EVENT_MODULES.length).
    expect(fn).toContain('Pepa te recomienda {recommendedModules.length} de {EVENT_MODULES.length} módulos para este evento.')
  })

  it('el usuario puede marcar/desmarcar libremente: modules sigue siendo un array editable por ModulePickerChips, no un valor derivado de solo lectura', () => {
    expect(fn).toContain('const [modules, setModules] = useState<EventModuleKey[]>(RECOMMENDED_MODULES.cumpleanos)')
  })
})

describe('ModulePickerChips — marca visualmente los recomendados sin ocultar ni bloquear ninguno', () => {
  const fn = slice(SRC, 'function ModulePickerChips(', '\n\nconst EVENT_MODULE_KEYS')

  it('recibe un set opcional "recommended" — nunca cambia qué módulos se listan (siempre EVENT_MODULES completo)', () => {
    expect(fn).toContain('recommended?: Set<EventModuleKey>')
    expect(fn).toContain('{EVENT_MODULES.map((m) => {')
  })

  it('un módulo recomendado sigue siendo un chip normal, clicable, solo con una ✨ extra — nunca deshabilitado, nunca el texto "· Recomendado" (poco contraste sobre el chip seleccionado)', () => {
    expect(fn).not.toContain('disabled')
    expect(fn).not.toContain('Recomendado')
    expect(fn).toContain("const isRecommended = recommended?.has(m.key)")
    expect(fn).toContain("{isRecommended && ' ✨'}")
  })

  // Retoque UX (2026-09-30) — la ✨ depende SOLO de `recommended` (fijo, calculado del tipo de evento),
  // nunca de `checked` (lo que decide el usuario): desmarcar un recomendado no le quita la ✨, marcar uno
  // no recomendado nunca se la pone.
  it('la ✨ es independiente de `checked` — no hay ninguna condición que combine isRecommended con el estado de selección', () => {
    expect(fn).not.toMatch(/isRecommended\s*&&\s*checked/)
    expect(fn).not.toMatch(/checked\s*&&\s*isRecommended/)
  })
})

// Retoque UX (2026-09-30, tras validar en producción con un Cumpleaños real): "Organízamelo Pepa" gana
// una frase de contexto y filas compactas. La lógica de QUÉ propone/filtra ya quedó aprobada y no se
// toca — estos tests protegen que el retoque es puramente de presentación.
describe('OrganizamePepaModal — frase de contexto "Pepa ha tenido en cuenta..."', () => {
  const fn = slice(SRC, 'function OrganizamePepaModal(', "\n// ---------------------------------------------------------------------\n// Fase 4 — plantillas personales.")

  it('joinSpanishList reutiliza EVENT_SERVICE_META (el vocabulario de servicios) — nunca uno nuevo', () => {
    expect(SRC).toContain('function joinSpanishList(items: string[]): string {')
    expect(fn).toContain('includedServices.map((s) => EVENT_SERVICE_META[s].label.toLowerCase())')
  })

  it('la frase solo existe si includedServices tiene algo — un evento sin servicios incluidos no la muestra', () => {
    expect(fn).toContain('includedServices.length > 0 ? `Pepa ha tenido en cuenta que el lugar incluye')
    expect(fn).toContain('{includedServicesSentence && (')
  })

  it('los servicios salen de la ÚNICA fuente (decisión del primer bloque, con el alta antigua adoptada) y se leen antes de montar el modal', () => {
    expect(fn).toContain('venueServiceIdsForPlan(d, props.event.includedServices)')
    expect(fn).toContain('if (includedServices === null) return null')
  })

  it('es puramente informativa: se calcula DESPUÉS de generateEventPlan, a partir de includedServices — nunca como argumento que generateEventPlan pueda usar para decidir nada distinto', () => {
    const planCallIndex = fn.indexOf('generateEventPlan(event,')
    const sentenceIndex = fn.indexOf('const includedServicesSentence')
    expect(planCallIndex).toBeGreaterThan(-1)
    expect(sentenceIndex).toBeGreaterThan(planCallIndex)
    expect(fn).toContain('generateEventPlan(event, { venueType: event.venueType, includedServices })')
  })
})

describe('OrganizamePepaModal — filas compactas (checkbox + nombre en la misma línea)', () => {
  const fn = slice(SRC, 'function OrganizamePepaModal(', "\n// ---------------------------------------------------------------------\n// Fase 4 — plantillas personales.")

  it('las 5 filas de checklist (módulos, presupuesto, menú, decoración, actividades) fijan flexDirection:\'row\' — el <label> base de la app es column, así que sin esto el checkbox y el texto quedaban apilados', () => {
    const rows = [...fn.matchAll(/className="inline-fields" style=\{\{ alignItems: 'center', flexDirection: 'row' \}\}/g)]
    expect(rows.length).toBe(5)
  })

  it('el subtexto de Presupuesto ("Sin importe todavía") queda debajo del nombre, en la misma columna — no como una segunda columna aparte a lo ancho de la fila', () => {
    const budgetRow = slice(fn, "plan.budgetItems.map((b, i) => (", '))}')
    expect(budgetRow).toContain("<span style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>")
    expect(budgetRow).toContain('<span>{b.category}</span>')
    expect(budgetRow).toContain('Sin importe todavía')
  })

  it('no se ha tocado qué se propone ni cómo se filtra — solo el marcado JSX de presentación (mismo `plan`, mismos checked/unchecked por defecto)', () => {
    expect(fn).toContain('const [budgetChecked, setBudgetChecked] = useState(() => new Set(plan.budgetItems.map((_, i) => i)))')
    expect(fn).toContain('const [menuChecked, setMenuChecked] = useState(() => new Set(plan.menuItems.map((_, i) => i)))')
    expect(fn).toContain('const [decorationChecked, setDecorationChecked] = useState(() => new Set(plan.decorationItems.map((_, i) => i)))')
    expect(fn).toContain('const [activitiesChecked, setActivitiesChecked] = useState(() => new Set(plan.activities.map((_, i) => i)))')
  })
})
