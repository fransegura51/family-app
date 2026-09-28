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
  type InvitationContent,
  type InvitationTemplateMeta,
  type InvitationVisualMood,
  type InvitationZoneTone,
  type SafeZone,
  type TextMeasurer,
} from '@/domain/events'
import type { EventType, FamilyEvent, InvitationEventFieldKey, InvitationLayer, InvitationTextAlign } from '@/domain/types'

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
  // Sección 1 (corrección real, 2026-09-28) — desplazamiento lateral controlado dentro de la zona (fracción
  // del ancho de zona; 0 = centrado, como siempre). Se aplica DESPUÉS de que autoArrangeLayers calcule la
  // posición vertical real (apilado por alto medido) — solo mueve X, nunca Y, y siempre queda acotado dentro
  // de la zona (`applyRoleOffsets` nunca puede sacar la capa de su hueco seguro).
  xOffsetFrac?: number
}

// Identidad visual (2026-09-28) — configuración de la decoración automática: el icono se ANCLA a TITLE o
// CLOSING (nunca flota suelto) y se coloca relativo a la caja REAL ya resuelta de ese elemento
// (`placeAnchoredDecoration`), probando `preferredSide` primero y los otros dos lados después; si ninguno
// cabe, se omite. Ausente en Clásico (sin decoración automática, como siempre).
interface DecorationConfig {
  anchor: 'title' | 'closing'
  preferredSide: 'right' | 'left' | 'above'
}

interface StyleTreatment {
  title: StyleRoleTreatment & { curveIdeal: number }
  body: StyleRoleTreatment
  closing: StyleRoleTreatment
  allowDecoration: boolean
  decoration?: DecorationConfig
  // Sección 1 — separación TITLE/BODY/CLOSING propia del estilo: más aire para una sensación formal
  // (Clásico), menos aire para ganar tamaño y sensación más dinámica (Divertido). Sustituye al antiguo
  // ZONE_MARGIN fijo — `marginForAttempt` sigue encogiéndolo más como paso de adaptación si hace falta.
  margin: { side: number; top: number; bottom: number }
}

// Sección 19 (corrección real, 2026-09-28) — CLÁSICO: composición ordenada y simétrica, todo centrado,
// jerarquía de tamaño moderada, separación generosa (aire = sensación formal), decoración contenida (=
// ninguna automática, igual que ya hacía "clásica" antes de este bloque). El título usa una serifa; el
// cuerpo se queda en la tipografía base, perfectamente legible; el cierre es más pequeño y en cursiva —
// diferenciado pero secundario. Sin cambios en esta revisión ("Clásico: no lo reinventes").
const CLASICO_TREATMENT: StyleTreatment = {
  title: { fontFamily: 'Georgia, serif', bold: true, fontSizeSteps: [24, 20, 16], textAlign: 'center', curveIdeal: 0, xOffsetFrac: 0 },
  body: { fontFamily: 'inherit', bold: false, fontSizeSteps: [15, 13, 11], textAlign: 'center' },
  closing: { fontFamily: 'inherit', bold: false, italic: true, fontSizeSteps: [13, 12, 11], textAlign: 'center' },
  allowDecoration: false,
  margin: { side: 0.07, top: 0.05, bottom: 0.05 },
}

// Identidad visual de Divertido (2026-09-28, revisión tras aprobación de geometría) — CAUSA de la revisión:
// con solo un tratamiento fijo (título mayor + curva + desplazamiento fijo + BODY-siempre-left + cierre
// bold), las seis plantillas de prueba quedaban casi idénticas entre sí — "cambia serif→sans, centrado→
// izquierda y cursiva→negrita", no una identidad visual real. Sustituido por 3 tratamientos completos
// (A/B/C) — la personalidad ya NO depende de una sola regla (alineación), sino de una combinación de
// tipografía/tamaño/jerarquía/color/decoración/desplazamiento, variable por plantilla:
//   A — Festivo centrado: protagonismo por TAMAÑO (título/cierre más grandes que Clásico) y un icono
//       centrado ENCIMA del título — todo lo demás centrado y simétrico, la opción más segura.
//   B — Juguetón asimétrico: título con desplazamiento lateral real (acotado al hueco libre, como ya
//       garantiza `applyRoleOffsets`) e icono al lado CONTRARIO (compensa visualmente); BODY puede ir a la
//       izquierda cuando la familia geométrica tiene ancho real de sobra (sección 2 del ajuste aprobado:
//       "left" es una posibilidad de B, no la característica que define "Divertido" — con menos ancho se
//       queda centrado, ver `buildDivertidoB`).
//   C — Celebración: el título más grande de los tres — favorece que rompa a dos líneas por el propio ajuste
//       de línea que ya existe (nunca un salto de línea artificial), sin curva (pelearía con el wrap), icono
//       encima del título, cierre el más protagonista.
// BODY usa el MISMO tamaño en las tres variantes (y el mismo que Clásico) — la lectura nunca es el elemento
// que aporta la personalidad. Márgenes iguales a las tres (el margen es propiedad del ESTILO, no de la
// variante) — mismos valores que ya estaban validados.
const DIVERTIDO_MARGIN = { side: 0.045, top: 0.025, bottom: 0.025 }
const DIVERTIDO_BODY_ROLE: StyleRoleTreatment = { fontFamily: 'inherit', bold: false, fontSizeSteps: [15, 13, 11], textAlign: 'center' }

const DIVERTIDO_A: StyleTreatment = {
  title: { fontFamily: 'inherit', bold: true, fontSizeSteps: [28, 23, 18], textAlign: 'center', curveIdeal: 10, xOffsetFrac: 0 },
  body: DIVERTIDO_BODY_ROLE,
  closing: { fontFamily: 'inherit', bold: true, fontSizeSteps: [17, 15, 13], textAlign: 'center' },
  allowDecoration: true,
  decoration: { anchor: 'title', preferredSide: 'above' },
  margin: DIVERTIDO_MARGIN,
}

