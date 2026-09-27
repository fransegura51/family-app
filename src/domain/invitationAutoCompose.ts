// Fase 3 Bloque 5A (2026-09-27) — motor determinista de "✨ Pepa, hazla por mí".
//
// IMPORTANTE — qué es y qué NO es este archivo:
// - Construye una composición inicial (InvitationLayer[] normales, editables, sin bloquear) a partir de
//   datos REALES del evento — nunca inventa hechos. Es una función pura, sin React, sin red, sin IA.
// - NO es "Pepa, hazla bonita" (autoArrangeLayers, más abajo reutilizado) — esa función NUNCA toca el
//   contenido del usuario, solo reordena visualmente lo que ya existe. Este motor SÍ construye contenido,
//   pero solo la PRIMERA vez: el resultado son capas normales, el usuario es dueño completo después.
// - NO tiene interfaz. El Bloque 5B decidirá cómo se llama a `composeInvitationForMe` desde la UI.
//
// Reutiliza deliberadamente, sin duplicar:
// - `buildInvitationDataFields` (domain/events.ts) para los hechos reales del evento (fecha/hora/lugar/
//   ceremonia/celebración/edad), ya con el formateo humano y es-ES resuelto.
// - `autoArrangeLayers` (el mismo motor de "Pepa, hazla bonita") para apilar título/datos/cierre por su
//   alto REAL medido, con el mismo TextMeasurer inyectable — este motor nunca reimplementa wrapping ni
//   apilado de texto.
// - `resolveLayerFontWeight`, `EVENT_TYPE_META`, `INVITATION_SHAPES`, `assumedCanvasHeightPx`,
//   `ASSUMED_CANVAS_SIZE_PX` — todos ya existentes, ninguno duplicado.
import {
  ASSUMED_CANVAS_SIZE_PX,
  assumedCanvasHeightPx,
  autoArrangeLayers,
  buildInvitationDataFields,
  DEFAULT_TEXT_AREA,
  EVENT_TYPE_META,
  INVITATION_SHAPES,
  type InvitationTemplateMeta,
  type SafeZone,
  type TextMeasurer,
} from '@/domain/events'
import type { EventType, FamilyEvent, InvitationLayer } from '@/domain/types'

// ---------------------------------------------------------------------------------------------------
// Familias geométricas (auditoría 2026-09-27, ver memoria de sesión "Auditoría geométrica de las 100
// plantillas"). Son una herramienta INTERNA para decidir qué receta probar primero — el usuario nunca ve
// esto. La agrupación real salió de k-means sobre (width, height) de las 100 textArea reales; en vez de
// ejecutar clustering en tiempo de ejecución (o depender de una librería nueva) o de una fórmula por
// umbrales que la propia auditoría demostró insuficiente (ver `navidad_hogar`: aspect extremo pero NO
// ancha, cae en la familia "compacta", no en la "horizontal extrema"), se guarda el resultado ya conocido
// como tabla estática — mismo patrón ya usado en este archivo para `INVITATION_TEMPLATE_TAGS`.
// ---------------------------------------------------------------------------------------------------
export type GeometryFamily = 1 | 2 | 3 | 4 | 5

