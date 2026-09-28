// Fase 3 Bloque 5A (2026-09-27), evolucionado 2026-09-28 ("Pepa: contenido/composición/estilo separados,
// generador narrativo") — motor determinista de "✨ Pepa, hazla por mí" y compañero de "✨ Pepa, hazla
// bonita" (autoArrangeLayers, domain/events.ts — reutilizada tal cual, nunca reimplementada aquí).
//
// IMPORTANTE — qué es y qué NO es este archivo:
// - Construye una composición inicial (InvitationLayer[] normales, editables, sin bloquear) a partir de
//   datos REALES del evento — nunca inventa hechos. Es una función pura, sin React, sin red, sin IA.
// - NO es "Pepa, hazla bonita" — esa función NUNCA toca el contenido del usuario, solo reordena
//   visualmente lo que ya existe. Este motor SÍ construye contenido, pero solo la PRIMERA vez: el resultado
//   son capas normales, el usuario es dueño completo después.
//
// Arquitectura (tres responsabilidades separadas, nunca mezcladas en una sola "receta"):
//   1) CONTENIDO — qué dice la invitación. `buildInvitationContent` (domain/events.ts) redacta
//      TITLE/BODY/CLOSING a partir de datos reales; se calcula UNA vez, antes de cualquier intento de
//      encaje, y no cambia entre intentos (solo cambia cómo se PRESENTA, nunca qué se DICE).
//   2) COMPOSICIÓN — dónde va cada elemento. Viene de las zonas de la plantilla (`resolveZones`, derivadas
//      de `textArea` cuando la plantilla no calibra `zones` explícitas — ninguna de las 100 lo hace hoy) y
//      de la familia geométrica (para margen/forma de foto por defecto).
//   3) ESTILO — cómo se ve. `STYLE_TREATMENT['clasico' | 'divertido']` decide fuente, tamaño, color,
//      curvatura, decoración — nunca coordenadas.
// Un "intento" (`ComposeAttempt`) varía solo PRESENTACIÓN (margen/tamaño/cierre/decoración/curva) para
// encajar en la zona real, nunca contenido ni estilo base — a diferencia del sistema de recetas C/P/D
// anterior, que mezclaba las tres cosas a la vez.
import {
  ASSUMED_CANVAS_SIZE_PX,
  assumedCanvasHeightPx,
  autoArrangeLayers,
  buildInvitationContent,
  buildInvitationDataFields,
  DEFAULT_TEXT_AREA,
  estimateLayerBoxFraction,
  EVENT_TYPE_META,
  INVITATION_SHAPES,
  type InvitationContent,
  type InvitationTemplateMeta,
  type SafeZone,
  type TextMeasurer,
} from '@/domain/events'
import type { FamilyEvent, InvitationEventFieldKey, InvitationLayer, InvitationTextAlign } from '@/domain/types'

// ---------------------------------------------------------------------------------------------------
// Familias geométricas (auditoría 2026-09-27, ver memoria de sesión "Auditoría geométrica de las 100
// plantillas"). Siguen siendo una herramienta INTERNA — ya no eligen una "receta", solo el margen por
// defecto (compacto primero en las familias más estrechas) y la forma de foto por defecto (rectangular vs
// circular) cuando la plantilla no calibra `zones.photo` a mano. La agrupación real salió de k-means sobre
// (width, height) de las 100 textArea reales; se guarda como tabla estática en vez de calcularla en tiempo
// de ejecución — mismo patrón ya usado en este archivo para `INVITATION_TEMPLATE_TAGS`.
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
 * Familia geométrica de una plantilla — SOLO decide margen/forma de foto por defecto (ver arriba). Nunca
 * certifica que una composición cabe; eso lo decide `validateComposition` sobre el resultado real.
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
// "📋 Datos" (panel manual, InvitationDesigner.tsx) — un dato real del evento como capa suelta, insertada a
// mano. Sin relación con la redacción narrativa de "Pepa, hazla por mí" (ver domain/events.ts,
// buildInvitationContent) — son dos formas distintas de llevar el MISMO hecho real a la invitación: una
// frase tejida automáticamente, o un dato suelto que el usuario coloca él mismo. Se conserva tal cual.
// ---------------------------------------------------------------------------------------------------
export type AutoComposeFieldKey = InvitationEventFieldKey

export function toEventFieldKey(dataFieldKey: string): Exclude<AutoComposeFieldKey, 'closing'> {
  return (dataFieldKey === 'edad' ? 'subtitle' : dataFieldKey) as Exclude<AutoComposeFieldKey, 'closing'>
}

export interface AutoComposeDataField {
  key: AutoComposeFieldKey
  text: string
  essential: boolean
  merged?: boolean
}

/**
 * Evento → datos reales utilizables, ya normalizados — usada por el panel manual "📋 Datos" y, aquí mismo,
 * para resolver el valor canónico de cada campo que participó en el BODY narrativo (ver
 * `buildNarrativeSource` más abajo) — una sola fuente para "cuál es el valor actual de este campo", tanto
 * para una capa suelta como para una tejida dentro de una frase.
 */