// Ajuste aprobado — BODY de B es 'left' solo en familias con ancho real de sobra (1: horizontal amplia);
// en las demás familias donde B es geométricamente compatible (2: vertical amplia, la mayoría de las 100)
// se queda centrado — "si el centrado queda más limpio, debe poder permanecer centrado", decidido por la
// misma clasificación geométrica que ya existe, nunca por plantilla.
function buildDivertidoB(family: GeometryFamily): StyleTreatment {
  return {
    title: { fontFamily: 'inherit', bold: true, fontSizeSteps: [29, 24, 19], textAlign: 'center', curveIdeal: 12, xOffsetFrac: -0.06 },
    body: family === 1 ? { ...DIVERTIDO_BODY_ROLE, textAlign: 'left' } : DIVERTIDO_BODY_ROLE,
    closing: { fontFamily: 'inherit', bold: true, fontSizeSteps: [16, 14, 12], textAlign: 'center' },
    allowDecoration: true,
    decoration: { anchor: 'title', preferredSide: 'right' }, // compensa el desplazamiento hacia la izquierda del título.
    margin: DIVERTIDO_MARGIN,
  }
}

const DIVERTIDO_C: StyleTreatment = {
  title: { fontFamily: 'inherit', bold: true, fontSizeSteps: [32, 26, 20], textAlign: 'center', curveIdeal: 0, xOffsetFrac: 0 },
  body: DIVERTIDO_BODY_ROLE,
  closing: { fontFamily: 'inherit', bold: true, fontSizeSteps: [18, 16, 14], textAlign: 'center' },
  allowDecoration: true,
  decoration: { anchor: 'title', preferredSide: 'above' },
  margin: DIVERTIDO_MARGIN,
}

export type DivertidoVariant = 'A' | 'B' | 'C'

// Ajuste aprobado, punto 1 — la geometría decide QUÉ variantes son seguras en una plantilla (nunca cuál
// "queda mejor"); la variante preferida dentro de ese conjunto la decide `visualMood` (sección siguiente).
// Familias 3/4 (más estrechas, 16 plantillas): solo A. Familia 5 (estrecha y alta, 20 plantillas): A o C —
// el ancho estrecho ya favorece el ajuste a dos líneas de C sin forzar nada. Familias 1/2 (las más amplias,
// 64 plantillas): las tres.
const GEOMETRY_COMPATIBLE_DIVERTIDO_VARIANTS: Record<GeometryFamily, DivertidoVariant[]> = {
  1: ['A', 'B', 'C'],
  2: ['A', 'B', 'C'],
  3: ['A'],
  4: ['A'],
  5: ['A', 'C'],
}

// Ajuste aprobado, punto 1 — clasificación visual DECLARATIVA y pequeña (nunca un sistema de reglas grande,
// nunca IA): qué variante prefiere cada estado de ánimo, dentro de lo que la geometría ya permite.
const MOOD_VARIANT_PREFERENCE: Record<InvitationVisualMood, DivertidoVariant[]> = {
  elegant: ['A', 'C', 'B'],
  festive: ['B', 'C', 'A'],
  playful: ['C', 'B', 'A'],
  soft: ['A', 'C', 'B'],
}

// "visualMood + tipo de evento" (ajuste aprobado, punto 1) — `template.visualMood` manda cuando la
// plantilla lo calibra (por ahora, `cumpleanos_elegante`/`clasico`/`alegre`, ver domain/events.ts); para las
// 97 restantes (todavía sin calibrar), el tipo de evento da un ánimo por defecto razonable en vez de uno
// fijo para las 100 — tabla pequeña, determinista, nunca aleatoria.
const EVENT_TYPE_MOOD_HINT: Record<EventType, InvitationVisualMood> = {
  boda: 'elegant',
  comunion: 'elegant',
  bautizo: 'soft',
  cumpleanos: 'playful',
  celebracion: 'festive',
  personalizado: 'festive',
}
const DEFAULT_VISUAL_MOOD: InvitationVisualMood = 'festive'

function resolveVisualMood(template: InvitationTemplateMeta, event: Pick<FamilyEvent, 'type'>): InvitationVisualMood {
  return template.visualMood ?? EVENT_TYPE_MOOD_HINT[event.type] ?? DEFAULT_VISUAL_MOOD
}

/**
 * Ajuste aprobado, punto 1 — geometría filtra ("¿qué cabe sin romper la invitación?"), visualMood+evento
 * elige la preferida dentro de lo compatible ("¿qué estilo queda mejor?"). Determinista: mismos
 * template/event → misma variante siempre. Nunca `Math.random()`, nunca un `if (template.key === ...)`.
 */
export function resolveDivertidoVariant(template: InvitationTemplateMeta, event: Pick<FamilyEvent, 'type'>): DivertidoVariant {
  const compatible = GEOMETRY_COMPATIBLE_DIVERTIDO_VARIANTS[classifyTemplateGeometry(template)]
  const mood = resolveVisualMood(template, event)
  return MOOD_VARIANT_PREFERENCE[mood].find((v) => compatible.includes(v)) ?? 'A'
}

function buildDivertidoTreatment(variant: DivertidoVariant, family: GeometryFamily): StyleTreatment {
  if (variant === 'A') return DIVERTIDO_A
  if (variant === 'B') return buildDivertidoB(family)
  return DIVERTIDO_C
}

/** Única función que resuelve QUÉ tratamiento usa un intento — exportada también para pruebas de geometría
 * (ver invitationAutoCompose.test.ts), que necesitan la MISMA zona efectiva que usó el motor. */
export function resolveStyleTreatment(style: AutoComposeStyle, template: InvitationTemplateMeta, event: Pick<FamilyEvent, 'type'>): StyleTreatment {
  if (style === 'clasico') return CLASICO_TREATMENT
  return buildDivertidoTreatment(resolveDivertidoVariant(template, event), classifyTemplateGeometry(template))
}

