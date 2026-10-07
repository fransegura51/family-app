import { describe, expect, it } from 'vitest'

// Fase 1.1/1.2 (plan de pendientes) — resumen general del configurador ("✓ N decisiones tomadas · M
// pendientes", una línea por sección con pendientes, "Secciones sin empezar: N" agrupadas) + navegación:
// cada línea abre la sección y aísla la pregunta correspondiente en el bloque real (ver
// useConfiguratorQuestionFocus.ts). Todo deriva de computeConfiguratorSummary (puro, ver
// eventConfiguratorSummary.test.ts) — aquí solo se comprueba el cableado real contra la UI.
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const CONFIGURATOR = window_(UI, 'function EventPlanningConfigurator(', '\nfunction ConfiguratorSummaryPanel(')
const SUMMARY_PANEL = window_(UI, 'function ConfiguratorSummaryPanel(', '\nfunction CelebracionBlock(')

describe('EventPlanningConfigurator — resumen general: visible aunque el configurador esté plegado', () => {
  it('ConfiguratorSummaryPanel se renderiza FUERA del {open && (...)} del acordeón principal', () => {
    const panelIdx = CONFIGURATOR.indexOf('<ConfiguratorSummaryPanel')
    const openBlockIdx = CONFIGURATOR.indexOf('{open && (')
    expect(panelIdx).toBeGreaterThan(-1)
    expect(openBlockIdx).toBeGreaterThan(-1)
    expect(panelIdx).toBeLessThan(openBlockIdx)
  })

  it('la lista agregada usa TODOS los list*BlockQuestions reales, nunca un cálculo nuevo', () => {
    expect(CONFIGURATOR).toContain('listCelebrationQuestions({ event, decisions, hasMomentLocation, structuredByMoments })')
    expect(CONFIGURATOR).toContain('listGuestsBlockQuestions(decisions, momentsCount)')
    expect(CONFIGURATOR).toContain('listMomentosEspecialesBlockQuestions(decisions)')
    expect(CONFIGURATOR).toContain('listFoodBlockQuestions(foodCtx)')
  })

  it('"La pareja" solo entra en el agregado para bodas, y usa mergeTipoResolucionPairs (nunca una fila duplicada por tipo+resolución)', () => {
    const idx = CONFIGURATOR.indexOf("event.type === 'boda'\n            ? mergeTipoResolucionPairs(listPairBlockQuestions(event, decisions))")
    expect(idx).toBeGreaterThan(-1)
  })

  it('el resumen se recarga tras CUALQUIER guardado de cualquier bloque (bumpRefresh vía handleChanged/handleDerivedDataChanged), nunca los callbacks originales sin envolver', () => {
    expect(CONFIGURATOR).toContain('function bumpRefresh() {')
    expect(CONFIGURATOR).toContain('const handleChanged = () => {\n    bumpRefresh()\n    onChanged()\n  }')
    expect(CONFIGURATOR).toContain('const handleDerivedDataChanged = () => {\n    bumpRefresh()\n    onDerivedDataChanged()\n  }')
    // Los 5 bloques reciben los wrappers, no las props crudas del padre.
    expect(CONFIGURATOR).toContain('onChanged={handleChanged} onDerivedDataChanged={handleDerivedDataChanged} focusRequest={focusRequestFor(\'celebracion\')}')
    expect(CONFIGURATOR).toContain("onChanged={handleChanged} onDerivedDataChanged={handleDerivedDataChanged} focusRequest={focusRequestFor('pareja')}")
    expect(CONFIGURATOR).toContain("onChanged={handleChanged} onDerivedDataChanged={handleDerivedDataChanged} focusRequest={focusRequestFor('invitados')}")
    expect(CONFIGURATOR).toContain("onDerivedDataChanged={handleDerivedDataChanged} focusRequest={focusRequestFor('momentos_especiales')}")
    expect(CONFIGURATOR).toContain("onDerivedDataChanged={handleDerivedDataChanged} onOpenMenu={onOpenMenu} focusRequest={focusRequestFor('comida')}")
  })
})

describe('navegación — abre la sección (y, si aplica, aísla la pregunta) al pulsar una línea del resumen', () => {
  it('navigateToQuestion abre el acordeón global y el de la sección si estaban plegados, y fija un focusRequest con token incremental', () => {
    const fn = window_(CONFIGURATOR, 'function navigateToQuestion(', '\n  }')
    expect(fn).toContain('openSection(sectionKey)')
    expect(fn).toContain('const token = focusToken + 1')
    expect(fn).toContain('setPendingFocus({ sectionKey, questionKey, token })')
  })
  it('un token distinto por cada clic permite volver a enfocar la MISMA pregunta aunque ya estuviera enfocada (ver stepConfiguratorFocus)', () => {
    expect(CONFIGURATOR).toContain('const [focusToken, setFocusToken] = useState(0)')
  })
  it('"Secciones sin empezar" usa openSection (sin aislar ninguna pregunta) — nada que fusionar, no hay nada "ya empezado" que enfocar', () => {
    expect(SUMMARY_PANEL).toContain('onClick={() => onOpenSection(summary.notStartedSections[0].sectionKey)}')
  })
  it('cada sección con pendientes navega a su PRIMERA pregunta pendiente (firstPendingKey, ya calculado por computeConfiguratorSummary)', () => {
    expect(SUMMARY_PANEL).toContain('onClick={() => onNavigate(s.sectionKey, s.firstPendingKey)}')
  })
})

describe('ConfiguratorSummaryPanel — formato compacto, oculto cuando no hay nada que mostrar', () => {
  it('no pinta nada si no hay decisiones ni pendientes ni secciones sin empezar (evento recién creado)', () => {
    expect(SUMMARY_PANEL).toContain('if (total === 0 && summary.notStartedSections.length === 0) return null')
  })
  it('la cabecera agregada muestra tomadas y pendientes juntas, en el formato pedido', () => {
    expect(SUMMARY_PANEL).toContain('✓ {summary.decidedCount} decisión')
    expect(SUMMARY_PANEL).toContain('tomada')
    expect(SUMMARY_PANEL).toContain("pendiente")
  })
})