export function getAvailableInvitationData(event: FamilyEvent): AutoComposeDataField[] {
  const fields: AutoComposeDataField[] = [{ key: 'title', text: event.title, essential: true }]
  for (const f of buildInvitationDataFields(event)) {
    fields.push({ key: toEventFieldKey(f.key), text: f.value, essential: true })
  }
  return fields
}

// ---------------------------------------------------------------------------------------------------
// Estilo = tratamiento visual (secciones 16-21) — NUNCA decide coordenadas. Solo dos estilos (sección 17):
// "con_foto" deja de ser un estilo — la foto es ortogonal (sección 18, ver ComposeInvitationForMeParams).
// ---------------------------------------------------------------------------------------------------
export type AutoComposeStyle = 'clasico' | 'divertido'

interface StyleRoleTreatment {
  fontFamily: string
  bold: boolean
  italic?: boolean
  fontSizeSteps: number[]
  textAlign: InvitationTextAlign
}

interface StyleTreatment {
  title: StyleRoleTreatment & { curveIdeal: number }
  body: StyleRoleTreatment
  closing: StyleRoleTreatment
  allowDecoration: boolean
}

// Sección 19 — CLÁSICO: elegante, limpio, equilibrado, jerarquía clara, decoración contenida (= ninguna
// automática, igual que ya hacía "clásica" antes de este bloque — comportamiento conservado, no regresión).
// El título usa una serifa (protagonismo sin recurrir a mayúsculas ni tamaños desmedidos); el cuerpo se
// queda en la tipografía base, perfectamente legible; el cierre es más pequeño y en cursiva — diferenciado
// pero secundario.
//
// Sección 20 — DIVERTIDO: claramente distinto (título más grande, con curva disponible cuando cabe,
// decoración permitida), sin sacrificar legibilidad en BODY (misma tipografía/tamaño base que Clásico) ni
// invadir zonas protegidas (la curva y la decoración son las PRIMERAS en soltarse si no caben, antes que
// reducir tamaño — ver `buildAttemptSequence`).
const STYLE_TREATMENT: Record<AutoComposeStyle, StyleTreatment> = {
  clasico: {
    title: { fontFamily: 'Georgia, serif', bold: true, fontSizeSteps: [24, 20, 16], textAlign: 'center', curveIdeal: 0 },
    body: { fontFamily: 'inherit', bold: false, fontSizeSteps: [15, 13, 11], textAlign: 'center' },
    closing: { fontFamily: 'inherit', bold: false, italic: true, fontSizeSteps: [13, 12, 11], textAlign: 'center' },
    allowDecoration: false,
  },
  divertido: {
    title: { fontFamily: 'inherit', bold: true, fontSizeSteps: [28, 22, 18], textAlign: 'center', curveIdeal: 14 },
    body: { fontFamily: 'inherit', bold: false, fontSizeSteps: [15, 13, 11], textAlign: 'center' },
    closing: { fontFamily: 'inherit', bold: true, fontSizeSteps: [14, 12, 11], textAlign: 'center' },
    allowDecoration: true,
  },
}

// Sección 21 — "color inteligente": nunca #ffffff fijo. Por defecto se usa `template.text` — el color de
// contraste que YA se eligió a mano para cada una de las 100 plantillas al crearlas — como base para
// TITLE/BODY/CLOSING. `template.palette` permite un tratamiento más especial (p. ej. un efecto de texto
// concreto en el título) cuando de verdad encaja con ESA plantilla — ninguna de las 100 lo usa todavía
// (mismo criterio incremental que `zones`, sección 14): nunca análisis de imagen en tiempo de ejecución.
function resolveRoleColor(template: InvitationTemplateMeta, style: AutoComposeStyle, role: 'title' | 'body' | 'closing'): string {
  const override = template.palette?.[style]
  const base = template.text || '#ffffff'
  if (role === 'title') return override?.titleColor ?? base
  if (role === 'body') return override?.bodyColor ?? base
  return override?.closingColor ?? base
}

// ---------------------------------------------------------------------------------------------------
// Plantilla = geometría (secciones 12-15) — zonas semánticas derivadas de `textArea` cuando la plantilla no
// calibra `zones` a mano (ninguna de las 100 lo hace todavía). `textArea` NUNCA se toca ni se reinterpreta
// aquí para invitaciones ya guardadas — esto solo se consulta durante generación/reorganización.
// ---------------------------------------------------------------------------------------------------
interface ResolvedZones {
  title: SafeZone
  body: SafeZone
  closing: SafeZone
  photo?: SafeZone
  decoration: SafeZone[]
  forbidden: SafeZone[]
}