// prettier-ignore
const TEMPLATE_GEOMETRY_FAMILY: Record<string, GeometryFamily> = {
  // Familia 1 — Equilibrada/horizontal amplia (n=28): width 0.58-0.80, height 0.55-0.71, aspect 0.90-1.35.
  futbol: 1, unicornio: 1, disco: 1, videojuegos: 1, corazones: 1, gatitos: 1, coches: 1, robots: 1,
  pijamas: 1, piratas: 1, oceano: 1, hadas: 1, alienigenas: 1, playa: 1, concierto: 1, nochevieja: 1,
  bautizo_nina: 1, navidad: 1, cumpleanos_elegante: 1, navidad_muneco: 1, halloween_calabaza: 1,
  graduacion_esfuerzo: 1, graduacion_suena: 1, graduacion_explorar: 1, playa_atardecer: 1,
  carnaval_bufon: 1, corazones_acuarela: 1, corazones_madera: 1,
  // Familia 2 — Vertical amplia (n=36): width 0.45-0.60, height 0.58-0.82, aspect 0.62-0.95.
  clasico: 2, alegre: 2, monstruo: 2, elegante: 2, floral: 2, bautizo: 2, ositos: 2, superheroina: 2,
  espacio: 2, safari: 2, acampada: 2, granja: 2, boda: 2, obras: 2, comunion: 2, barbacoa: 2,
  navidad_dorada: 2, navidad_papanoel: 2, navidad_galletas: 2, navidad_farolillos: 2, halloween_casa: 2,
  halloween_bruja: 2, halloween_fantasmas: 2, graduacion_disciplina: 2, casa_terraza: 2,
  despedida_novia: 2, despedida_novio: 2, despedida_viaje: 2, playa_piscina: 2, playa_terraza: 2,
  otono_acogedor: 2, otono_cosecha: 2, corazones_dorado: 2, celebracion_dorada: 2, fiesta_acuarela: 2,
  sirena: 2,
  // Familia 3 — Horizontal extrema (n=3): width 0.70-0.79, height 0.37-0.46, aspect 1.74-1.95.
  superheroe: 3, princesa: 3, bebe_nino: 3,
  // Familia 4 — Compacta (n=13): width 0.46-0.57, height 0.34-0.55, surface 0.166-0.286 (la más pequeña).
  dinosaurios: 4, navidad_hogar: 4, cumpleanos_rosa: 4, cumpleanos_fiesta: 4, bebe_neutro: 4,
  bebe_arcoiris: 4, casa_llaves: 4, floral_picnic: 4, cena_hogar: 4, tapas: 4, desayuno: 4,
  carnaval_confeti: 4, otono_hogar: 4,
  // Familia 5 — Vertical estrecha (n=20): width 0.35-0.48 (la más estrecha), height 0.48-0.65.
  kpop: 5, bebe_nina: 5, casa_bienvenida: 5, casa_cajas: 5, despedida_noche: 5, floral_primavera: 5,
  floral_noche: 5, playa_pina: 5, comida_familiar: 5, jubilacion_brindis: 5, jubilacion_viaje: 5,
  jubilacion_relax: 5, jubilacion_cena: 5, carnaval_plumas: 5, carnaval_payaso: 5, otono_senderismo: 5,
  corazones_terraza: 5, delfin_tortuga: 5, mago: 5, bruja: 5,
}

/**
 * Familia geométrica de una plantilla — SOLO decide qué receta probar primero (ver sección 1 del bloque).
 * Nunca certifica que una composición cabe; eso lo decide `validateComposition` sobre el resultado real.
 *
 * Las 100 plantillas actuales están en la tabla de arriba (auditoría real, no aproximada). Si en el futuro
 * se añade una plantilla nueva sin actualizar la tabla, cae en el fallback geométrico de abajo — una
 * aproximación por rangos reales (los mismos que definieron cada familia), documentada y conservadora,
 * nunca clustering en tiempo de ejecución ni una librería nueva.
 */
export function classifyTemplateGeometry(template: Pick<InvitationTemplateMeta, 'key' | 'textArea'>): GeometryFamily {
  const known = TEMPLATE_GEOMETRY_FAMILY[template.key]
  if (known) return known
  const zone = template.textArea ?? DEFAULT_TEXT_AREA
  const aspect = zone.width / zone.height
  const surface = zone.width * zone.height
  if (aspect > 1.5) return zone.width > 0.65 ? 3 : 4
  if (surface < 0.29) return 4
  if (zone.width < 0.485) return 5
  if (zone.width >= 0.58) return 1
  return 2
}

// ---------------------------------------------------------------------------------------------------
// Datos reales del evento — normalizados y con formato humano, listos para convertirse en capas.
// ---------------------------------------------------------------------------------------------------
export type AutoComposeFieldKey = 'title' | 'subtitle' | 'fecha' | 'hora' | 'lugar' | 'ceremonia' | 'celebracion' | 'closing'

export interface AutoComposeDataField {
  key: AutoComposeFieldKey
  text: string
  // Un hecho real del evento nunca se omite silenciosamente (ver sección 34). Una frase genérica de
  // cierre (essential=false) SÍ puede omitirse como último paso de adaptación antes de fallar la receta.
  essential: boolean
}

