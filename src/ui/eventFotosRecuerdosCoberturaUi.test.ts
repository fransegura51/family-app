import { describe, expect, it } from 'vitest'

// PEPA Eventos, prompt maestro — Fase 11 (Parte G4): la cobertura de fotos pasa de un único valor
// excluyente a un catálogo combinable (mismo patrón que MusicaCatalogQuestion), con "Sin cobertura"/
// "Todavía no lo sabemos" como estados terminales mutuamente excluyentes entre sí y con el catálogo.
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const COBERTURA_QUESTION = window_(UI, 'function CoberturaFotosQuestion({', '\nfunction FotosRecuerdosBlock(')
const FOTOS_BLOCK = window_(UI, 'function FotosRecuerdosBlock({', '\nfunction OtrosDecoracionBlock(')

describe('CoberturaFotosQuestion — catálogo combinable + terminales mutuamente excluyentes', () => {
  it('cada elemento del catálogo se puede marcar/desmarcar de forma independiente (toggle), nunca sustituye a los demás', () => {
    expect(COBERTURA_QUESTION).toContain('function toggleSelected(key: CoberturaFotosKey)')
    expect(COBERTURA_QUESTION).toContain('selected.includes(key) ? selected.filter((x) => x !== key) : [...selected, key]')
  })
  it('elegir "Sin cobertura" o "Todavía no lo sabemos" vacía la selección del catálogo (estado terminal, excluyente)', () => {
    expect(COBERTURA_QUESTION).toContain("function selectTerminal(choice: 'sin_cobertura' | 'todavia_no_lo_sabemos')")
    expect(COBERTURA_QUESTION).toContain('const next: CoberturaFotosAnswer = { choice, selected: [] }')
  })
  it('las chips del catálogo nunca se muestran activas cuando el estado actual es terminal', () => {
    expect(COBERTURA_QUESTION).toContain('!isTerminal && current?.choice === \'seleccionar\' && current.selected.includes(item.key)')
  })
})

describe('FotosRecuerdosBlock — cobertura usa el nuevo componente combinable, con compatibilidad hacia atrás', () => {
  it('normaliza la respuesta guardada (nueva o antigua) antes de usarla, nunca un cast directo sin pasar por la migración de forma', () => {
    expect(FOTOS_BLOCK).toContain('const cobertura = normalizeCoberturaFotosAnswer(coberturaDecision?.answer)')
  })
  it('renderiza <CoberturaFotosQuestion>, no el antiguo ChoiceRow de un solo valor', () => {
    expect(FOTOS_BLOCK).toContain('<CoberturaFotosQuestion existing={cobertura} saving={savingKey === COBERTURA_FOTOS_QUESTION_KEY} onSave={saveCobertura} />')
  })
  it('ProviderLinker para "profesional" comprueba la selección combinable, no un choice de un solo valor', () => {
    expect(FOTOS_BLOCK).toContain("cobertura?.choice === 'seleccionar' && cobertura.selected.includes('profesional') && coberturaDecision && <ProviderLinker")
  })
})