function resolveZones(template: InvitationTemplateMeta): ResolvedZones {
  const base = template.textArea ?? DEFAULT_TEXT_AREA
  const z = template.zones
  return {
    title: z?.title ?? base,
    body: z?.body ?? base,
    closing: z?.closing ?? base,
    photo: z?.photo,
    decoration: z?.decoration ?? [],
    forbidden: z?.forbidden ?? [],
  }
}

// Márgenes internos de zona (sección 12) — la composición nunca usa el 100% del rectángulo disponible. La
// variante compacta dedica menos aire a margen para ganar la altura que necesita el contenido — un paso de
// adaptación más, antes de encoger la letra (ver `buildAttemptSequence`).
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

function boxesOverlapRect(cx: number, cy: number, halfW: number, halfH: number, rect: SafeZone): boolean {
  return cx - halfW < rect.x + rect.width && cx + halfW > rect.x && cy - halfH < rect.y + rect.height && cy + halfH > rect.y
}

// Sección 15 — zonas prohibidas: si la plantilla no las calibra (ninguna de las 100 lo hace todavía), esta
// comprobación siempre da `false` (comportamiento de siempre, sin regresión). Cuando existan, una capa que
// invade una zona con ilustración importante hace fallar el intento (nunca la reposiciona con heurísticas
// de imagen — sección 15, "no análisis de imagen complejo en esta fase").
function invadesForbiddenZone(layers: InvitationLayer[], forbidden: SafeZone[], zoneWidthFrac: number, imageAspect: number, measurer?: TextMeasurer): boolean {
  if (forbidden.length === 0) return false
  for (const l of layers) {
    const box = estimateLayerBoxFraction(l, zoneWidthFrac, imageAspect, measurer)
    for (const rect of forbidden) {
      if (boxesOverlapRect(l.x, l.y, box.halfWidth, box.halfHeight, rect)) return true
    }
  }
  return false
}

// Foto (sección 18) — fracción de zona reservada antes de pasar el resto a autoArrangeLayers para el texto.
// Reutiliza el tipo de capa 'photo' ya existente (con photoMask) — este motor no crea ningún sistema de
// imágenes nuevo. La FORMA (rectangular/circular) depende de la familia geométrica quiestas por defecto
// (mismo criterio ya certificado antes de este bloque); cuando `zones.photo` está calibrada a mano, se
// respeta su rectángulo tal cual y NO se recorta la zona de texto (el autor de la plantilla ya dejó hueco).
const PHOTO_GAP_FRAC = 0.035
const PHOTO_RECT_HEIGHT_FRAC = { full: 0.46, compact: 0.38 }
const PHOTO_CIRCLE_DIAMETER_FRAC = { full: 0.46, compact: 0.36 }
const MIN_PHOTO_SIZE_PX = 60

function photoShapeForFamily(family: GeometryFamily): 'rect' | 'circle' {
  return family === 1 || family === 2 ? 'rect' : 'circle'
}

function photoSizeForFraction(widthFrac: number, heightFrac: number, imageAspect: number): number {
  const byWidth = widthFrac * ASSUMED_CANVAS_SIZE_PX
  const byHeight = heightFrac * assumedCanvasHeightPx(imageAspect)
  return Math.max(MIN_PHOTO_SIZE_PX, Math.round(Math.min(byWidth, byHeight)))
}

interface PhotoPlacement {
  layer: InvitationLayer
  textZone: SafeZone
}

function buildPhotoPlacement(shape: 'rect' | 'circle', explicitZone: SafeZone | undefined, textZone: SafeZone, imageAspect: number, photoPath: string, compact: boolean): PhotoPlacement {
  if (explicitZone) {
    const cx = explicitZone.x + explicitZone.width / 2
    const cy = explicitZone.y + explicitZone.height / 2
    const size = photoSizeForFraction(explicitZone.width, explicitZone.height, imageAspect)
    const layer: InvitationLayer = { id: 'auto-photo', type: 'photo', x: cx, y: cy, rotation: 0, scale: 1, zIndex: 1, photoPath, photoMask: shape === 'circle' ? 'circle' : 'none', fontSize: size }
    return { layer, textZone }
  }
  const zone = textZone
  if (shape === 'rect') {
    const heightFrac = PHOTO_RECT_HEIGHT_FRAC[compact ? 'compact' : 'full']
    const size = photoSizeForFraction(zone.width, heightFrac, imageAspect)
    const cx = zone.x + zone.width / 2
    const photoCenterYFrac = heightFrac / 2
    const layer: InvitationLayer = { id: 'auto-photo', type: 'photo', x: cx, y: zone.y + zone.height * photoCenterYFrac, rotation: 0, scale: 1, zIndex: 1, photoPath, photoMask: 'none', fontSize: size }
    const textTop = zone.y + zone.height * (heightFrac + PHOTO_GAP_FRAC)
    return { layer, textZone: { x: zone.x, y: textTop, width: zone.width, height: zone.y + zone.height - textTop } }
  }
  const diameterFrac = PHOTO_CIRCLE_DIAMETER_FRAC[compact ? 'compact' : 'full']
  const size = photoSizeForFraction(diameterFrac * zone.width, diameterFrac * zone.height, imageAspect)
  const heightFracReal = size / assumedCanvasHeightPx(imageAspect) / zone.height
  const cx = zone.x + zone.width / 2
  const layer: InvitationLayer = { id: 'auto-photo', type: 'photo', x: cx, y: zone.y + (heightFracReal * zone.height) / 2, rotation: 0, scale: 1, zIndex: 1, photoPath, photoMask: 'circle', fontSize: size }
  const textTop = zone.y + zone.height * (heightFracReal + PHOTO_GAP_FRAC)
  return { layer, textZone: { x: zone.x, y: textTop, width: zone.width, height: zone.y + zone.height - textTop } }
}