// Catálogo pequeño y determinista de cierres genéricos — mismo tono que `buildInvitationMessage`
// (domain/events.ts) ya usa para cada tipo de evento, pero como frase SUELTA y opcional (aquí sí puede
// desaparecer sin perder ningún hecho, a diferencia del mensaje combinado de esa función). No inventa
// ningún dato — nunca menciona fecha/hora/lugar, que ya tienen su propia capa si existen.
const CLOSING_PHRASES: Record<EventType, string> = {
  cumpleanos: '¡Queremos pasarlo en grande con vosotros!',
  comunion: '¡Nos encantaría compartir este día con vosotros!',
  bautizo: 'Queremos compartir este momento con vosotros.',
  boda: '¡Queremos compartir este día con quienes más queremos!',
  celebracion: '¡Nos encantaría contar con vosotros!',
  personalizado: '¡No os lo podéis perder!',
}

/**
 * Evento → datos reales utilizables para una invitación, ya normalizados. Pensada para ser la MISMA
 * fuente que usa (o podría usar) el panel manual "📋 Datos" — no se duplica ninguna regla de fecha/hora/
 * ubicación aparte de las que ya tiene `buildInvitationDataFields`.
 */
export function getAvailableInvitationData(event: FamilyEvent): AutoComposeDataField[] {
  const fields: AutoComposeDataField[] = [{ key: 'title', text: event.title, essential: true }]
  for (const f of buildInvitationDataFields(event)) {
    const key: AutoComposeFieldKey = f.key === 'edad' ? 'subtitle' : (f.key as AutoComposeFieldKey)
    fields.push({ key, text: f.value, essential: true })
  }
  const closing = CLOSING_PHRASES[event.type]
  if (closing) fields.push({ key: 'closing', text: closing, essential: false })
  return fields
}

// ---------------------------------------------------------------------------------------------------
// Recetas.
// ---------------------------------------------------------------------------------------------------
export type AutoComposeStyle = 'clasica' | 'con_foto' | 'divertida'
export type AutoComposeRecipeKey = 'C1' | 'C2' | 'P1' | 'P2' | 'P3' | 'D1' | 'D2'

const INITIAL_RECIPE: Record<AutoComposeStyle, Record<GeometryFamily, AutoComposeRecipeKey>> = {
  clasica: { 1: 'C1', 2: 'C1', 3: 'C2', 4: 'C2', 5: 'C1' },
  con_foto: { 1: 'P1', 2: 'P1', 3: 'P3', 4: 'P3', 5: 'P2' },
  divertida: { 1: 'D1', 2: 'D1', 3: 'D2', 4: 'D2', 5: 'D1' },
}

export function selectInitialRecipe(style: AutoComposeStyle, family: GeometryFamily): AutoComposeRecipeKey {
  return INITIAL_RECIPE[style][family]
}

// Cadena de fallback (sección 21) — cada receta se prueba como mucho una vez, nunca en bucle.
const FALLBACK_CHAIN: Record<AutoComposeRecipeKey, AutoComposeRecipeKey | null> = {
  C1: 'C2',
  C2: null,
  P1: 'P2',
  P2: 'P3',
  P3: null,
  D1: 'D2',
  D2: null,
}

export function getFallbackRecipes(initial: AutoComposeRecipeKey): AutoComposeRecipeKey[] {
  const chain = [initial]
  let current: AutoComposeRecipeKey | null = initial
  while (true) {
    const next: AutoComposeRecipeKey | null = FALLBACK_CHAIN[current]
    if (!next) break
    chain.push(next)
    current = next
  }
  return chain
}

function styleForRecipe(recipe: AutoComposeRecipeKey): AutoComposeStyle {
  if (recipe === 'C1' || recipe === 'C2') return 'clasica'
  if (recipe === 'D1' || recipe === 'D2') return 'divertida'
  return 'con_foto'
}
function isCompactRecipe(recipe: AutoComposeRecipeKey): boolean {
  return recipe === 'C2' || recipe === 'P3' || recipe === 'D2'
}
function isPhotoRecipe(recipe: AutoComposeRecipeKey): boolean {
  return recipe === 'P1' || recipe === 'P2' || recipe === 'P3'
}
function isCircularPhotoRecipe(recipe: AutoComposeRecipeKey): boolean {
  return recipe === 'P2' || recipe === 'P3'
}

