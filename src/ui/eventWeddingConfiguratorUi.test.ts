import { describe, expect, it } from 'vitest'

// Tanda "Completar el configurador de boda" — tres bloques nuevos (Música y fiesta, Fotos y recuerdos,
// Otros y decoración) y la ampliación de Primer baile con su canción. Mismo patrón estructural que el
// resto del repo (sin jsdom): se lee el código fuente como texto.
const UI_FILES = import.meta.glob('/src/ui/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const UI = UI_FILES['/src/ui/EventosScreen.tsx']

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('Configurador de boda — los 3 bloques nuevos se añaden DESPUÉS de los existentes, exclusivos de boda', () => {
  it('Música y fiesta / Fotos y recuerdos / Otros y decoración aparecen tras "👪 Familiares", gateados por event.type === \'boda\'', () => {
    const familiaresIdx = UI.indexOf('👪 Familiares')
    const musicaIdx = UI.indexOf('🎵 Música y fiesta')
    const fotosIdx = UI.indexOf('📷 Fotos y recuerdos')
    const otrosIdx = UI.indexOf('🌿 Otros y decoración')
    expect(familiaresIdx).toBeGreaterThan(-1)
    expect(musicaIdx).toBeGreaterThan(familiaresIdx)
    expect(fotosIdx).toBeGreaterThan(musicaIdx)
    expect(otrosIdx).toBeGreaterThan(fotosIdx)
  })

  it('los tres bloques reutilizan el MISMO motor de reconciliación (applyPairDecisionGeneration), nunca uno paralelo', () => {
    const musica = slice(UI, 'function MusicaFiestaBlock({', '\nfunction MusicaCatalogQuestion(')
    const fotos = slice(UI, 'function FotosRecuerdosBlock({', '\nfunction OtrosDecoracionBlock(')
    const otros = slice(UI, 'function OtrosDecoracionBlock({', '\nfunction ComidaBebidaBlock(')
    expect(musica).toMatch(/applyPairDecisionGeneration\(event\.id,/)
    expect(fotos).toMatch(/applyPairDecisionGeneration\(event\.id,/)
    expect(otros).toMatch(/applyPairDecisionGeneration\(event\.id,/)
  })

  it('los tres bloques usan DecisionSummaryDetails (resumen compacto), igual que el resto del configurador', () => {
    const musica = slice(UI, 'function MusicaFiestaBlock({', '\nfunction MusicaCatalogQuestion(')
    const fotos = slice(UI, 'function FotosRecuerdosBlock({', '\nfunction OtrosDecoracionBlock(')
    const otros = slice(UI, 'function OtrosDecoracionBlock({', '\nfunction ComidaBebidaBlock(')
    expect(musica).toContain('<DecisionSummaryDetails summary={decisionSummary} onSelect={setLocalFocus} />')
    expect(fotos).toContain('<DecisionSummaryDetails summary={decisionSummary} onSelect={setLocalFocus} />')
    expect(otros).toContain('<DecisionSummaryDetails summary={decisionSummary} onSelect={setLocalFocus} />')
  })
})

describe('REGLA TRANSVERSAL "no preguntar dos veces" — música y decoración derivan de "qué incluye el lugar"', () => {
  it('Música: con venueHasMusic, la pregunta principal se sustituye por la confirmación "¿algo más?" — nunca "incluida en el lugar" como opción del catálogo', () => {
    const block = slice(UI, 'function MusicaFiestaBlock({', '\nfunction MusicaCatalogQuestion(')
    expect(block).toContain('venueHasMusic ? (')
    expect(block).toContain('El lugar ya incluye música. ¿Queréis añadir algo más?')
    expect(UI).not.toMatch(/MUSICA_CATALOG[\s\S]{0,200}incluida_en_el_lugar/)
  })

  it('Música resuelve venueHasMusic con venueIncludesService(venueCase, decisions, \'musica\', ...) — mismo módulo que ya usa Comida y bebida para tarta/bebidas', () => {
    const block = slice(UI, 'function MusicaFiestaBlock({', '\nfunction MusicaCatalogQuestion(')
    expect(block).toContain("venueIncludesService(venueCase, decisions, 'musica', event.includedServices ?? null)")
  })

  it('Decoración: mismo patrón exacto con la clave \'decoracion\'', () => {
    const block = slice(UI, 'function OtrosDecoracionBlock({', '\nfunction ComidaBebidaBlock(')
    expect(block).toContain("venueIncludesService(venueCase, decisions, 'decoracion', event.includedServices ?? null)")
    expect(block).toContain('El lugar ya incluye decoración. ¿Queréis decoración adicional?')
  })

  it('si dejan de querer "algo más" de música, el catálogo elegido se reconcilia (nunca huérfano) y se borra la sub-decisión — mismo criterio que "Primer baile" con "clases de baile"', () => {
    const block = slice(UI, 'function MusicaFiestaBlock({', '\nfunction MusicaCatalogQuestion(')
    const saveExtraConfirm = slice(block, 'async function saveMusicaExtraConfirm(', '\n  async function saveAnimacion(')
    expect(saveExtraConfirm).toContain("if (answer.choice !== 'si') {")
    expect(saveExtraConfirm).toContain('await deleteEventDecision(existing.id)')
  })
})

describe('Primer baile → canción: amplía la decisión existente, nunca un segundo momento ni tarea duplicada (generalizada a MOMENTOS_CON_CANCION por la Parte G3 — ver eventosMusicaPartesYCancionMomentosUi.test.ts para el detalle de esa generalización)', () => {
  const momentos = slice(UI, 'function MomentosEspecialesBlock({', '\nfunction FoodInheritedLine(')

  it('desiredForCancionMomento es puramente informativo (NONE siempre) — nunca genera Preparativo', () => {
    const domain = (UI_FILES['/src/domain/eventSpecialMoments.ts'] ?? (import.meta.glob('/src/domain/eventSpecialMoments.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/domain/eventSpecialMoments.ts'])
    expect(domain).toContain('export function desiredForCancionMomento(_answer: CancionMomentoAnswer | undefined): DesiredPairGeneration {\n  return NONE\n}')
  })

  it('a diferencia de "clases de baile", la canción NUNCA se borra al desmarcar Primer baile — solo se oculta (listMomentosEspecialesBlockQuestions deja de incluirla)', () => {
    const saveSeleccion = slice(momentos, 'async function saveSeleccion(', '\n  async function saveClasesBaile(')
    expect(saveSeleccion).toContain('CLASES_BAILE_QUESTION_KEY')
    expect(saveSeleccion).not.toContain('cancionQuestionKey')
  })

  it('la pregunta de la canción se ve por cada momento de MOMENTOS_CON_CANCION seleccionado, incluido Primer baile', () => {
    expect(momentos).toContain("MOMENTOS_CON_CANCION.filter((momento) => seleccion?.selected.includes(momento)).map((momento) => {")
    expect(momentos).toContain('questionIsVisible(localFocus, key) && (')
  })

  it('título y artista son opcionales de verdad: se puede guardar "Sí" sin rellenarlos', () => {
    expect(UI).toContain("onSelect={(choice) => onSave(choice === 'si' ? { choice, titulo: titulo || null, artista: artista || null } : { choice })}")
  })
})

describe('Fotos y recuerdos — ProviderLinker reutilizado tal cual, nunca un segundo mecanismo de vinculación', () => {
  const block = slice(UI, 'function FotosRecuerdosBlock({', '\nfunction OtrosDecoracionBlock(')

  it('cobertura "profesional" (dentro de la selección combinable, Fase 11 Parte G4) y vídeo "profesional" muestran <ProviderLinker>', () => {
    expect(block).toContain("cobertura?.choice === 'seleccionar' && cobertura.selected.includes('profesional') && coberturaDecision && <ProviderLinker event={event} decision={coberturaDecision} />")
    expect(block).toContain("video?.choice === 'profesional' && videoDecision && <ProviderLinker event={event} decision={videoDecision} />")
  })

  it('sesión con "mismo fotógrafo" NO genera un segundo proveedor/presupuesto; "otro" sí', () => {
    const domain = (import.meta.glob('/src/domain/eventFotosRecuerdos.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/domain/eventFotosRecuerdos.ts']
    expect(domain).toContain("if (answer.quien === 'otro') {")
    expect(domain).toContain('budgetCategory: null, providerCategory: null') // rama "mismo fotógrafo"/pendiente
  })

  it('sesión "otro" también muestra ProviderLinker, igual que cobertura/vídeo', () => {
    expect(block).toContain("sesion?.quien === 'otro' && sesionDecision && <ProviderLinker event={event} decision={sesionDecision} />")
  })

  it('cobertura familiares/amigos y por nuestra cuenta NUNCA generan presupuesto ni proveedor por sí solos (autogestionado) — solo si "profesional" está entre lo combinado, aunque se combine con los otros', () => {
    const domain = (import.meta.glob('/src/domain/eventFotosRecuerdos.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/domain/eventFotosRecuerdos.ts']
    const fn = slice(domain, 'export function desiredForCoberturaFotos(', '\n}')
    expect(fn).toContain("if (!answer || answer.choice !== 'seleccionar' || !answer.selected.includes('profesional')) return NONE")
  })
})

describe('Otros y decoración — alimenta el módulo Decoración existente, nunca lo sustituye', () => {
  const block = slice(UI, 'function OtrosDecoracionBlock({', '\nfunction ComidaBebidaBlock(')

  it('"+ Enviar a Decoración" reutiliza addEventDecorationItem/listEventDecorationItems TAL CUAL (nunca una tabla nueva)', () => {
    expect(block).toContain('const existing = await listEventDecorationItems(event.id)')
    expect(block).toContain('await addEventDecorationItem(event.id, `Decoración: ${l}`, null, zonasDecisionId)')
  })

  it('"+ Enviar a Decoración" es una acción MANUAL (botón propio), nunca automática en cada guardado de zonas', () => {
    const saveZonas = slice(block, 'async function saveZonas(', '\n  async function sendZonasToDecoracion(')
    expect(saveZonas).not.toContain('sendZonasToDecoracion')
    expect(block).toContain("{sendingZonas ? 'Enviando…' : '+ Enviar a Decoración'}")
  })

  it('comprueba nombres ya existentes antes de añadir — tocar el botón dos veces no duplica', () => {
    const fn = slice(block, 'async function sendZonasToDecoracion(', '\n  async function saveNecesidades(')
    expect(fn).toContain('const existingNames = new Set(existing.map((i) => i.name.toLowerCase()))')
    expect(fn).toContain('const toAdd = labels.filter((l) => !existingNames.has(')
  })

  it('zonas es opcional: nunca aparece como pendiente si no se ha tocado (sin_empezar, no por_decidir)', () => {
    const domain = (import.meta.glob('/src/domain/eventOtrosDecoracion.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/domain/eventOtrosDecoracion.ts']
    expect(domain).toContain('if (zonasDecision) {')
  })

  it('"¿Hay algo más?": convertir en preparativo es manual y explícito por ítem — NUNCA automático, usa addEventTask directo (no el motor de reconciliación)', () => {
    const fn = slice(block, 'async function convertNecesidad(', '\n  if (loading) return null')
    expect(fn).toContain('const taskId = await addEventTask(event.id, item.text)')
    expect(fn).not.toContain('applyPairDecisionGeneration')
  })

  it('una necesidad ya convertida no se puede convertir dos veces (taskId guardado, botón sustituido por "✓ En Preparativos")', () => {
    expect(block).toContain('✓ En Preparativos')
    expect(block).toContain('Convertir en preparativo')
  })
})