// Sección 22 — decoración (emoji + una forma, mismo catálogo/asociación por tipo de evento que antes: nunca
// se inventa una asociación nueva). Reutiliza `autoArrangeLayers` para colocarla (icono encima del título,
// forma en una esquina fuera de la zona de texto) cuando la plantilla no calibra `zones.decoration` —
// comportamiento de siempre. Cuando sí las calibra (ninguna de las 100 lo hace todavía), se reubica en el
// centro de esas zonas en vez de las esquinas ciegas.
function buildDecorationLayers(event: Pick<FamilyEvent, 'type'>): { emoji: InvitationLayer; shape: InvitationLayer } {
  const icon = EVENT_TYPE_META[event.type].icon
  const shapeKey = INVITATION_SHAPES.find((s) => s.key === 'confeti')?.key ?? INVITATION_SHAPES[0].key
  return {
    emoji: { id: 'auto-decor-emoji', type: 'emoji', x: 0.5, y: 0.5, rotation: 0, scale: 1, zIndex: 1, text: icon, fontSize: 40 },
    shape: { id: 'auto-decor-shape', type: 'shape', x: 0.5, y: 0.5, rotation: 0, scale: 1, zIndex: 0, shapeKey, color: '#ffffff', opacity: 0.55, fontSize: 46 },
  }
}

function placeDecorationInZones(layers: InvitationLayer[], decorationZones: SafeZone[]): InvitationLayer[] {
  if (decorationZones.length === 0) return layers
  let i = 0
  return layers.map((l) => {
    if (l.id !== 'auto-decor-emoji' && l.id !== 'auto-decor-shape') return l
    const zone = decorationZones[i % decorationZones.length]
    i++
    return { ...l, x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 }
  })
}

// ---------------------------------------------------------------------------------------------------
// Seguimiento de datos del evento — capa BODY narrativa (sección 9). A diferencia de "event_field" (un
// único campo = una capa), el BODY teje varios hechos en una sola frase: `source.fields` recuerda CADA
// campo real que participó y el valor canónico que tenía "en su momento" (misma fuente que
// `getAvailableInvitationData`, para comparar siempre como los mismos "manzanas contra manzanas" que ya usa
// el resto del sistema); `bodyAtInsertion` recuerda el párrafo COMPLETO generado, para poder distinguir una
// edición manual sin necesitar comparar palabra por palabra (sección 11).
// ---------------------------------------------------------------------------------------------------
function buildNarrativeSource(event: FamilyEvent, content: InvitationContent): Extract<NonNullable<InvitationLayer['source']>, { kind: 'event_narrative' }> | undefined {
  if (content.bodyFields.length === 0) return undefined
  const currentByField = new Map(getAvailableInvitationData(event).map((f) => [f.key, f.text]))
  return {
    kind: 'event_narrative',
    bodyAtInsertion: content.body,
    fields: content.bodyFields.map((field) => ({ field, valueAtInsertion: currentByField.get(field) ?? '' })),
  }
}

// ---------------------------------------------------------------------------------------------------
// Un intento de composición (secciones 1-4, 23) — el CONTENIDO ya está decidido (se calcula una sola vez,
// fuera de aquí) y nunca cambia entre intentos; lo único que varía es la PRESENTACIÓN, para encajar en la
// zona real de la plantilla.
// ---------------------------------------------------------------------------------------------------
interface ComposeAttempt {
  compact: boolean
  sizeIndex: number
  includeClosing: boolean
  includeDecoration: boolean
  includeCurve: boolean
}