// ---------------------------------------------------------------------------------------------------
// Tamaños ideales/mínimos (sección 24) — coherentes con los que ya usa `buildInvitationTemplateLayers`
// (título 19-24px, mensaje 12-14px según zona compact/no-compact): aquí se añade un tercer escalón
// (mínimo legible) para el propio proceso de adaptación de este motor, que NO existía antes porque
// "Pepa, hazla bonita" nunca cambia fontSize. Nunca se baja de estos mínimos — si ni así cabe, la receta
// falla y se prueba el fallback (sección 25).
// ---------------------------------------------------------------------------------------------------
const FONT_SIZE_STEPS: Record<'title' | 'data' | 'closing', number[]> = {
  title: [24, 20, 16],
  data: [15, 13, 11],
  closing: [14, 12, 10],
}

function fontSizeStepsFor(key: AutoComposeFieldKey): number[] {
  if (key === 'title') return FONT_SIZE_STEPS.title
  if (key === 'closing') return FONT_SIZE_STEPS.closing
  return FONT_SIZE_STEPS.data // subtitle/fecha/hora/lugar/ceremonia/celebracion
}

// Márgenes internos del textArea (sección 10) — la receta nunca usa el 100% del rectángulo disponible.
// La variante compacta dedica menos aire a margen para ganar la altura que necesita el contenido.
const ZONE_MARGIN = {
  full: { side: 0.06, top: 0.04, bottom: 0.04 },
  compact: { side: 0.04, top: 0.02, bottom: 0.02 },
}

function insetZone(zone: SafeZone, margin: { side: number; top: number; bottom: number }): SafeZone {
  return {
    x: zone.x + zone.width * margin.side,
    y: zone.y + zone.height * margin.top,
    width: zone.width * (1 - 2 * margin.side),
    height: zone.height * (1 - margin.top - margin.bottom),
  }
}

// Foto (secciones 14-16) — fracción del textArea reservada para la foto antes de pasar el resto a
// autoArrangeLayers para el texto. La foto reutiliza el tipo de capa 'photo' ya existente (con
// photoMask, Bloque 3) — este motor no crea ningún sistema de imágenes nuevo.
const PHOTO_GAP_FRAC = 0.035
const PHOTO_RECT_HEIGHT_FRAC = { full: 0.46, compact: 0.38 }
const PHOTO_CIRCLE_DIAMETER_FRAC = { full: 0.46, compact: 0.36 }
const MIN_PHOTO_SIZE_PX = 60

// Convierte una fracción de ancho/alto del textArea al tamaño en px que necesitaría una capa 'photo'
// (cuadrada en píxeles, ver InvitationLayerVisual) para llenar esa fracción — misma conversión que ya usa
// `estimateLayerBoxFraction` para el resto de capas, invertida. Se usa el más restrictivo de los dos ejes.
function photoFontSizeForFraction(widthFrac: number, heightFrac: number, imageAspect: number): number {
  const byWidth = widthFrac * ASSUMED_CANVAS_SIZE_PX
  const byHeight = heightFrac * assumedCanvasHeightPx(imageAspect)
  return Math.max(MIN_PHOTO_SIZE_PX, Math.round(Math.min(byWidth, byHeight)))
}

interface PhotoPlacement {
  layer: InvitationLayer
  // Zona restante para el texto, después de reservar la de la foto (con su hueco).
  textZone: SafeZone
}

