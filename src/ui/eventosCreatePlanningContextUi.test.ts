import { describe, expect, it } from 'vitest'

// Eventos — Fase 1 del "inicio inteligente" (2026-09-30): el alta de CreateEventModal gana un paso 1
// ("¿Dónde se celebra?"), un paso 2 condicional ("¿Qué incluye ya?") y sustituye el antiguo toggle
// "Recomendado"/"Elegir yo" por un único paso 3 con los 14 módulos siempre visibles, los recomendados
// premarcados. No hay jsdom en este proyecto — se comprueba estructuralmente sobre el código fuente real,
// mismo patrón que el resto de tests de EventosScreen.tsx.
const SRC = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('CreateEventModal — paso 1 "¿Dónde se celebra?"', () => {
  const fn = slice(SRC, 'function CreateEventModal(', '\n// Petición real: "reorganizar Eventos')

  it('la pregunta cambia de texto en los tipos con doble ubicación (boda/comunión/bautizo) — nunca pregunta por la ceremonia', () => {
    expect(fn).toContain("DUAL_LOCATION_EVENT_TYPES.includes(type) ? '¿Dónde es la celebración (después de la ceremonia)?' : '¿Dónde se celebra?'")
  })

  it('las 3 opciones no presuponen nada por defecto — arranca sin responder', () => {
    expect(fn).toContain("const [venueType, setVenueType] = useState<EventVenueType | ''>('')")
    expect(fn).toContain('<option value="">Prefiero no decirlo ahora</option>')
    expect(fn).toContain('<option value="restaurante_local">Restaurante/local con servicios incluidos</option>')
    expect(fn).toContain('<option value="casa_propia">Casa o espacio propio, lo organizamos nosotros</option>')
    expect(fn).toContain('<option value="otro">Otro</option>')
  })
})

describe('CreateEventModal — paso 2 "¿Qué incluye ya?" (solo cuando el paso 1 dice explícitamente que hay servicios)', () => {
  const fn = slice(SRC, 'function CreateEventModal(', '\n// Petición real: "reorganizar Eventos')

  it('el checklist SOLO se muestra si venueType === "restaurante_local" — nunca para "casa_propia" ni "otro"', () => {
    expect(fn).toContain("const showIncludedServicesStep = venueType === 'restaurante_local' && includableServices.length > 0")
    expect(fn).toContain('{showIncludedServicesStep && (')
  })

  it('las opciones del checklist salen de INCLUDABLE_SERVICES_BY_TYPE (nunca una lista hardcodeada aparte)', () => {
    expect(fn).toContain('const includableServices = INCLUDABLE_SERVICES_BY_TYPE[type]')
    expect(fn).toContain('{includableServices.map((s) => {')
    expect(fn).toContain('{EVENT_SERVICE_META[s].label}')
  })

  it('cambiar de tipo limpia los servicios marcados — el checklist de un tipo anterior podría ya no significar nada', () => {
    const handleTypeChange = slice(fn, 'function handleTypeChange(next: EventType) {', '\n  }')
    expect(handleTypeChange).toContain('setModules(RECOMMENDED_MODULES[next])')
    expect(handleTypeChange).toContain('setIncludedServices([])')
  })

  it('al guardar, includedServices solo se envía si el paso 2 estaba activo y algo quedó marcado — nunca un array vacío o de un paso que no se llegó a ver', () => {
    expect(fn).toContain('includedServices: showIncludedServicesStep && includedServices.length > 0 ? includedServices : null')
    expect(fn).toContain('venueType: venueType || null')
  })
})

describe('CreateEventModal — paso 3 "¿Qué quieres organizar en PEPA?" (sustituye "Recomendado"/"Elegir yo")', () => {
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

  it('el resumen "Pepa te recomienda N de 14 módulos" usa RECOMMENDED_MODULES[type], la misma fuente de siempre — no un sistema nuevo', () => {
    expect(fn).toContain('const recommendedModules = RECOMMENDED_MODULES[type]')
    expect(fn).toContain('Pepa te recomienda {recommendedModules.length} de {EVENT_MODULES.length} módulos')
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

  it('un módulo recomendado sigue siendo un chip normal, clicable, solo con una etiqueta extra — nunca deshabilitado', () => {
    expect(fn).not.toContain('disabled')
    expect(fn).toContain("const isRecommended = recommended?.has(m.key)")
    expect(fn).toContain('{isRecommended && <span className="muted"> · Recomendado</span>}')
  })
})