// Orden de adaptación (secciones 19-20, 25): primero se sueltan adornos (decoración/curva) del estilo
// Divertido, LUEGO se comprime el margen, LUEGO se encoge la letra, y solo como último recurso se
// prescinde del cierre — nunca al revés, y nunca se toca el contenido (título/cuerpo siguen siendo
// exactamente los mismos en todos los intentos). Las familias geométricas más estrechas (3/4) empiezan
// directamente en margen compacto — mismo criterio que ya decidía la "receta inicial" antes de este bloque.
function buildAttemptSequence(style: AutoComposeStyle, family: GeometryFamily): ComposeAttempt[] {
  const treatment = STYLE_TREATMENT[style]
  const decorationOptions = treatment.allowDecoration ? [true, false] : [false]
  const curveOptions = treatment.title.curveIdeal > 0 ? [true, false] : [false]
  const compactFirst = family === 3 || family === 4
  const marginOrder = compactFirst ? [true, false] : [false, true]

  const attempts: ComposeAttempt[] = []
  for (const compact of marginOrder) {
    for (const includeDecoration of decorationOptions) {
      for (const includeCurve of curveOptions) {
        attempts.push({ compact, sizeIndex: 0, includeClosing: true, includeDecoration, includeCurve })
      }
    }
  }
  for (let sizeIndex = 1; sizeIndex < 3; sizeIndex++) {
    attempts.push({ compact: true, sizeIndex, includeClosing: true, includeDecoration: false, includeCurve: false })
  }
  for (let sizeIndex = 1; sizeIndex < 3; sizeIndex++) {
    attempts.push({ compact: true, sizeIndex, includeClosing: false, includeDecoration: false, includeCurve: false })
  }
  return attempts
}

function buildContentLayers(event: FamilyEvent, content: InvitationContent, style: AutoComposeStyle, template: InvitationTemplateMeta, attempt: ComposeAttempt): InvitationLayer[] {
  const treatment = STYLE_TREATMENT[style]
  const titleTextStyle = template.palette?.[style]?.titleTextStyle
  const layers: InvitationLayer[] = []

  layers.push({
    id: 'auto-title',
    type: 'text',
    x: 0.5,
    y: 0.5,
    rotation: 0,
    scale: 1,
    zIndex: 12,
    text: content.title,
    color: resolveRoleColor(template, style, 'title'),
    fontFamily: treatment.title.fontFamily,
    fontSize: treatment.title.fontSizeSteps[Math.min(attempt.sizeIndex, treatment.title.fontSizeSteps.length - 1)],
    bold: treatment.title.bold,
    textAlign: treatment.title.textAlign,
    ...(titleTextStyle ? { textStyle: titleTextStyle } : {}),
    ...(attempt.includeCurve && treatment.title.curveIdeal > 0 ? { curve: treatment.title.curveIdeal } : {}),
    source: { kind: 'event_field', field: 'title', valueAtInsertion: content.title },
  })

  const narrativeSource = buildNarrativeSource(event, content)
  layers.push({
    id: 'auto-body',
    type: 'event_data',
    x: 0.5,
    y: 0.5,
    rotation: 0,
    scale: 1,
    zIndex: 11,
    text: content.body,
    color: resolveRoleColor(template, style, 'body'),
    fontFamily: treatment.body.fontFamily,
    fontSize: treatment.body.fontSizeSteps[Math.min(attempt.sizeIndex, treatment.body.fontSizeSteps.length - 1)],
    bold: treatment.body.bold,
    textAlign: treatment.body.textAlign,
    ...(narrativeSource ? { source: narrativeSource } : {}),
  })

  if (attempt.includeClosing && content.closing) {
    layers.push({
      id: 'auto-closing',
      type: 'event_data',
      x: 0.5,
      y: 0.5,
      rotation: 0,
      scale: 1,
      zIndex: 10,
      text: content.closing,
      color: resolveRoleColor(template, style, 'closing'),
      fontFamily: treatment.closing.fontFamily,
      fontSize: treatment.closing.fontSizeSteps[Math.min(attempt.sizeIndex, treatment.closing.fontSizeSteps.length - 1)],
      bold: treatment.closing.bold,
      italic: treatment.closing.italic,
      textAlign: treatment.closing.textAlign,
      // Nunca lleva `source`: el cierre no es un hecho real (sección 4/35).
    })
  }

  return layers
}

interface AttemptResult {
  layers: InvitationLayer[]
  overflowed: boolean
}