// ---------------------------------------------------------------------------------------------------
// Sección 3-7 (corrección real, 2026-09-28) — "color inteligente" con contraste OBLIGATORIO. Causa del bug
// real encontrado en pruebas visuales: el color por defecto (`template.text`) se aplicaba tal cual a
// TITLE/BODY/CLOSING sin comprobar nada — un dorado pensado para verse bien contra el `gradient` general de
// una plantilla negro/dorado resultaba casi ilegible sobre el panel crema real donde cae `textArea` (el
// gradient describe el aspecto general de la tarjeta, NUNCA el fondo real de la zona de escritura — no son
// lo mismo). Ahora todo candidato de color (el de la plantilla o un futuro override de `palette`) debe
// superar un contraste mínimo contra el TONO DE ZONA resuelto antes de usarse; si no lo supera, se cae a un
// neutro de alta legibilidad para ese tono. Legibilidad > armonía de color, siempre.
// ---------------------------------------------------------------------------------------------------

// Contraste WCAG estándar (luminancia relativa + ratio) — determinista, sin dependencias nuevas.
function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

function contrastRatio(hexA: string, hexB: string): number {
  const a = hexToRgb(hexA)
  const b = hexToRgb(hexB)
  if (!a || !b) return 1 // sin poder calcularlo, se trata como "sin contraste" — nunca se arriesga.
  const [lLight, lDark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (lLight + 0.05) / (lDark + 0.05)
}

// Umbral mínimo por rol (sección 4, 7): BODY y CLOSING son texto corrido, exigen el umbral AA completo
// (4.5:1) — BODY nunca puede ser menos legible por "combinar" mejor. TITLE es texto grande/negrita, admite
// el umbral AA reducido para texto grande (3:1, mismo criterio que WCAG) — puede ser más expresivo.
const CONTRAST_THRESHOLD: Record<'title' | 'body' | 'closing', number> = { title: 3, body: 4.5, closing: 4.5 }

// Sección 5-6 — el contraste se mide contra un color de referencia REPRESENTATIVO del tono de zona resuelto
// (nunca contra `gradient`, nunca contra un píxel real — no hay análisis de imagen). No pretende ser el
// color exacto del fondo real: solo sirve para decidir, de forma conservadora, si un candidato tiene margen
// de sobra o no. El neutro de fallback es el color que se usa cuando ningún candidato supera el umbral.
const ZONE_REFERENCE_COLOR: Record<InvitationZoneTone, string> = { light: '#F5F1E8', dark: '#1A1A1A' }
const SAFE_NEUTRAL_COLOR: Record<InvitationZoneTone, string> = { light: '#22242B', dark: '#FBF8F2' }

// Sección 6 — fallback CONSERVADOR y documentado cuando la plantilla no calibra `zoneTone` (ninguna de las
// 100 lo hace todavía): 'light' fijo para TODAS, nunca derivado de `gradient` ni de `text` (el propio
// diagnóstico probó que ambos pueden estar pensados para el aspecto general de la tarjeta, no para el panel
// real de la zona de escritura — usarlos como pista, aunque fuera "débil", habría reproducido exactamente el
// mismo bug en la plantilla que lo disparó). No es una suposición por plantilla: es la MISMA suposición para
// las 100, hasta que cada una calibre su propio `zoneTone` — momento en el que este fallback deja de
// aplicarle. Con `zoneTone: 'light'`, el neutro de seguridad es oscuro (`SAFE_NEUTRAL_COLOR.light`).
const DEFAULT_ZONE_TONE: InvitationZoneTone = 'light'

function resolveZoneTone(template: InvitationTemplateMeta, role: 'title' | 'body' | 'closing'): InvitationZoneTone {
  const palette = template.palette
  const roleTone = role === 'title' ? palette?.titleTone : role === 'body' ? palette?.bodyTone : palette?.closingTone
  return roleTone ?? palette?.zoneTone ?? DEFAULT_ZONE_TONE
}

// Sección 21, refinada 2026-09-28 (punto 13 del mandato de geometría segura) — "color inteligente" con
// prioridad EXPLÍCITA por rol, ya no uniforme: BODY es el texto corrido que se lee de verdad, así que recibe
// SIEMPRE el neutro seguro de máximo contraste — nunca se prueba un acento en BODY, ni siquiera si pasara el
// umbral (evita el "todo negro por sistema" Y el "acento poco fiable" a la vez: una sola regla, sin
// excepciones, para el rol que más importa leer bien). TITLE y CLOSING sí pueden lucir un acento de la
// plantilla (`template.text` o un futuro override de `palette`) — pero solo si ese candidato supera el
// umbral de contraste contra el tono de zona resuelto; si no lo supera, caen al mismo neutro seguro.
// Legibilidad > armonía de color, siempre — nunca se inventa un color nuevo, solo se acepta o se descarta el
// que ya existe.
function resolveRoleColor(template: InvitationTemplateMeta, style: AutoComposeStyle, role: 'title' | 'body' | 'closing'): string {
  const tone = resolveZoneTone(template, role)
  if (role === 'body') return SAFE_NEUTRAL_COLOR[tone]
  const override = template.palette?.[style]
  const candidate = (role === 'title' ? override?.titleColor : override?.closingColor) ?? template.text
  if (candidate && contrastRatio(candidate, ZONE_REFERENCE_COLOR[tone]) >= CONTRAST_THRESHOLD[role]) return candidate
  return SAFE_NEUTRAL_COLOR[tone]
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

export function resolveZones(template: InvitationTemplateMeta): ResolvedZones {
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

// Márgenes internos de zona (sección 1, 12) — la composición nunca usa el 100% del rectángulo disponible.
// El margen BASE es propio del tratamiento resuelto (`treatment.margin` — más aire en Clásico, menos en
// Divertido, igual en las 3 variantes A/B/C); la variante compacta lo encoge más todavía para ganar la
// altura que necesita el contenido — un paso de adaptación más, antes de encoger la letra (ver
// `buildAttemptSequence`).
function marginForAttempt(treatment: StyleTreatment, compact: boolean): { side: number; top: number; bottom: number } {
  const base = treatment.margin
  if (!compact) return base
  return { side: base.side * 0.6, top: base.top * 0.5, bottom: base.bottom * 0.5 }
}

function insetZone(zone: SafeZone, margin: { side: number; top: number; bottom: number }): SafeZone {
  return {
    x: zone.x + zone.width * margin.side,
    y: zone.y + zone.height * margin.top,
    width: zone.width * (1 - 2 * margin.side),
    height: zone.height * (1 - margin.top - margin.bottom),
  }
}

// Geometría segura (2026-09-28) — ÚNICA función que decide "zona efectiva" (rectángulo real de trabajo, ya
// con el margen interior de seguridad aplicado) para un rol, en TODO el motor: apilado (autoArrangeLayers),
// desplazamiento lateral (applyRoleOffsets), validación final (contentLayersFitZones) y zona prohibida
// (invadesForbiddenZone) parten SIEMPRE de aquí — nunca cada uno calcula su propio inset por su cuenta. El
// WYSIWYG (InvitationDesigner.tsx) NO vuelve a ejecutar esta función: en vez de eso, cada capa generada por
// este motor lleva grabado el ancho resultante (`InvitationLayer.zoneWidthFrac`, ver `stampZoneWidths` más
// abajo) para que ambos usen literalmente el mismo número, no una segunda fórmula que pueda divergir con el
// tiempo. Una capa SIN ese campo (toda invitación guardada antes de este cambio) sigue usando el cálculo
// heredado en el renderer — compatibilidad explícita, ver InvitationLayer.zoneWidthFrac en domain/types.ts.
export function resolveEffectiveZone(baseZone: SafeZone, treatment: StyleTreatment, compact: boolean): SafeZone {
  return insetZone(baseZone, marginForAttempt(treatment, compact))
}

// Geometría segura (2026-09-28) — tolerancia de PUNTO FLOTANTE/REDONDEO DE PÍXEL, no de diseño: separa "cabe
// exactamente" de "no cabe por un error de la propia aritmética" — en concreto, el tamaño de una foto se
// GUARDA como entero de píxeles (`Math.round`, ver `photoSizeForFraction`) porque así lo necesita el
// renderer; volver a expresar ese entero como fracción de zona introduce un desajuste de hasta medio píxel
// frente al valor sin redondear. Se fija en 1px sobre el lado más corto del lienzo asumido (nunca un margen
// de maniobra real ni una licencia de diseño).
const GEOMETRY_EPS = 1 / ASSUMED_CANVAS_SIZE_PX

function boxesOverlapRect(cx: number, cy: number, halfW: number, halfH: number, rect: SafeZone): boolean {
  return cx - halfW < rect.x + rect.width && cx + halfW > rect.x && cy - halfH < rect.y + rect.height && cy + halfH > rect.y
}

// Rol semántico de una capa generada por este motor a partir de su id fijo — usado para elegir, capa a
// capa, cuál de las tres zonas efectivas (title/body/closing) le corresponde. `null` para cualquier capa sin
// rol (foto, decoración, emoji) — esas no participan en la validación por rol.
function contentRoleOf(layer: InvitationLayer): 'title' | 'body' | 'closing' | null {
  if (layer.id === 'auto-title') return 'title'
  if (layer.id === 'auto-body') return 'body'
  if (layer.id === 'auto-closing') return 'closing'
  return null
}

// Sección 15 — zonas prohibidas: si la plantilla no las calibra (ninguna de las 100 lo hace todavía), esta
// comprobación siempre da `false` (comportamiento de siempre, sin regresión). Cuando existan, una capa que
// invade una zona con ilustración importante hace fallar el intento (nunca la reposiciona con heurísticas
// de imagen — sección 15, "no análisis de imagen complejo en esta fase"). Cada capa se mide con el ancho de
// SU PROPIA zona efectiva (título/cuerpo/cierre pueden tener anchos distintos, p. ej. `alegre`); una capa
// sin rol (foto/decoración) usa `genericWidthFrac` como aproximación razonable.
function invadesForbiddenZone(layers: InvitationLayer[], forbidden: SafeZone[], zonesByRole: Record<'title' | 'body' | 'closing', SafeZone>, genericWidthFrac: number, imageAspect: number, measurer?: TextMeasurer): boolean {
  if (forbidden.length === 0) return false
  for (const l of layers) {
    const role = contentRoleOf(l)
    const widthFrac = role ? zonesByRole[role].width : genericWidthFrac
    const box = estimateLayerBoxFraction(l, widthFrac, imageAspect, measurer)
    for (const rect of forbidden) {
      if (boxesOverlapRect(l.x, l.y, box.halfWidth, box.halfHeight, rect)) return true
    }
  }
  return false
}

// Geometría segura (2026-09-28), punto 2/16 del mandato — validación OBLIGATORIA de caja completa: no basta
// con que el CENTRO de una capa esté dentro de su zona (eso es lo que efectivamente comprobaba el sistema
// antes de este cambio, vía `autoArrangeLayers`/`applyRoleOffsets`) — hace falta que los CUATRO bordes
// (izquierdo/derecho/arriba/abajo) de su caja real, YA con fuente/tamaño/negrita/cursiva/curva/ajuste de
// línea/alineación/desplazamiento/posición final aplicados, queden dentro de su zona efectiva. Tolerancia
// SOLO de punto flotante (`GEOMETRY_EPS`) — nunca de diseño. Se ejecuta sobre el resultado YA terminado de un
// intento, como último cerrojo antes de aceptarlo (ver `validateComposition`).
export function layerBoundsWithinZone(layer: InvitationLayer, zone: SafeZone, imageAspect: number, measurer: TextMeasurer | undefined): boolean {
  const box = estimateLayerBoxFraction(layer, zone.width, imageAspect, measurer)
  const left = layer.x - box.halfWidth
  const right = layer.x + box.halfWidth
  const top = layer.y - box.halfHeight
  const bottom = layer.y + box.halfHeight
  return left >= zone.x - GEOMETRY_EPS && right <= zone.x + zone.width + GEOMETRY_EPS && top >= zone.y - GEOMETRY_EPS && bottom <= zone.y + zone.height + GEOMETRY_EPS
}

// TITLE/BODY/CLOSING (punto 2 del mandato) — cada capa con rol contra SU PROPIA zona efectiva. Una capa sin
// rol (decoración/emoji) queda fuera de esta comprobación a propósito (sección 2, ya tiene su propia lógica
// de "cabe o se omite" en `placeEmojiBesideTitle`).
function contentLayersFitZones(layers: InvitationLayer[], zonesByRole: Record<'title' | 'body' | 'closing', SafeZone>, imageAspect: number, measurer: TextMeasurer | undefined): boolean {
  for (const l of layers) {
    const role = contentRoleOf(l)
    if (!role) continue
    if (!layerBoundsWithinZone(l, zonesByRole[role], imageAspect, measurer)) return false
  }
  return true
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
  // Geometría segura, punto 2 — el rectángulo REAL dentro del que se colocó la foto (la zona explícita, o el
  // sub-rectángulo tallado del textZone) — permite a `validateComposition` comprobar que la foto (igual que
  // TITLE/BODY/CLOSING) también respeta su propia zona, en vez de asumirlo solo "por construcción".
  photoZone: SafeZone
}

function buildPhotoPlacement(shape: 'rect' | 'circle', explicitZone: SafeZone | undefined, textZone: SafeZone, imageAspect: number, photoPath: string, compact: boolean): PhotoPlacement {
  if (explicitZone) {
    const cx = explicitZone.x + explicitZone.width / 2
    const cy = explicitZone.y + explicitZone.height / 2
    const size = photoSizeForFraction(explicitZone.width, explicitZone.height, imageAspect)
    const layer: InvitationLayer = { id: 'auto-photo', type: 'photo', x: cx, y: cy, rotation: 0, scale: 1, zIndex: 1, photoPath, photoMask: shape === 'circle' ? 'circle' : 'none', fontSize: size }
    return { layer, textZone, photoZone: explicitZone }
  }
  const zone = textZone
  if (shape === 'rect') {
    const heightFrac = PHOTO_RECT_HEIGHT_FRAC[compact ? 'compact' : 'full']
    // Geometría segura (2026-09-28) — corrección de unidades: `heightFrac` es una fracción DE `zone.height`
    // (así se usa unas líneas más abajo para posicionar y para tallar `textTop`), pero el tamaño se calculaba
    // con `heightFrac` como fracción del CANVAS COMPLETO (sin multiplicar por `zone.height`) — inconsistente
    // con el propio posicionamiento y con la rama 'circle' de aquí abajo, que sí multiplica por `zone.height`.
    // Con esa unidad equivocada, el tamaño calculado podía superar el hueco real reservado para la foto
    // (`photoZone`), invadiendo la banda de texto — causa real del solape foto/texto detectado por la nueva
    // validación de caja completa (punto 2 del mandato de geometría segura), no un falso positivo de la
    // validación.
    const size = photoSizeForFraction(zone.width, heightFrac * zone.height, imageAspect)
    const cx = zone.x + zone.width / 2
    const photoCenterYFrac = heightFrac / 2
    const layer: InvitationLayer = { id: 'auto-photo', type: 'photo', x: cx, y: zone.y + zone.height * photoCenterYFrac, rotation: 0, scale: 1, zIndex: 1, photoPath, photoMask: 'none', fontSize: size }
    const textTop = zone.y + zone.height * (heightFrac + PHOTO_GAP_FRAC)
    const photoZone: SafeZone = { x: zone.x, y: zone.y, width: zone.width, height: zone.height * heightFrac }
    return { layer, textZone: { x: zone.x, y: textTop, width: zone.width, height: zone.y + zone.height - textTop }, photoZone }
  }
  const diameterFrac = PHOTO_CIRCLE_DIAMETER_FRAC[compact ? 'compact' : 'full']
  const size = photoSizeForFraction(diameterFrac * zone.width, diameterFrac * zone.height, imageAspect)
  const heightFracReal = size / assumedCanvasHeightPx(imageAspect) / zone.height
  const cx = zone.x + zone.width / 2
  const layer: InvitationLayer = { id: 'auto-photo', type: 'photo', x: cx, y: zone.y + (heightFracReal * zone.height) / 2, rotation: 0, scale: 1, zIndex: 1, photoPath, photoMask: 'circle', fontSize: size }
  const textTop = zone.y + zone.height * (heightFracReal + PHOTO_GAP_FRAC)
  const photoZone: SafeZone = { x: zone.x, y: zone.y, width: zone.width, height: zone.height * heightFracReal }
  return { layer, textZone: { x: zone.x, y: textTop, width: zone.width, height: zone.y + zone.height - textTop }, photoZone }
}

// Identidad visual (2026-09-28) — decoración automática reducida a UN solo icono, el mismo catálogo por
// tipo de evento que antes (nunca se inventa una asociación nueva). Ya NO se genera la forma/confeti
// translúcida (`auto-decor-shape`): se apilaba sin ninguna posición intencional junto a título/cuerpo/cierre
// (nunca anclada a nada) — exactamente la sensación de "algo flotando sin querer" que se pidió eliminar.
// Sigue disponible como herramienta manual ("◆ Forma"), sin tocar. "Máximo 2, normalmente 1 bastará" — con
// el icono anclado (`placeAnchoredDecoration`), 1 es suficiente en las tres variantes de Divertido.
function buildDecorationLayers(event: Pick<FamilyEvent, 'type'>): { emoji: InvitationLayer } {
  const icon = EVENT_TYPE_META[event.type].icon
  return { emoji: { id: 'auto-decor-emoji', type: 'emoji', x: 0.5, y: 0.5, rotation: 0, scale: 1, zIndex: 1, text: icon, fontSize: 40 } }
}

function placeDecorationInZones(layers: InvitationLayer[], decorationZones: SafeZone[]): InvitationLayer[] {
  if (decorationZones.length === 0) return layers
  let i = 0
  return layers.map((l) => {
    if (l.id !== 'auto-decor-emoji') return l
    const zone = decorationZones[i % decorationZones.length]
    i++
    return { ...l, x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 }
  })
}

interface RoleOffsetResult {
  layers: InvitationLayer[]
  // Geometría segura, punto 3 — `false` en cuanto CUALQUIER capa con rol (title/body/closing) mide más que
  // su propia zona (título/cuerpo/cierre), en cualquier dimensión — p. ej. un título curvado cuya caja real
  // es más ancha que la zona disponible (causa raíz nº2 del bug original: el clamp `Math.min(maxX,
  // Math.max(minX, targetX))` con `minX > maxX` SIEMPRE devolvía `maxX`, una posición pegada a un borde que
  // garantizaba invasión por el otro lado, sin ninguna señal de que eso había pasado). Esta función ya NUNCA
  // resuelve ese caso con una posición: lo señala como fallo del intento completo, para que
  // `buildAttemptSequence` pruebe la siguiente variante (menos tamaño, sin curva...) — "nunca aceptar
  // overflow silenciosamente".
  fits: boolean
}

// Sección 1 (corrección real), redefinida 2026-09-28 (punto 3-4 del mandato de geometría segura) — desplaza
// X de un rol dentro de su zona, según `xOffsetFrac` del estilo — nunca Y (la posición vertical la sigue
// decidiendo el apilado por alto real de autoArrangeLayers, sin tocar). El desplazamiento se acota al
// MOVIMIENTO HORIZONTAL REALMENTE LIBRE — `zone.width - measuredBox.width` — nunca a una fracción fija del
// ancho de zona: una capa que ya ocupa casi todo el ancho útil recibe, correctamente, un desplazamiento casi
// nulo (la personalidad del estilo nunca tiene prioridad sobre la geometría). Antes de desplazar nada,
// comprueba que la caja real de la capa cabe siquiera CENTRADA en su zona (ancho y alto) — si no cabe, no
// hay ninguna posición válida que "clampear": se señala como fallo (ver `RoleOffsetResult.fits`) en vez de
// devolver una posición pegada a un borde que garantiza invadir el lado opuesto.
function applyRoleOffsets(layers: InvitationLayer[], treatment: StyleTreatment, zone: SafeZone, imageAspect: number, measurer: TextMeasurer | undefined): RoleOffsetResult {
  const roleTreatmentById: Record<string, StyleRoleTreatment> = { 'auto-title': treatment.title, 'auto-body': treatment.body, 'auto-closing': treatment.closing }
  let fits = true
  const outLayers = layers.map((l) => {
    const role = contentRoleOf(l)
    if (!role) return l // sin rol (decoración/emoji) — fuera del alcance de esta validación, ver punto 2.
    const box = estimateLayerBoxFraction(l, zone.width, imageAspect, measurer)
    if (box.halfWidth * 2 > zone.width + GEOMETRY_EPS || box.halfHeight * 2 > zone.height + GEOMETRY_EPS) {
      fits = false
      return l
    }
    const offsetFrac = roleTreatmentById[l.id]?.xOffsetFrac
    if (!offsetFrac) return l
    const zoneCenterX = zone.x + zone.width / 2
    const freeHalf = zone.width / 2 - box.halfWidth // >= 0, garantizado por la comprobación anterior.
    const desiredShift = offsetFrac * zone.width
    const clampedShift = Math.max(-freeHalf, Math.min(freeHalf, desiredShift))
    return { ...l, x: zoneCenterX + clampedShift }
  })
  return { layers: outLayers, fits }
}

const DECORATION_SIDE_FALLBACK: Record<DecorationConfig['preferredSide'], DecorationConfig['preferredSide'][]> = {
  above: ['above', 'right', 'left'],
  right: ['right', 'left', 'above'],
  left: ['left', 'right', 'above'],
}

function decorationCandidatePosition(side: DecorationConfig['preferredSide'], anchorLayer: InvitationLayer, anchorBox: { halfWidth: number; halfHeight: number }, decoBox: { halfWidth: number; halfHeight: number }, gap: number): { x: number; y: number } {
  if (side === 'right') return { x: anchorLayer.x + anchorBox.halfWidth + gap + decoBox.halfWidth, y: anchorLayer.y }
  if (side === 'left') return { x: anchorLayer.x - anchorBox.halfWidth - gap - decoBox.halfWidth, y: anchorLayer.y }
  return { x: anchorLayer.x, y: anchorLayer.y - anchorBox.halfHeight - gap - decoBox.halfHeight } // 'above'
}

// Sección 2, redefinida 2026-09-28 (identidad visual Divertido) — el icono decorativo automático se ANCLA a
// TITLE o CLOSING (`treatment.decoration.anchor`, nunca flota suelto): se calcula desde la caja REAL ya
// resuelta del elemento ancla (tras apilado/curva/desplazamiento/tamaño final), probando el lado preferido
// del tratamiento y, si no cabe, los otros dos, en ese orden; si ninguno cabe dentro de la zona del ancla,
// se omite del todo — "si empeora el diseño o no existe una ubicación segura, es preferible no ponerlo"
// (nunca invade, nunca se fuerza). Generaliza `placeEmojiBesideTitle` (derecha→izquierda→omitir) a 3 lados
// y a poder anclarse también a CLOSING. Solo se llama cuando el tratamiento lo permite
// (`treatment.decoration`) y no hay `zones.decoration` calibradas a mano (esas tienen prioridad — ver
// `attemptOnce`).
function placeAnchoredDecoration(layers: InvitationLayer[], decoration: DecorationConfig | undefined, zonesByRole: Record<'title' | 'body' | 'closing', SafeZone>, imageAspect: number, measurer: TextMeasurer | undefined): InvitationLayer[] {
  if (!decoration) return layers
  const anchorLayer = layers.find((l) => l.id === `auto-${decoration.anchor}`)
  const emoji = layers.find((l) => l.id === 'auto-decor-emoji')
  if (!anchorLayer || !emoji) return layers
  const zone = zonesByRole[decoration.anchor]
  const anchorBox = estimateLayerBoxFraction(anchorLayer, zone.width, imageAspect, measurer)
  const emojiBox = estimateLayerBoxFraction(emoji, zone.width, imageAspect, measurer)
  const gap = 0.02
  for (const side of DECORATION_SIDE_FALLBACK[decoration.preferredSide]) {
    const { x, y } = decorationCandidatePosition(side, anchorLayer, anchorBox, emojiBox, gap)
    if (layerBoundsWithinZone({ ...emoji, x, y }, zone, imageAspect, measurer)) {
      return layers.map((l) => (l.id === 'auto-decor-emoji' ? { ...l, x, y } : l))
    }
  }
  return layers.filter((l) => l.id !== 'auto-decor-emoji') // sin hueco seguro en ningún lado — se omite (sección 2).
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
function buildAttemptSequence(treatment: StyleTreatment, family: GeometryFamily): ComposeAttempt[] {
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

function buildContentLayers(event: FamilyEvent, content: InvitationContent, style: AutoComposeStyle, treatment: StyleTreatment, template: InvitationTemplateMeta, attempt: ComposeAttempt): InvitationLayer[] {
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
  // Geometría segura, punto 3 — `false` en cuanto `applyRoleOffsets` detecta una capa con rol cuya caja real
  // no cabe, ni siquiera centrada, en su zona efectiva (p. ej. un título curvado más ancho que la zona).
  fits: boolean
  // Geometría segura, punto 6/9 — la MISMA zona efectiva (título/cuerpo/cierre) usada para apilar y
  // desplazar estas capas; se reutiliza tal cual para la validación final (`contentLayersFitZones`) y para
  // grabar `zoneWidthFrac` en cada capa (`stampZoneWidths`) — una única fuente, nunca recalculada aparte.
  zonesByRole: Record<'title' | 'body' | 'closing', SafeZone>
  photoZone?: SafeZone
}

// Geometría segura, punto 6/9 — graba en cada capa generada el rol y el ancho de zona EFECTIVO (ya con el
// margen de seguridad aplicado) que realmente se usó para calcularla. Puente de compatibilidad (ver
// InvitationLayer.zoneWidthFrac, domain/types.ts): el renderer WYSIWYG usa este valor tal cual cuando existe
// y cae a su cálculo heredado cuando falta — así ninguna invitación guardada antes de este cambio cambia de
// aspecto, y las nuevas quedan garantizadas a usar exactamente la misma zona que este motor.
function stampZoneWidths(layers: InvitationLayer[], zonesByRole: Record<'title' | 'body' | 'closing', SafeZone>): InvitationLayer[] {
  return layers.map((l) => {
    const role = contentRoleOf(l)
    if (!role) return l
    return { ...l, zoneRole: role, zoneWidthFrac: zonesByRole[role].width }
  })
}

function attemptOnce(content: InvitationContent, event: FamilyEvent, template: InvitationTemplateMeta, style: AutoComposeStyle, treatment: StyleTreatment, photoPath: string | undefined, measurer: TextMeasurer | undefined, attempt: ComposeAttempt): AttemptResult {
  const zones = resolveZones(template)
  const family = classifyTemplateGeometry(template)
  const imageAspect = template.imageAspect ?? 1
  const sameZone = zones.title === zones.body && zones.body === zones.closing

  let photoLayer: InvitationLayer | null = null
  let photoZone: SafeZone | undefined
  // Zona de texto de partida: cuando título/cuerpo/cierre comparten zona (las 100 plantillas hoy), es esa
  // única zona; si están calibradas por separado, se usa `body` como referencia para tallar el hueco de la
  // foto (el mismo criterio de "elemento principal" que ya usaba este motor).
  let baseTextZone = sameZone ? zones.title : zones.body
  if (photoPath) {
    const shape = photoShapeForFamily(family)
    const placement = buildPhotoPlacement(shape, zones.photo, baseTextZone, imageAspect, photoPath, attempt.compact)
    photoLayer = placement.layer
    baseTextZone = placement.textZone
    photoZone = placement.photoZone
  }

  const contentLayers = buildContentLayers(event, content, style, treatment, template, attempt)
  let decorationLayers: InvitationLayer[] = []
  if (attempt.includeDecoration) {
    decorationLayers = [buildDecorationLayers(event).emoji]
  }

  let textLayers: InvitationLayer[]
  let overflowed = false
  let fits = true
  let zonesByRole: Record<'title' | 'body' | 'closing', SafeZone>

  // Sección 1-2 (corrección real) — tras el apilado vertical de autoArrangeLayers (sin tocar), dos pasadas
  // de composición propias del estilo: desplazamiento lateral por rol (`applyRoleOffsets`) y, si el
  // tratamiento integra un icono anclado (`treatment.decoration`) y la plantilla no calibra
  // `zones.decoration` a mano (esas tienen prioridad — respetan la decisión explícita del autor de la
  // plantilla), reubicarlo junto a su ancla en vez de dejarlo flotando aparte.
  if (sameZone) {
    const textZone = resolveEffectiveZone(baseTextZone, treatment, attempt.compact)
    zonesByRole = { title: textZone, body: textZone, closing: textZone }
    const result = autoArrangeLayers([...contentLayers, ...decorationLayers], textZone, imageAspect, measurer)
    const offsetResult = applyRoleOffsets(result.layers, treatment, textZone, imageAspect, measurer)
    fits = offsetResult.fits
    let arranged = placeDecorationInZones(offsetResult.layers, zones.decoration)
    if (attempt.includeDecoration && treatment.decoration && zones.decoration.length === 0) {
      arranged = placeAnchoredDecoration(arranged, treatment.decoration, zonesByRole, imageAspect, measurer)
    }
    textLayers = arranged
    overflowed = result.overflowed
  } else {
    // Zonas por rol calibradas a mano (`alegre`/`clasico`/`cumpleanos_elegante`) — cada rol se apila en su
    // propio rectángulo, de forma independiente; la decoración sigue yendo en su propia zona si existe, o se
    // apoya en la zona de cuerpo como referencia si no.
    const titleZone = photoLayer && zones.title === zones.body ? baseTextZone : zones.title
    const titleInset = resolveEffectiveZone(titleZone, treatment, attempt.compact)
    const bodyInset = resolveEffectiveZone(baseTextZone, treatment, attempt.compact)
    const closingInset = resolveEffectiveZone(zones.closing, treatment, attempt.compact)
    zonesByRole = { title: titleInset, body: bodyInset, closing: closingInset }
    const titleResult = autoArrangeLayers([contentLayers[0]], titleInset, imageAspect, measurer)
    const bodyResult = autoArrangeLayers([contentLayers[1], ...decorationLayers], bodyInset, imageAspect, measurer)
    const closingLayer = contentLayers[2]
    const closingResult = closingLayer ? autoArrangeLayers([closingLayer], closingInset, imageAspect, measurer) : { layers: [], overflowed: false }
    const titleOffset = applyRoleOffsets(titleResult.layers, treatment, titleInset, imageAspect, measurer)
    const bodyOffset = applyRoleOffsets(bodyResult.layers, treatment, bodyInset, imageAspect, measurer)
    const closingOffset = applyRoleOffsets(closingResult.layers, treatment, closingInset, imageAspect, measurer)
    fits = titleOffset.fits && bodyOffset.fits && closingOffset.fits
    const bodyLayers = placeDecorationInZones(bodyOffset.layers, zones.decoration)
    let combined = [...titleOffset.layers, ...bodyLayers, ...closingOffset.layers]
    if (attempt.includeDecoration && treatment.decoration && zones.decoration.length === 0) {
      combined = placeAnchoredDecoration(combined, treatment.decoration, zonesByRole, imageAspect, measurer)
    }
    textLayers = combined
    overflowed = titleResult.overflowed || bodyResult.overflowed || closingResult.overflowed
  }

  textLayers = stampZoneWidths(textLayers, zonesByRole)
  const layers = photoLayer ? [photoLayer, ...textLayers] : textLayers
  return { layers, overflowed, fits, zonesByRole, photoZone }
}

/**
 * Valida el resultado REAL de un intento — no "cabe matemáticamente", sino "autoArrangeLayers, con el mismo
 * TextMeasurer que usa el editor real, no reporta overflow"; que `applyRoleOffsets` no haya encontrado
 * ninguna caja degenerada (`attempt.fits`); que TITLE/BODY/CLOSING/PHOTO, YA con todos los tratamientos
 * aplicados, quepan por completo (los cuatro bordes, no solo el centro) dentro de su zona efectiva
 * (`contentLayersFitZones`/`layerBoundsWithinZone`, punto 2/16 del mandato de geometría segura); y que
 * ninguna capa invada una zona prohibida calibrada a mano (sección 15). El contenido (título/cuerpo) siempre
 * está — nunca es opcional en un intento — así que no hace falta comprobar que "sobrevive": por
 * construcción, siempre está.
 */
function validateComposition(attempt: AttemptResult, template: InvitationTemplateMeta, imageAspect: number, measurer: TextMeasurer | undefined): boolean {
  if (attempt.overflowed) return false
  if (!attempt.fits) return false
  if (!contentLayersFitZones(attempt.layers, attempt.zonesByRole, imageAspect, measurer)) return false
  const photoLayer = attempt.layers.find((l) => l.id === 'auto-photo')
  if (photoLayer && attempt.photoZone && !layerBoundsWithinZone(photoLayer, attempt.photoZone, imageAspect, measurer)) return false
  const forbidden = template.zones?.forbidden ?? []
  if (invadesForbiddenZone(attempt.layers, forbidden, attempt.zonesByRole, attempt.zonesByRole.body.width, imageAspect, measurer)) return false
  return true
}

// ---------------------------------------------------------------------------------------------------
// API pública del motor.
// ---------------------------------------------------------------------------------------------------
export interface AutoComposeSuccess {
  status: 'success'
  style: AutoComposeStyle
  geometryFamily: GeometryFamily
  // Identidad visual — qué variante de Divertido se usó (ver `resolveDivertidoVariant`); ausente en Clásico.
  // Para depuración/tests/verificación visual, nunca para decidir contenido.
  divertidoVariant?: DivertidoVariant
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
// Intenta la escalera completa (`buildAttemptSequence`) de UN tratamiento resuelto — extraído para poder
// reutilizarlo en el último recurso de la sección siguiente (variante preferida → variante A) sin duplicar
// el bucle.
function tryTreatmentLadder(content: InvitationContent, event: FamilyEvent, template: InvitationTemplateMeta, style: AutoComposeStyle, treatment: StyleTreatment, geometryFamily: GeometryFamily, photoPath: string | undefined, measurer: TextMeasurer | undefined, imageAspect: number): { layers: InvitationLayer[]; adaptation: ComposeAttempt; tried: number } | { tried: number } {
  const attempts = buildAttemptSequence(treatment, geometryFamily)
  let tried = 0
  for (const attempt of attempts) {
    tried++
    const result = attemptOnce(content, event, template, style, treatment, photoPath, measurer, attempt)
    if (validateComposition(result, template, imageAspect, measurer)) {
      return { layers: result.layers, adaptation: attempt, tried }
    }
  }
  return { tried }
}

export function composeInvitationForMe(params: ComposeInvitationForMeParams): AutoComposeResult {
  const { event, template, style, photoPath, measurer } = params
  const content = buildInvitationContent(event)
  const geometryFamily = classifyTemplateGeometry(template)
  const imageAspect = template.imageAspect ?? 1
  const photoPathOrUndefined = photoPath ?? undefined

  const variant = style === 'divertido' ? resolveDivertidoVariant(template, event) : undefined
  const treatment = resolveStyleTreatment(style, template, event)

  let tried = 0
  const first = tryTreatmentLadder(content, event, template, style, treatment, geometryFamily, photoPathOrUndefined, measurer, imageAspect)
  tried += first.tried
  if ('layers' in first) {
    return { status: 'success', style, geometryFamily, divertidoVariant: variant, adaptation: first.adaptation, attemptsTried: tried, layers: first.layers }
  }

  // Último recurso (ajuste aprobado del mandato de identidad visual) — si la variante PREFERIDA agota su
  // propia escalera sin encajar, un intento final con la escalera de A (la más conservadora) antes de
  // fallar del todo. Determinista: nunca salta a otra plantilla ni a otro estilo, y sigue pasando por la
  // MISMA validación de geometría completa que cualquier otro intento.
  if (variant && variant !== 'A') {
    const fallback = tryTreatmentLadder(content, event, template, style, DIVERTIDO_A, geometryFamily, photoPathOrUndefined, measurer, imageAspect)
    tried += fallback.tried
    if ('layers' in fallback) {
      return { status: 'success', style, geometryFamily, divertidoVariant: 'A', adaptation: fallback.adaptation, attemptsTried: tried, layers: fallback.layers }
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
