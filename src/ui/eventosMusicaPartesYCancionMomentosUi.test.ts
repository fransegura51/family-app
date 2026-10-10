import { describe, expect, it } from 'vitest'

// PEPA Eventos — orden de recuperación de requisitos:
// Parte G3: la canción ya no es exclusiva de "Primer baile" — se generaliza a todos los momentos de
// MOMENTOS_CON_CANCION.
// Parte G2 (aclaración directa del usuario tras detectar el conflicto con "muy breve a propósito"): se
// puede indicar, de forma opcional y compacta, en qué partes del evento habrá DJ/música en directo —
// SIN horarios ni plan de actuación del DJ, sin generar tarea/presupuesto.
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('Parte G3 — canción generalizada a todos los momentos que puedan llevar música', () => {
  it('ya no existe el componente/función "...PrimerBaile..." hardcodeado — se generalizó a "...Momento..."', () => {
    expect(UI).not.toContain('CancionPrimerBaileQuestion')
    expect(UI).not.toContain('saveCancionPrimerBaile')
    expect(UI).not.toContain('CANCION_PRIMER_BAILE_OPTIONS')
  })

  it('el render recorre MOMENTOS_CON_CANCION filtrando por selección, no un único momento fijo', () => {
    const loop = window_(UI, 'MOMENTOS_CON_CANCION.filter((momento) => seleccion?.selected.includes(momento)).map((momento) => {', '})}')
    expect(loop).toContain('cancionQuestionKey(momento)')
    expect(loop).toContain('MOMENTO_ESPECIAL_LABELS[momento]')
    expect(loop).toContain('onSave={(a) => saveCancionMomento(momento, a)}')
  })

  it('saveCancionMomento nunca borra la decisión al desmarcar — solo saveSeleccion toca el borrado de clases de baile', () => {
    const fn = window_(UI, 'async function saveCancionMomento(momento: MomentoEspecialKey, answer: CancionMomentoAnswer) {', '\n  if (loading) return null')
    expect(fn).not.toContain('deleteEventDecision')
  })
})

describe('Parte G2 — música por partes del evento (Ceremonia/Cóctel/Comida/Baile/Fiesta), opcional y sin horarios', () => {
  it('el bloque solo se muestra cuando han elegido DJ o música en directo', () => {
    const condition = window_(UI, "questionIsVisible(localFocus, MUSICA_PARTES_QUESTION_KEY)", '<MusicaPartesQuestion')
    expect(condition).toContain("musica?.selected.includes('dj')")
    expect(condition).toContain("musica?.selected.includes('directo')")
  })

  it('MusicaPartesQuestion es una selección múltiple de chips, sin pregunta de confirmación obligatoria previa', () => {
    const component = window_(UI, 'function MusicaPartesQuestion({', '\n// Catálogo DJ/directo/propia')
    expect(component).toContain('MUSICA_PARTES_CATALOG.map((item)')
    expect(component).toContain("className={'chip' + (selected.includes(item.key)")
    expect(component).not.toContain('ChoiceRow')
  })

  it('saveMusicaPartes pasa siempre por desiredForMusicaPartes (NONE) — nunca genera tarea/presupuesto/proveedor', () => {
    const fn = window_(UI, 'async function saveMusicaPartes(answer: MusicaPartesAnswer) {', '\n  async function saveAnimacion')
    expect(fn).toContain('desiredForMusicaPartes(answer)')
  })

  it('el catálogo de partes no incluye horarios ni plan de actuación — solo las 5 partes del evento', () => {
    const component = window_(UI, 'function MusicaPartesQuestion({', '\n// Catálogo DJ/directo/propia')
    expect(component).toContain('MUSICA_PARTES_CATALOG')
    expect(component).not.toMatch(/horario|plan de actuaci[oó]n/i)
  })
})