function attemptOnce(content: InvitationContent, event: FamilyEvent, template: InvitationTemplateMeta, style: AutoComposeStyle, photoPath: string | undefined, measurer: TextMeasurer | undefined, attempt: ComposeAttempt): AttemptResult {
  const zones = resolveZones(template)
  const family = classifyTemplateGeometry(template)
  const imageAspect = template.imageAspect ?? 1
  const margin = attempt.compact ? ZONE_MARGIN.compact : ZONE_MARGIN.full
  const sameZone = zones.title === zones.body && zones.body === zones.closing

  let photoLayer: InvitationLayer | null = null
  // Zona de texto de partida: cuando título/cuerpo/cierre comparten zona (las 100 plantillas hoy), es esa
  // única zona; si están calibradas por separado, se usa `body` como referencia para tallar el hueco de la
  // foto (el mismo criterio de "elemento principal" que ya usaba este motor).
  let baseTextZone = sameZone ? zones.title : zones.body
  if (photoPath) {
    const shape = photoShapeForFamily(family)
    const placement = buildPhotoPlacement(shape, zones.photo, baseTextZone, imageAspect, photoPath, attempt.compact)
    photoLayer = placement.layer
    baseTextZone = placement.textZone
  }

  const contentLayers = buildContentLayers(event, content, style, template, attempt)
  let decorationLayers: InvitationLayer[] = []
  if (attempt.includeDecoration) {
    const { emoji, shape } = buildDecorationLayers(event)
    decorationLayers = [emoji, shape]
  }

  let textLayers: InvitationLayer[]
  let overflowed = false

  if (sameZone) {
    const textZone = insetZone(baseTextZone, margin)
    const result = autoArrangeLayers([...contentLayers, ...decorationLayers], textZone, imageAspect, measurer)
    textLayers = placeDecorationInZones(result.layers, zones.decoration)
    overflowed = result.overflowed
  } else {
    // Zonas por rol calibradas a mano (todavía ninguna de las 100) — cada rol se apila en su propio
    // rectángulo, de forma independiente; la decoración sigue yendo en su propia zona si existe, o se
    // apoya en la zona de cuerpo como referencia si no.
    const titleZone = photoLayer && zones.title === (sameZone ? undefined : zones.body) ? baseTextZone : zones.title
    const titleResult = autoArrangeLayers([contentLayers[0]], insetZone(titleZone, margin), imageAspect, measurer)
    const bodyResult = autoArrangeLayers([contentLayers[1], ...decorationLayers], insetZone(baseTextZone, margin), imageAspect, measurer)
    const closingLayer = contentLayers[2]
    const closingResult = closingLayer ? autoArrangeLayers([closingLayer], insetZone(zones.closing, margin), imageAspect, measurer) : { layers: [], overflowed: false }
    textLayers = [...titleResult.layers, ...placeDecorationInZones(bodyResult.layers, zones.decoration), ...closingResult.layers]
    overflowed = titleResult.overflowed || bodyResult.overflowed || closingResult.overflowed
  }

  const layers = photoLayer ? [photoLayer, ...textLayers] : textLayers
  return { layers, overflowed }
}

/**
 * Valida el resultado REAL de un intento — no "cabe matemáticamente", sino "autoArrangeLayers, con el mismo
 * TextMeasurer que usa el editor real, no reporta overflow", Y ninguna capa invade una zona prohibida
 * calibrada a mano (sección 15). El contenido (título/cuerpo) siempre está — nunca es opcional en un
 * intento — así que no hace falta comprobar que "sobrevive": por construcción, siempre está.
 */
function validateComposition(attempt: AttemptResult, template: InvitationTemplateMeta, zoneWidthFrac: number, imageAspect: number, measurer: TextMeasurer | undefined): boolean {
  if (attempt.overflowed) return false
  const forbidden = template.zones?.forbidden ?? []
  if (invadesForbiddenZone(attempt.layers, forbidden, zoneWidthFrac, imageAspect, measurer)) return false
  return true
}

// ---------------------------------------------------------------------------------------------------
// API pública del motor.
// ---------------------------------------------------------------------------------------------------
export interface AutoComposeSuccess {
  status: 'success'
  style: AutoComposeStyle
  geometryFamily: GeometryFamily
  // Presentación finalmente aceptada — para depuración/tests, nunca para decidir contenido (ver arriba).
  adaptation: ComposeAttempt
  attemptsTried: number
  layers: InvitationLayer[]
}
export interface AutoComposeFail {
  status: 'fail'
  attemptsTried: number
  reason: string
}
export type AutoComposeResult = AutoComposeSuccess | AutoComposeFail

export interface ComposeInvitationForMeParams {
  event: FamilyEvent
  template: InvitationTemplateMeta
  style: AutoComposeStyle
  // Sección 18 — ortogonal al estilo: Clásico y Divertido pueden llevar foto o no. Ausente/null = sin
  // foto, nunca un hueco vacío reservado "por si acaso" (a diferencia del "con_foto" anterior).
  photoPath?: string | null
  /** Inyectable para tests (Node, heurística por caracteres) o real (Canvas 2D en el navegador). */
  measurer?: TextMeasurer
}

/**
 * Motor determinista: mismos event/template/style/photoPath → mismo resultado siempre. Sin
 * Date.now()/Math.random()/UUID — los ids de capa son fijos por rol semántico (`auto-title`, `auto-body`,
 * `auto-closing`, `auto-photo`, `auto-decor-*`).
 *
 * Sección 23 — "Pepa, hazla por mí" CREA la invitación: redacta el contenido (buildInvitationContent, única
 * vez), la distribuye según la geometría de la plantilla, aplica Clásico/Divertido, integra la foto si se
 * dio una, y añade decoración cuando el estilo lo permite — siempre a partir de datos reales, nunca a
 * medias (ver AutoComposeFail).
 */