function buildPhotoPlacement(recipe: AutoComposeRecipeKey, zone: SafeZone, imageAspect: number, photoPath: string): PhotoPlacement {
  const compact = isCompactRecipe(recipe)
  if (!isCircularPhotoRecipe(recipe)) {
    // P1 — foto rectangular superior: ocupa el ancho completo de la zona, en su parte de arriba.
    const heightFrac = PHOTO_RECT_HEIGHT_FRAC[compact ? 'compact' : 'full']
    const size = photoFontSizeForFraction(zone.width, heightFrac, imageAspect)
    const cx = zone.x + zone.width / 2
    const photoCenterYFrac = heightFrac / 2
    const layer: InvitationLayer = {
      id: 'auto-photo',
      type: 'photo',
      x: cx,
      y: zone.y + zone.height * photoCenterYFrac,
      rotation: 0,
      scale: 1,
      zIndex: 1,
      photoPath,
      photoMask: 'none',
      fontSize: size,
    }
    const textTop = zone.y + zone.height * (heightFrac + PHOTO_GAP_FRAC)
    return { layer, textZone: { x: zone.x, y: textTop, width: zone.width, height: zone.y + zone.height - textTop } }
  }
  // P2/P3 — foto circular: un círculo centrado, en la parte de arriba de la zona.
  const diameterFrac = PHOTO_CIRCLE_DIAMETER_FRAC[compact ? 'compact' : 'full']
  const size = photoFontSizeForFraction(diameterFrac * zone.width, diameterFrac * zone.height, imageAspect)
  // Altura real (en fracción de zona) que ocupa un círculo de `size` px, para reservarle su hueco real
  // (misma conversión que arriba, pero en el sentido inverso: de px a fracción de ALTO de la zona).
  const heightFracReal = size / assumedCanvasHeightPx(imageAspect) / zone.height
  const cx = zone.x + zone.width / 2
  const layer: InvitationLayer = {
    id: 'auto-photo',
    type: 'photo',
    x: cx,
    y: zone.y + (heightFracReal * zone.height) / 2,
    rotation: 0,
    scale: 1,
    zIndex: 1,
    photoPath,
    photoMask: 'circle',
    fontSize: size,
  }
  const textTop = zone.y + zone.height * (heightFracReal + PHOTO_GAP_FRAC)
  return { layer, textZone: { x: zone.x, y: textTop, width: zone.width, height: zone.y + zone.height - textTop } }
}

// ---------------------------------------------------------------------------------------------------
// Construcción de campos por receta (sección 11, 13, 16, 26) — combina fecha+hora en la variante
// compacta (agrupa datos compatibles), y permite reintentar sin el cierre genérico (nunca sin un hecho
// real) como último paso de adaptación antes de fallar la receta.
// ---------------------------------------------------------------------------------------------------
function buildFieldsForAttempt(event: FamilyEvent, compact: boolean, includeClosing: boolean): AutoComposeDataField[] {
  const base = getAvailableInvitationData(event)
  let fields = base.filter((f) => includeClosing || f.key !== 'closing')
  if (compact) {
    const fecha = fields.find((f) => f.key === 'fecha')
    const hora = fields.find((f) => f.key === 'hora')
    if (fecha && hora) {
      const merged: AutoComposeDataField = { key: 'fecha', text: `${fecha.text} · ${hora.text}`, essential: true }
      const withoutFechaHora = fields.filter((f) => f.key !== 'fecha' && f.key !== 'hora')
      const insertAt = withoutFechaHora.findIndex((f) => f.key === 'lugar' || f.key === 'ceremonia' || f.key === 'closing')
      fields = insertAt === -1 ? [...withoutFechaHora, merged] : [...withoutFechaHora.slice(0, insertAt), merged, ...withoutFechaHora.slice(insertAt)]
    }
  }
  return fields
}

function buildFieldLayers(fields: AutoComposeDataField[], sizeIndex: number): InvitationLayer[] {
  return fields.map((f, i) => ({
    id: `auto-${f.key}`,
    type: f.key === 'title' ? 'text' : 'event_data',
    x: 0.5,
    y: 0.5,
    rotation: 0,
    scale: 1,
    zIndex: 10 + i,
    text: f.text,
    color: '#ffffff',
    fontFamily: 'inherit',
    fontSize: fontSizeStepsFor(f.key)[sizeIndex],
  }))
}

