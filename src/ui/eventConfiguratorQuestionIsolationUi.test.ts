import { describe, expect, it } from 'vitest'

// Fase 1.2 (plan de pendientes) — cada uno de los 5 bloques del configurador acepta un `focusRequest`
// (ver useConfiguratorQuestionFocus.ts) y, mientras hay una pregunta enfocada, pliega las demás y ofrece
// "Ver todas las preguntas" para volver. Comprobación estructural por bloque: cada uno usa el hook, conecta
// su ref, pasa onSelect a su propio "Resumen de decisiones" y respeta questionIsVisible en sus preguntas.
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const MOMENTOS = window_(UI, 'function MomentosEspecialesBlock(', '\n// ---------------------------------------------------------------------\n// Fase 2 — Momentos genéricos')
const GUESTS = window_(UI, 'function GuestsDecisionsBlock(', '\n// Mismo patrón exacto que ComplementosQuestion')
const COMIDA = window_(UI, 'function ComidaBebidaBlock(', '\n// ---------------------------------------------------------------------\n// Fase 2 — Momentos genéricos (event_moments')
const CELEBRACION = window_(UI, 'function CelebracionBlock(', '\n// Corrección real (siguiente mejora tras validar la persistencia de ubicación)')
const PAIR = window_(UI, 'function PairBlock(', '\n// Cierre de coste reutilizable')

describe.each([
  ['MomentosEspecialesBlock', () => MOMENTOS],
  ['GuestsDecisionsBlock', () => GUESTS],
  ['ComidaBebidaBlock', () => COMIDA],
  ['CelebracionBlock', () => CELEBRACION],
  ['PairBlock', () => PAIR],
])('%s — acepta focusRequest y ofrece "Ver todas las preguntas"', (_name, getBlock) => {
  it('usa useConfiguratorQuestionFocus y conecta su ref al contenedor', () => {
    const block = getBlock()
    expect(block).toContain('useConfiguratorQuestionFocus(focusRequest)')
    expect(block).toContain('ref={focusRef}')
  })
  it('su "Resumen de decisiones" recibe onSelect={setLocalFocus} — cada entrada ya es un enlace a su pregunta', () => {
    const block = getBlock()
    expect(block).toContain('onSelect={setLocalFocus}')
  })
  it('"Ver todas las preguntas" solo se ofrece cuando hay un foco activo', () => {
    const block = getBlock()
    expect(block).toContain('{localFocus && (')
    expect(block).toContain('Ver todas las preguntas')
  })
})

describe('MomentosEspecialesBlock — cada pregunta respeta questionIsVisible', () => {
  it('la selección de momentos y clases de baile se pliegan cuando hay otra pregunta enfocada', () => {
    expect(MOMENTOS).toContain('questionIsVisible(localFocus, MOMENTOS_ESPECIALES_QUESTION_KEY)')
    expect(MOMENTOS).toContain('questionIsVisible(localFocus, CLASES_BAILE_QUESTION_KEY)')
  })
})

describe('GuestsDecisionsBlock — las 5 preguntas (+ necesidades de niños) respetan questionIsVisible', () => {
  it('lista, preguntas a invitados, momentos, niños, necesidades e invitación', () => {
    expect(GUESTS).toContain('questionIsVisible(localFocus, GUESTS_LISTA_QUESTION_KEY)')
    expect(GUESTS).toContain('questionIsVisible(localFocus, GUESTS_PREGUNTAS_QUESTION_KEY)')
    expect(GUESTS).toContain('questionIsVisible(localFocus, GUESTS_MOMENTOS_QUESTION_KEY)')
    expect(GUESTS).toContain('questionIsVisible(localFocus, GUESTS_NINOS_QUESTION_KEY)')
    expect(GUESTS).toContain('questionIsVisible(localFocus, GUESTS_NINOS_NECESIDADES_QUESTION_KEY)')
    expect(GUESTS).toContain('questionIsVisible(localFocus, GUESTS_INVITACION_QUESTION_KEY)')
  })
})

describe('ComidaBebidaBlock — las preguntas propias (nunca la info heredada del lugar) respetan questionIsVisible', () => {
  it('quién, contratación, momentos, estado del menú, menú infantil, tarta, bebidas y necesidades', () => {
    for (const key of ['FOOD_QUIEN_KEY', 'FOOD_CONTRATACION_KEY', 'FOOD_MOMENTOS_KEY', 'FOOD_MENU_ESTADO_KEY', 'FOOD_MENU_INFANTIL_KEY', 'FOOD_TARTA_KEY', 'FOOD_BEBIDAS_KEY', 'FOOD_NECESIDADES_KEY']) {
      expect(COMIDA).toContain(`questionIsVisible(localFocus, ${key})`)
    }
  })
  it('la información heredada del lugar (A) y la elección de menú de invitados (G) NUNCA se ocultan — no son preguntas propias de este bloque', () => {
    const inheritedBlock = window_(COMIDA, '{/* A) Lo que ya sabemos del lugar', '{/* B) Quién se encarga')
    expect(inheritedBlock).not.toContain('questionIsVisible')
  })
})

describe('CelebracionBlock — edad/fecha/lugar/servicios respetan questionIsVisible (claves sin blockKey propio, ver CelebrationQuestionInfo)', () => {
  it('las 4 claves reales de listCelebrationQuestions', () => {
    expect(CELEBRACION).toContain("questionIsVisible(localFocus, 'edad')")
    expect(CELEBRACION).toContain("questionIsVisible(localFocus, 'fecha')")
    expect(CELEBRACION).toContain("questionIsVisible(localFocus, 'lugar')")
    expect(CELEBRACION).toContain("questionIsVisible(localFocus, 'servicios')")
  })
})

describe('PairBlock — matches() cubre tipo+resolución combinados (Vestuario/Peluquería/Detalle especial ya son un único componente)', () => {
  it('usa un helper local matches(...) en vez de questionIsVisible directo, porque varias claves deben mostrar el MISMO componente', () => {
    const fn = window_(PAIR, 'function matches(', '\n  }')
    expect(fn).toContain('!localFocus || keys.includes(localFocus)')
  })
  it('Vestuario/Peluquería se muestran si el foco es su tipo O su resolución (el componente ya renderiza las dos)', () => {
    expect(PAIR).toContain('matches(vestuarioKey, `${vestuarioKey}.resolucion`)')
    expect(PAIR).toContain('matches(peluqueriaKey, `${peluqueriaKey}.resolucion`)')
  })
  it('Alianzas y Detalle especial (bloque "Los dos") también respetan el foco, cada uno por separado dentro del mismo contenedor', () => {
    expect(PAIR).toContain('matches(ALIANZAS_QUESTION_KEY, DETALLE_ESPECIAL_QUESTION_KEY, DETALLE_ESPECIAL_RESOLUCION_QUESTION_KEY)')
    expect(PAIR).toContain('matches(ALIANZAS_QUESTION_KEY)')
    expect(PAIR).toContain('matches(DETALLE_ESPECIAL_QUESTION_KEY, DETALLE_ESPECIAL_RESOLUCION_QUESTION_KEY)')
  })
  it('los ítems florales se filtran uno a uno por su propia clave — enfocar "Ramo" nunca muestra también "Prendido"', () => {
    expect(PAIR).toContain('.filter((item) => matches(pairQuestionKey(slot, `floral.${item.key}`)))')
  })
})