export function composeInvitationForMe(params: ComposeInvitationForMeParams): AutoComposeResult {
  const { event, template, style, photoPath, measurer } = params
  const content = buildInvitationContent(event)
  const geometryFamily = classifyTemplateGeometry(template)
  const attempts = buildAttemptSequence(style, geometryFamily)
  const imageAspect = template.imageAspect ?? 1
  const zoneWidthFrac = (template.zones?.title ?? template.textArea ?? DEFAULT_TEXT_AREA).width

  let tried = 0
  for (const attempt of attempts) {
    tried++
    const result = attemptOnce(content, event, template, style, photoPath ?? undefined, measurer, attempt)
    if (validateComposition(result, template, zoneWidthFrac, imageAspect, measurer)) {
      return { status: 'success', style, geometryFamily, adaptation: attempt, attemptsTried: tried, layers: result.layers }
    }
  }

  return {
    status: 'fail',
    attemptsTried: tried,
    reason: `Ninguna variante de presentación (${tried} probadas) encajó dentro de la zona real de "${template.key}" ni siquiera en tamaño mínimo y sin cierre.`,
  }
}

// ---------------------------------------------------------------------------------------------------
// Compatibilidad de estilo (secciones 17-18) — la UI la usa para mostrar un estilo desactivado ANTES de que
// el usuario lo elija y descubra que no cabe. "Compatible" significa exactamente "composeInvitationForMe
// aceptaría alguna presentación de este estilo con los datos reales de este evento" — nunca una heurística
// geométrica aparte, y nunca un `if (template.key === ...)` hardcodeado por plantilla.
// ---------------------------------------------------------------------------------------------------
export interface StyleCompatibility {
  style: AutoComposeStyle
  compatible: boolean
  reason?: string
}

const INCOMPATIBLE_STYLE_REASON: Record<AutoComposeStyle, string> = {
  clasico: 'Esta plantilla no tiene suficiente espacio para este estilo.',
  divertido: 'Esta plantilla no tiene suficiente espacio para este estilo.',
}

export interface CheckStyleCompatibilityParams {
  event: FamilyEvent
  template: InvitationTemplateMeta
  style: AutoComposeStyle
  /** Sección 18 — si se da, comprueba la compatibilidad CON esa foto; si no, sin foto. */
  photoPath?: string | null
  measurer?: TextMeasurer
}

export function checkStyleCompatibility(params: CheckStyleCompatibilityParams): StyleCompatibility {
  const result = composeInvitationForMe({ event: params.event, template: params.template, style: params.style, photoPath: params.photoPath, measurer: params.measurer })
  if (result.status === 'success') return { style: params.style, compatible: true }
  return { style: params.style, compatible: false, reason: INCOMPATIBLE_STYLE_REASON[params.style] }
}

export function checkAllStyleCompatibility(params: { event: FamilyEvent; template: InvitationTemplateMeta; photoPath?: string | null; measurer?: TextMeasurer }): StyleCompatibility[] {
  const styles: AutoComposeStyle[] = ['clasico', 'divertido']
  return styles.map((style) => checkStyleCompatibility({ ...params, style }))
}

// ---------------------------------------------------------------------------------------------------
// Plantilla propia (fondo importado por el usuario) — un InvitationTemplateMeta "sintético" con la MISMA
// forma que cualquier plantilla real para que classifyTemplateGeometry/composeInvitationForMe la traten
// exactamente igual. Nunca se guarda en el catálogo ni se muestra junto a las 100 plantillas reales.
// ---------------------------------------------------------------------------------------------------
export const CUSTOM_TEMPLATE_KEY = '__custom__'

export function buildCustomTemplateMeta(textArea: SafeZone): InvitationTemplateMeta {
  return {
    key: CUSTOM_TEMPLATE_KEY,
    label: 'Plantilla propia',
    gradient: '',
    text: '#ffffff',
    artKey: '',
    // Sin plantilla oficial no hay un imageAspect real conocido, así que se asume 1 — nunca se inventa una
    // medida de la imagen real.
    imageAspect: 1,
    textArea,
  }
}

// ---------------------------------------------------------------------------------------------------
// Seguimiento de datos del evento — capas "event_field" (un hecho = una capa, panel manual "📋 Datos" o
// título) y "event_narrative" (el BODY redactado por PEPA, que teje varios hechos). No se guarda ninguna
// copia aparte del evento: la propia capa YA es el "valor usado en su momento".
// ---------------------------------------------------------------------------------------------------
export interface InvitationEventDataChange {
  field: Exclude<AutoComposeFieldKey, 'closing'>
  previous: string
  /** null = el dato ya no existe en el evento. */
  current: string | null
}

export function invitationHasTrackedEventData(layers: InvitationLayer[]): boolean {
  return layers.some((l) => l.source?.kind === 'event_field' || l.source?.kind === 'event_narrative')
}