// Decoración de 🎉 Divertida (secciones 7, 17-18) — reutiliza el icono ya asociado al tipo de evento
// (EVENT_TYPE_META, el mismo que usa `buildInvitationTemplateLayers` para las plantillas normales; no se
// inventa una asociación nueva) y UNA forma ya existente del catálogo de formas (Bloque 3). Ambas se pasan
// a `autoArrangeLayers`, que ya sabe colocar el icono encima del título y empujar la forma a una esquina
// FUERA de la zona de texto (pushOutsideZone) — este motor no reimplementa esa colocación.
function buildDecorationLayers(event: Pick<FamilyEvent, 'type'>): { emoji: InvitationLayer; shape: InvitationLayer } {
  const icon = EVENT_TYPE_META[event.type].icon
  const shapeKey = INVITATION_SHAPES.find((s) => s.key === 'confeti')?.key ?? INVITATION_SHAPES[0].key
  return {
    emoji: { id: 'auto-decor-emoji', type: 'emoji', x: 0.5, y: 0.5, rotation: 0, scale: 1, zIndex: 1, text: icon, fontSize: 40 },
    shape: { id: 'auto-decor-shape', type: 'shape', x: 0.5, y: 0.5, rotation: 0, scale: 1, zIndex: 0, shapeKey, color: '#ffffff', opacity: 0.55, fontSize: 46 },
  }
}

// ---------------------------------------------------------------------------------------------------
// Un intento de receta: coloca las capas y valida con el MISMO motor de medición que "Pepa, hazla
// bonita" (autoArrangeLayers/estimateLayerBoxFraction) — nunca una segunda estimación paralela.
// ---------------------------------------------------------------------------------------------------
interface RecipeAttemptResult {
  layers: InvitationLayer[]
  overflowed: boolean
}

function attemptOnce(
  recipe: AutoComposeRecipeKey,
  event: FamilyEvent,
  template: InvitationTemplateMeta,
  photoPath: string | undefined,
  measurer: TextMeasurer | undefined,
  compact: boolean,
  includeClosing: boolean,
  sizeIndex: number,
): RecipeAttemptResult {
  const zone = template.textArea ?? DEFAULT_TEXT_AREA
  const imageAspect = template.imageAspect ?? 1
  const margin = compact ? ZONE_MARGIN.compact : ZONE_MARGIN.full
  let textZone = insetZone(zone, margin)
  const layersToArrange: InvitationLayer[] = []

  // La foto NUNCA se pasa a autoArrangeLayers: esa función reposiciona cualquier capa 'photo' a un
  // {x:0.5, y:0.4} fijo (su propia regla para "Hazla bonita", pensada para una foto grande centrada en
  // el lienzo) — nos pisaría la posición relativa al textArea que calcula buildPhotoPlacement. Se coloca
  // aparte y se combina con el resultado ya apilado del texto.
  let photoLayer: InvitationLayer | null = null

  if (isPhotoRecipe(recipe)) {
    if (!photoPath) throw new Error('attemptOnce: receta con foto llamada sin photoPath')
    const placement = buildPhotoPlacement(recipe, zone, imageAspect, photoPath)
    photoLayer = placement.layer
    textZone = insetZone(placement.textZone, margin)
  }

  const fields = buildFieldsForAttempt(event, compact, includeClosing)
  const fieldLayers = buildFieldLayers(fields, sizeIndex)
  layersToArrange.push(...fieldLayers)

  const style = styleForRecipe(recipe)
  if (style === 'divertida') {
    const { emoji, shape } = buildDecorationLayers(event)
    layersToArrange.push(emoji, shape)
  }

  const result = autoArrangeLayers(layersToArrange, textZone, imageAspect, measurer)
  const layers = photoLayer ? [photoLayer, ...result.layers] : result.layers
  return { layers, overflowed: result.overflowed }
}

/**
 * Valida el resultado REAL de un intento — no "cabe matemáticamente", sino "autoArrangeLayers, con el
 * mismo TextMeasurer que usa el editor real, no reporta overflow". autoArrangeLayers ya garantiza por
 * construcción: capas dentro de la zona (se apilan desde dentro de un zone ya con margen aplicado),
 * icono/título/cuerpo sin colisión (apilado por alto real medido), y formas fuera de la zona de texto
 * (pushOutsideZone) — este motor no reimplementa esas comprobaciones, solo las usa como criterio de
 * aceptación con SUS PROPIAS reglas (sección 22): además de "no overflow", exige que cada dato real
 * introducido siga presente en el texto de alguna capa (ninguna se pierde silenciosamente).
 */
