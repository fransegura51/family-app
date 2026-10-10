import { describe, expect, it } from 'vitest'

// PEPA Eventos — orden de recuperación de requisitos, EVT-001/EVT-002: "si el lugar incluye música/
// decoración, el configurador debe reflejarlo automáticamente, evitando preguntas, tareas y gastos
// duplicados". El código de venueIncludesService() ya hacía esto bien — el bug real (detectado por el
// usuario con una captura de pantalla: "Cómo vais a organizar la música" seguía saliendo entera aunque
// "Música" estuviera marcada como incluida en el lugar) era que MusicaFiestaBlock y OtrosDecoracionBlock
// filtraban su propio `decisions` a solo su block_key, dejando fuera la decisión 'lugar_servicios' de la
// que depende venueIncludesService — exactamente el mismo patrón que SÍ funciona en ComidaBebidaBlock
// (que nunca filtra). Este test evita que el filtro vuelva a colarse.
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const MUSICA_BLOCK = window_(UI, 'function MusicaFiestaBlock({', '\nfunction MusicaCatalogQuestion(')
const DECORACION_BLOCK = window_(UI, 'function OtrosDecoracionBlock({', '\nfunction ComidaBebidaBlock(')

describe('MusicaFiestaBlock — el "lugar incluye música" (EVT-001) tiene que poder verse: nunca filtrar las decisiones a solo este bloque', () => {
  it('reload() guarda TODAS las decisiones del evento, no solo las de musica_fiesta', () => {
    expect(MUSICA_BLOCK).toContain('setDecisions(d)')
    expect(MUSICA_BLOCK).not.toMatch(/setDecisions\(d\.filter/)
  })
  it('venueHasMusic sigue calculándose con venueIncludesService, ahora con datos completos', () => {
    expect(MUSICA_BLOCK).toContain("venueIncludesService(venueCase, decisions, 'musica'")
  })
})

describe('OtrosDecoracionBlock — el "lugar incluye decoración" (EVT-002) tiene el mismo bug corregido', () => {
  it('reload() guarda TODAS las decisiones del evento, no solo las de otros_decoracion', () => {
    expect(DECORACION_BLOCK).toContain('setDecisions(d)')
    expect(DECORACION_BLOCK).not.toMatch(/setDecisions\(d\.filter/)
  })
  it('venueHasDecoracion sigue calculándose con venueIncludesService, ahora con datos completos', () => {
    expect(DECORACION_BLOCK).toContain("venueIncludesService(venueCase, decisions, 'decoracion'")
  })
})