export function getInvitationEventDataChanges(layers: InvitationLayer[], event: FamilyEvent): InvitationEventDataChange[] {
  const currentByField = new Map(getAvailableInvitationData(event).map((f) => [f.key, f.text]))
  const seen = new Set<string>()
  const changes: InvitationEventDataChange[] = []
  for (const layer of layers) {
    const source = layer.source
    if (!source) continue
    const fieldEntries = source.kind === 'event_field' ? [{ field: source.field, valueAtInsertion: source.valueAtInsertion }] : source.kind === 'event_narrative' ? source.fields : []
    for (const { field, valueAtInsertion } of fieldEntries) {
      if (seen.has(field)) continue
      seen.add(field)
      const current = currentByField.get(field) ?? null
      if (current !== valueAtInsertion) changes.push({ field, previous: valueAtInsertion, current })
    }
  }
  return changes
}

/**
 * Sección 11 — protege ediciones manuales. Una capa "event_field" se considera personalizada si su texto ya
 * no coincide con `valueAtInsertion`. Una capa "event_narrative" — el párrafo generado, no una sustitución
 * palabra-por-palabra — se considera personalizada si su texto ya no coincide con `bodyAtInsertion` (el
 * párrafo COMPLETO que tenía al insertarse): comparar campo a campo no bastaría, porque el usuario puede
 * haber reescrito la frase entera sin que ningún campo suelto "cambie" por sí solo.
 */
export function isInvitationLayerManuallyEdited(layer: InvitationLayer): boolean {
  const source = layer.source
  if (!source) return false
  if (source.kind === 'event_field') return layer.text !== source.valueAtInsertion
  return layer.text !== source.bodyAtInsertion
}

/**
 * Actualización SELECTIVA (sección 10, 11, 29): solo toca las capas cuyo campo está en `fieldsToUpdate`.
 *
 * Sección 11 — PRINCIPIO OBLIGATORIO: nunca sobrescribe silenciosamente una capa que el usuario editó a
 * mano (`isInvitationLayerManuallyEdited`) — PEPA puede avisar de que el dato cambió (ver
 * `getInvitationEventDataChanges`, que sigue detectándolo igual), pero no debe destruir la redacción
 * personal sin permiso explícito. (Antes de esta corrección, una capa "event_field" personalizada SÍ se
 * sobrescribía en cuanto su campo se pedía explícitamente — la UI ya evitaba pedirlo sin confirmación
 * propia, pero la función en sí no era segura por construcción; ahora lo es, en los dos sentidos: defensa
 * en profundidad.)
 *
 * Sección 10 — nunca busca/reemplaza texto dentro de una capa "event_narrative": la regenera ENTERA con
 * `buildInvitationContent(event)` (mismo generador que la creó) para que la gramática se reconstruya sola
 * cuando falta un dato que antes estaba.
 */
export function updateInvitationLayersFromEvent(layers: InvitationLayer[], event: FamilyEvent, fieldsToUpdate: readonly Exclude<AutoComposeFieldKey, 'closing'>[]): InvitationLayer[] {
  if (fieldsToUpdate.length === 0) return layers
  const fieldSet = new Set<string>(fieldsToUpdate)
  const currentByField = new Map(getAvailableInvitationData(event).map((f) => [f.key, f.text]))
  let regeneratedContent: InvitationContent | null = null

  return layers.map((l) => {
    const source = l.source
    if (!source) return l
    if (isInvitationLayerManuallyEdited(l)) return l // sección 11 — nunca en silencio.

    if (source.kind === 'event_field') {
      if (!fieldSet.has(source.field)) return l
      const current = currentByField.get(source.field)
      if (current === undefined) return l // dato eliminado del evento — no se borra aquí en silencio.
      return { ...l, text: current, source: { ...source, valueAtInsertion: current } }
    }

    // event_narrative — regenera el párrafo entero si alguno de sus campos está entre los pedidos.
    if (!source.fields.some((f) => fieldSet.has(f.field))) return l
    if (!regeneratedContent) regeneratedContent = buildInvitationContent(event)
    const newSource = buildNarrativeSource(event, regeneratedContent)
    if (!newSource) return l // el evento ya no tiene NINGÚN hecho que tejer — se deja el texto tal cual, nunca vacío.
    return { ...l, text: regeneratedContent.body, source: newSource }
  })
}

/**
 * Sección 34 — quita las capas cuyo dato real ya no existe en el evento. Solo se aplica a capas
 * "event_field" (un hecho = una capa: quitarla es correcto). Una capa "event_narrative" NUNCA se borra
 * aquí — perdería el resto de hechos que sigue teniendo; el dato que falta se resuelve regenerándola
 * (`updateInvitationLayersFromEvent`, que ya omite la cláusula del dato ausente al reconstruir la frase).
 * Solo debe llamarse tras confirmación explícita del usuario (nunca automático).
 */
export function removeInvitationLayersForRemovedFields(layers: InvitationLayer[], fieldsToRemove: readonly Exclude<AutoComposeFieldKey, 'closing'>[]): InvitationLayer[] {
  if (fieldsToRemove.length === 0) return layers
  const fieldSet = new Set<string>(fieldsToRemove)
  return layers.filter((l) => !(l.source?.kind === 'event_field' && fieldSet.has(l.source.field)))
}