function validateComposition(attempt: RecipeAttemptResult, essentialFields: AutoComposeDataField[]): boolean {
  if (attempt.overflowed) return false
  for (const f of essentialFields) {
    if (!attempt.layers.some((l) => l.text === f.text)) return false
  }
  return true
}

function attemptRecipe(
  recipe: AutoComposeRecipeKey,
  event: FamilyEvent,
  template: InvitationTemplateMeta,
  photoPath: string | undefined,
  measurer: TextMeasurer | undefined,
): RecipeAttemptResult | null {
  const compact = isCompactRecipe(recipe)
  // Sección 25 — estrategia de adaptación: ideal → reducción moderada → mínimo, y SOLO como último
  // recurso (en cada escalón de tamaño) reintentar sin el cierre genérico — nunca sin un hecho real.
  const hadClosing = getAvailableInvitationData(event).some((f) => f.key === 'closing')
  for (const includeClosing of [true, false]) {
    // Si el evento nunca tuvo cierre, el intento "sin cierre" sería idéntico al de arriba — no repetirlo.
    if (!includeClosing && !hadClosing) continue
    const fields = buildFieldsForAttempt(event, compact, includeClosing)
    for (let sizeIndex = 0; sizeIndex < FONT_SIZE_STEPS.title.length; sizeIndex++) {
      const attempt = attemptOnce(recipe, event, template, photoPath, measurer, compact, includeClosing, sizeIndex)
      if (validateComposition(attempt, fields.filter((f) => f.essential))) return attempt
    }
  }
  return null
}

// ---------------------------------------------------------------------------------------------------
// API pública del motor (sección 43).
// ---------------------------------------------------------------------------------------------------
export interface AutoComposeSuccess {
  status: 'success'
  style: AutoComposeStyle
  geometryFamily: GeometryFamily
  initialRecipe: AutoComposeRecipeKey
  attemptedRecipes: AutoComposeRecipeKey[]
  acceptedRecipe: AutoComposeRecipeKey
  layers: InvitationLayer[]
}
export interface AutoComposeNeedsPhoto {
  status: 'needs_photo'
}
export interface AutoComposeFail {
  status: 'fail'
  attemptedRecipes: AutoComposeRecipeKey[]
  reason: string
}
export type AutoComposeResult = AutoComposeSuccess | AutoComposeNeedsPhoto | AutoComposeFail

export interface ComposeInvitationForMeParams {
  event: FamilyEvent
  template: InvitationTemplateMeta
  style: AutoComposeStyle
  /** Ruta ya subida (event-photos) de una foto elegida por el usuario — este motor nunca la inventa. */
  photoPath?: string | null
  /** Inyectable para tests (Node, heurística por caracteres) o real (Canvas 2D en el navegador). */
  measurer?: TextMeasurer
}

/**
 * Motor determinista: mismos event/template/style/photoPath → mismo resultado siempre (sección 4, 33).
 * Sin Date.now()/Math.random()/UUID — los ids de capa son fijos por rol semántico (`auto-title`,
 * `auto-fecha`...), únicos dentro de una misma composición generada.
 */
export function composeInvitationForMe(params: ComposeInvitationForMeParams): AutoComposeResult {
  const { event, template, style, measurer } = params
  if (style === 'con_foto' && !params.photoPath) return { status: 'needs_photo' }

  const geometryFamily = classifyTemplateGeometry(template)
  const initialRecipe = selectInitialRecipe(style, geometryFamily)
  const chain = getFallbackRecipes(initialRecipe)
  const attemptedRecipes: AutoComposeRecipeKey[] = []

  for (const recipe of chain) {
    attemptedRecipes.push(recipe)
    const result = attemptRecipe(recipe, event, template, params.photoPath ?? undefined, measurer)
    if (result) {
      return {
        status: 'success',
        style,
        geometryFamily,
        initialRecipe,
        attemptedRecipes: [...attemptedRecipes],
        acceptedRecipe: recipe,
        layers: result.layers,
      }
    }
  }

  return {
    status: 'fail',
    attemptedRecipes,
    reason: `Ninguna de las recetas (${attemptedRecipes.join(' → ')}) encajó dentro del textArea real de "${template.key}" ni siquiera en tamaño mínimo y sin cierre.`,
  }
}
