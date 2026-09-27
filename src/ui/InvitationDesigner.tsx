import { ChangeEvent, type CSSProperties, PointerEvent as ReactPointerEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  autoArrangeLayers,
  buildInvitationDataFields,
  buildInvitationTemplateLayers,
  DEFAULT_TEXT_AREA,
  INVITATION_EMOJI_CATEGORIES,
  INVITATION_SHAPES,
  INVITATION_TEMPLATES,
  LINE_HEIGHT_RATIO,
  searchInvitationEmoji,
  type InvitationTemplateMeta,
  makeInvitationLayer,
  reconcileOverlappingBoxes,
  resolveLayerFontWeight,
  sortInvitationTemplatesForEvent,
  type SafeZone,
  type TextMeasurer,
} from '@/domain/events'
import { errorMessage } from '@/domain/errorMessage'
import type { FamilyEvent, InvitationCanvas, InvitationLayer, InvitationTextAlign, InvitationTextStyle } from '@/domain/types'
import { getEventInvitation, getInvitationPhotoUrl, saveEventInvitation, uploadInvitationPhoto } from '@/data/events'
import { loadRecentInvitationEmoji, recordRecentInvitationEmoji } from '@/state/invitationRecentEmoji'
import { ConfirmButton, ConfirmIconButton } from '@/ui/ConfirmButton'
// Fase 3 Bloque 5B — "✨ Pepa, hazla por mí": el editor solo COORDINA (sube foto, decide qué plantilla/
// estilo está activo, aplica el resultado como una operación de historial); todas las recetas, la
// clasificación geométrica y las reglas de validación siguen viviendo en el motor del Bloque 5A — nada de
// eso se reimplementa aquí.
import {
  type AutoComposeFieldKey,
  type AutoComposeStyle,
  buildCustomTemplateMeta,
  checkAllStyleCompatibility,
  composeInvitationForMe,
  getInvitationEventDataChanges,
  type InvitationEventDataChange,
  invitationHasTrackedEventData,
  isInvitationLayerManuallyEdited,
  removeInvitationLayersForRemovedFields,
  type StyleCompatibility,
  toEventFieldKey,
  updateInvitationLayersFromEvent,
} from '@/domain/invitationAutoCompose'

// Editor de invitaciones en capas (Fase 3) — extraído de EventosScreen.tsx (INV-EDITOR-1, reforma del
// diseñador) para no seguir haciendo crecer ese archivo. Componentes públicos (usados desde
// EventosScreen.tsx): InvitationCanvasEditor (el editor completo), InvitationCanvasView (vista de solo
// lectura, para la vista previa de InvitationModal) e InvitationTemplatePicker/InvitationBackground (para
// la tarjeta de invitación "clásica" sin canvas propio, también en InvitationModal). El resto —
// InvitationLayerVisual, InvitationBackgroundArt, InvitationShapeGraphic, TextGradientDef, los estilos de
// texto, clamp, etc. — es interno a este módulo.

// ---------------------------------------------------------------------
// Fase 3 — Editor de invitaciones en capas de verdad. Petición de la
// Skill: "Think WhatsApp / Instagram Stories simplicity" — un único
// gesto de arrastre en el "tirador" de la esquina mueve tamaño Y
// rotación a la vez (igual que un texto de Instagram Stories), en vez
// de un lienzo estilo Canva de escritorio con herramientas separadas.
// Un solo diseño por evento (event_invitations, unique(event_id)); el
// invite_scope de cada invitado no cambia el diseño.
// ---------------------------------------------------------------------

// Debe coincidir con el font-family base real de la app (ver ui/styles.css, selector "body") — es el que
// resuelve un layer con fontFamily 'inherit' (el caso normal; ver LAYER_FONT_OPTIONS más abajo).
const BASE_FONT_STACK = "system-ui, -apple-system, 'Segoe UI', sans-serif"

// 2026-09-27 (investigación de layout, "corazones_terraza") — measurer real para autoArrangeLayers/
// estimateLayerBoxFraction (domain/events.ts): mide el ancho real de cada palabra con Canvas 2D
// measureText en vez de la vieja aproximación por caracteres. Se probó contra el DOM real (9 casos:
// títulos, cuerpos multilínea, líneas que fuerzan wrap, emojis, varios fontSize/anchos) y predijo
// EXACTAMENTE el mismo número de líneas que el DOM en los 9 — porque usa el mismo motor de texto que la
// plataforma real en cada caso (San Francisco en iOS, Roboto en Android, Segoe UI en escritorio...) en vez
// de asumir un ancho de carácter fijo. Un único <canvas> oculto se reutiliza entre llamadas (measureText no
// pinta nada, así que ni siquiera hace falta añadirlo al DOM).
let measureCanvasCtx: CanvasRenderingContext2D | null | undefined
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCanvasCtx === undefined) {
    measureCanvasCtx = typeof document === 'undefined' ? null : (document.createElement('canvas').getContext('2d') ?? null)
  }
  return measureCanvasCtx
}
// Una capa puede pedir una fuente propia (LAYER_FONT_OPTIONS) en vez de heredar la base de la app — de ahí
// el 4º argumento opcional: se resuelve aquí, no en domain/ (que no conoce las fuentes que ofrece la UI).
const domTextMeasurer: TextMeasurer = (text, fontSize, fontWeight, fontFamily) => {
  const ctx = getMeasureCtx()
  const family = !fontFamily || fontFamily === 'inherit' ? BASE_FONT_STACK : fontFamily
  if (!ctx) return text.length * fontSize * 0.6 // sin Canvas disponible (SSR/tests): misma aproximación de siempre.
  ctx.font = `${fontWeight} ${fontSize}px ${family}`
  return ctx.measureText(text).width
}

function InvitationShapeGraphic({ shapeKey, color, size }: { shapeKey?: string; color?: string; size: number }) {
  const c = color || '#ffffff'
  switch (shapeKey) {
    case 'rectangulo':
      return (
        <svg width={size} height={size * 0.66} viewBox="0 0 100 66">
          <rect x="2" y="2" width="96" height="62" rx="6" fill={c} />
        </svg>
      )
    case 'linea':
      return (
        <svg width={size} height={Math.max(12, size * 0.08)} viewBox="0 0 100 8">
          <rect x="0" y="2" width="100" height="4" rx="2" fill={c} />
        </svg>
      )
    case 'corazon':
      return (
        <svg width={size} height={size} viewBox="0 0 100 100">
          <path d="M50 88 C20 65 5 45 5 27 C5 10 18 2 32 2 C42 2 48 8 50 14 C52 8 58 2 68 2 C82 2 95 10 95 27 C95 45 80 65 50 88 Z" fill={c} />
        </svg>
      )
    case 'anillo':
      return (
        <svg width={size} height={size} viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="38" fill="none" stroke={c} strokeWidth="10" />
        </svg>
      )
    case 'estrella':
      return (
        <svg width={size} height={size} viewBox="0 0 100 100">
          <polygon points="50,5 61,38 96,38 68,59 79,92 50,72 21,92 32,59 4,38 39,38" fill={c} />
        </svg>
      )
    case 'confeti':
      return (
        <svg width={size} height={size} viewBox="0 0 100 100">
          <circle cx="20" cy="20" r="6" fill={c} />
          <circle cx="70" cy="15" r="5" fill={c} />
          <circle cx="50" cy="50" r="7" fill={c} />
          <circle cx="80" cy="70" r="5" fill={c} />
          <circle cx="25" cy="75" r="6" fill={c} />
          <circle cx="55" cy="85" r="4" fill={c} />
        </svg>
      )
    case 'ondas':
      return (
        <svg width={size} height={size * 0.4} viewBox="0 0 100 40">
          <path d="M0,20 Q12,0 25,20 T50,20 T75,20 T100,20" fill="none" stroke={c} strokeWidth="6" />
        </svg>
      )
    case 'brillos':
      // Petición real: "una capa de brillos, elementos de brillos... como
      // si fuese purpurina" — varios destellos de 4 puntas (forma ✨) a
      // distinto tamaño, cada uno parpadeando con su propio desfase
      // (animate nativo de SVG, sin CSS global ni imagen de textura).
      return (
        <svg width={size} height={size} viewBox="0 0 100 100">
          {[
            [22, 28, 16, 0],
            [70, 20, 11, 0.4],
            [50, 55, 20, 0.8],
            [80, 68, 13, 1.2],
            [18, 75, 12, 1.6],
          ].map(([cx, cy, r, delay], i) => (
            <g key={i} transform={`translate(${cx},${cy})`}>
              <path
                d={`M0,${-r} Q${r * 0.15},${-r * 0.15} ${r},0 Q${r * 0.15},${r * 0.15} 0,${r} Q${-r * 0.15},${r * 0.15} ${-r},0 Q${-r * 0.15},${-r * 0.15} 0,${-r} Z`}
                fill={c}
              >
                <animate attributeName="opacity" values="0.25;1;0.25" dur="1.6s" begin={`${delay}s`} repeatCount="indefinite" />
              </path>
            </g>
          ))}
        </svg>
      )
    case 'circulo':
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" fill={c} />
        </svg>
      )
  }
}

function darkenHexColor(hex: string, amount: number): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return hex
  const num = parseInt(clean, 16)
  const c = (v: number) => Math.max(0, Math.min(255, v))
  const r = c((num >> 16) - amount)
  const g = c(((num >> 8) & 0xff) - amount)
  const b = c((num & 0xff) - amount)
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
}

// Petición real: "que al texto se le pueda dar formato 3D" — capas de
// sombra escalonadas en un tono más oscuro del propio color del texto,
// el truco clásico de CSS para simular relieve/extrusión sin librerías.
function text3dShadow(color: string): string {
  const dark = darkenHexColor(color, 70)
  const steps = [1, 2, 3, 4, 5].map((i) => `${i}px ${i}px 0 ${dark}`)
  return [...steps, '6px 6px 10px rgba(0,0,0,0.35)'].join(', ')
}

const RAINBOW_STOPS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#AF52DE', '#FF3B30']
const IRIDESCENT_STOPS = ['#FFD1E8', '#C9F0FF', '#E0C9FF', '#FFF3C4', '#C9FFE0', '#FFD1E8']
const METALLIC_STOPS = ['#6E6E73', '#F5F5F7', '#8E8E93', '#FFFFFF', '#5A5A5E', '#D1D1D6', '#6E6E73']

// Estilo → clase CSS (relleno plano, capa "text"/"event_data" sin
// curvar) — ver .invitation-*-text en styles.css para cada animación.
const TEXT_STYLE_CLASS: Partial<Record<InvitationTextStyle, string>> = {
  sparkle: 'invitation-glitter-text',
  rainbow_static: 'invitation-rainbow-static-text',
  rainbow_animated: 'invitation-rainbow-animated-text',
  iridescent: 'invitation-iridescent-text',
  metallic: 'invitation-metallic-text',
}

// Mismos estilos que TEXT_STYLE_CLASS pero para la variante curvada
// (SVG con textPath, que no puede usar background-clip). "sparkle"
// anima el hueco entre dos franjas del propio color; el resto recorre
// una paleta fija de colores.
function TextGradientDef({ id, style, color }: { id: string; style: InvitationTextStyle; color: string }) {
  if (style === 'sparkle') {
    return (
      <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor={color} />
        <stop offset="45%" stopColor={color} />
        <stop offset="50%" stopColor="#ffffff" />
        <stop offset="55%" stopColor={color} />
        <stop offset="100%" stopColor={color} />
        <animate attributeName="x1" values="-1;1" dur="2.2s" repeatCount="indefinite" />
        <animate attributeName="x2" values="0;2" dur="2.2s" repeatCount="indefinite" />
      </linearGradient>
    )
  }
  const isRainbow = style === 'rainbow_static' || style === 'rainbow_animated'
  const stops = isRainbow ? RAINBOW_STOPS : style === 'metallic' ? METALLIC_STOPS : IRIDESCENT_STOPS
  const animated = style === 'rainbow_animated' || style === 'iridescent' || style === 'metallic'
  return (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
      {stops.map((c, i) => (
        <stop key={i} offset={`${(i / (stops.length - 1)) * 100}%`} stopColor={c} />
      ))}
      {animated && (
        <>
          <animate attributeName="x1" values="0;-2;0" dur={style === 'iridescent' ? '7s' : '5s'} repeatCount="indefinite" />
          <animate attributeName="x2" values="1;-1;1" dur={style === 'iridescent' ? '7s' : '5s'} repeatCount="indefinite" />
        </>
      )}
    </linearGradient>
  )
}

// "fontSize" se reutiliza como tamaño base en píxeles para foto/forma,
// no solo para texto — evita añadir un campo más al tipo por algo tan
// parecido (ver domain/types.ts, InvitationLayer).
function InvitationLayerVisual({ layer, photoUrls }: { layer: InvitationLayer; photoUrls: Record<string, string> }) {
  switch (layer.type) {
    case 'text':
    case 'event_data': {
      const color = layer.color || '#ffffff'
      const fontSize = layer.fontSize ?? 16
      const fontFamily = layer.fontFamily || 'inherit'
      const fontWeight = resolveLayerFontWeight(layer)
      const fontStyle = layer.italic ? 'italic' : 'normal'
      const textAlign = layer.textAlign ?? 'center'
      const style = layer.textStyle ?? 'normal'
      const hasGradientFill = style !== 'normal' && style !== '3d'

      // Curvar solo tiene sentido en una línea — "event_data" (varias
      // líneas de fecha/ubicación) siempre se queda recto.
      if (layer.type === 'text' && layer.curve) {
        const text = (layer.text ?? '').replace(/\n/g, ' ')
        const bend = clamp(layer.curve, -100, 100)
        const pathId = `curve-${layer.id}`
        const gradientId = `fill-${layer.id}`
        const width = Math.max(220, text.length * fontSize * 0.62)
        const height = Math.max(80, Math.abs(bend) * 0.9 + fontSize * 1.6)
        const midY = height / 2
        const d = `M 10 ${midY} Q ${width / 2} ${midY - bend} ${width - 10} ${midY}`
        const dark = darkenHexColor(color, 70)
        const fill = hasGradientFill ? `url(#${gradientId})` : color
        return (
          <svg width={width} height={height} style={{ overflow: 'visible', display: 'block' }}>
            <path id={pathId} d={d} fill="none" />
            {hasGradientFill && (
              <defs>
                <TextGradientDef id={gradientId} style={style} color={color} />
              </defs>
            )}
            {style === '3d' &&
              [5, 4, 3, 2, 1].map((i) => (
                <text key={i} fontSize={fontSize} fontFamily={fontFamily} fontWeight={fontWeight} fontStyle={fontStyle} fill={dark} transform={`translate(${i}, ${i})`}>
                  <textPath href={`#${pathId}`} xlinkHref={`#${pathId}`} startOffset="50%" textAnchor="middle">
                    {text}
                  </textPath>
                </text>
              ))}
            <text fontSize={fontSize} fontFamily={fontFamily} fontWeight={fontWeight} fontStyle={fontStyle} fill={fill}>
              <textPath href={`#${pathId}`} xlinkHref={`#${pathId}`} startOffset="50%" textAnchor="middle">
                {text}
              </textPath>
            </text>
          </svg>
        )
      }

      const className = TEXT_STYLE_CLASS[style]
      return (
        <div
          className={className}
          style={
            {
              color: className ? undefined : color,
              fontSize,
              fontFamily,
              fontWeight,
              fontStyle,
              // Debe coincidir EXACTAMENTE con LINE_HEIGHT_RATIO (domain/events.ts): esa constante es la
              // que estimateLayerBoxFraction usa para calcular el alto real de esta capa y así colocar el
              // resto (autoArrangeLayers) sin solape ni overflow falso. Sin fijarlo aquí, el <div> heredaba
              // el line-height "normal" del navegador/fuente (variable según fontFamily) y el alto
              // estimado podía no coincidir con el alto realmente pintado.
              lineHeight: LINE_HEIGHT_RATIO,
              whiteSpace: 'pre-line',
              textAlign,
              textShadow: className ? 'none' : style === '3d' ? text3dShadow(color) : '0 1px 4px rgba(0,0,0,0.25)',
              '--glitter-base': color,
            } as CSSProperties
          }
        >
          {layer.text}
        </div>
      )
    }
    case 'emoji':
      return <div style={{ fontSize: layer.fontSize ?? 48, lineHeight: 1 }}>{layer.text}</div>
    case 'shape':
      return <InvitationShapeGraphic shapeKey={layer.shapeKey} color={layer.color} size={layer.fontSize ?? 60} />
    case 'photo': {
      const url = layer.photoPath ? photoUrls[layer.photoPath] : undefined
      const size = layer.fontSize ?? 120
      // Fase 3 Bloque 3 — "Círculo" es una máscara geométrica (border-radius), no "quitar fondo"
      // (segmentación real del sujeto) — son funciones distintas, esta es la única implementada por ahora.
      const borderRadius = layer.photoMask === 'circle' ? '50%' : 12
      return url ? (
        <img src={url} alt="" draggable={false} style={{ width: size, height: size, objectFit: 'cover', borderRadius, display: 'block' }} />
      ) : (
        <div style={{ width: size, height: size, borderRadius, background: 'rgba(255,255,255,0.35)' }} />
      )
    }
    default:
      return null
  }
}

// Renderer de solo lectura — reutilizado tanto en el editor (sin
// selección/gestos) como en el previo dentro de InvitationModal, para
// que "lo que ves es lo que se manda" sea literal.
// Arte decorativo propio por plantilla — nunca un personaje con
// copyright, solo formas geométricas simples (círculos, óvalos,
// triángulos) con el espíritu de cada tema. Petición real: "no quiero
// un simple fondo colorido, quiero plantillas bonitas temáticas... como
// las de las fotos adjuntas" (referencias de Canva/Pinterest — esos
// diseños concretos no se pueden copiar, son de terceros). Vive aquí
// (no en domain/events.ts) porque ese archivo es .ts sin JSX. No es una
// capa editable — va detrás de las capas del usuario, fija al elegir
// plantilla (igual que el degradado de fondo).
function InvitationBackgroundArt({ artKey }: { artKey: string }) {
  const common = { style: { position: 'absolute' as const, inset: 0, width: '100%', height: '100%', pointerEvents: 'none' as const } }
  switch (artKey) {
    case 'globos':
      return (
        <svg {...common} viewBox="0 0 300 400">
          {[
            [40, 300, 32, '#ffffff'],
            [80, 340, 24, '#F472B6'],
            [255, 310, 30, '#ffffff'],
            [220, 350, 22, '#34D399'],
          ].map(([cx, cy, r, fill], i) => (
            <g key={i}>
              <ellipse cx={cx as number} cy={cy as number} rx={r as number} ry={(r as number) * 1.15} fill={fill as string} opacity={0.9} />
              <polygon
                points={`${(cx as number) - 5},${(cy as number) + (r as number) * 1.1} ${(cx as number) + 5},${(cy as number) + (r as number) * 1.1} ${cx},${(cy as number) + (r as number) * 1.1 + 8}`}
                fill={fill as string}
                opacity={0.9}
              />
              <path
                d={`M${cx} ${(cy as number) + (r as number) * 1.1 + 8} q 6 20 -4 40 q -8 18 4 36`}
                stroke={fill as string}
                strokeWidth={1.5}
                fill="none"
                opacity={0.6}
              />
            </g>
          ))}
          {[[30, 60], [270, 90], [150, 40], [60, 150], [250, 200], [190, 60]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i % 2 === 0 ? 4 : 3} fill="#ffffff" opacity={0.7} />
          ))}
        </svg>
      )
    case 'monstruo':
      return (
        <svg {...common} viewBox="0 0 300 400">
          <defs>
            <MascotGradient id="monster-body" light="#5EEAD4" dark="#0D9488" />
            <MascotGradient id="monster-horn" light="#2DD4BF" dark="#0F766E" />
          </defs>
          <g opacity={0.9}>
            {Array.from({ length: 8 }).map((_, i) => (
              <polygon key={i} points={`${i * 40 + 5},18 ${i * 40 + 25},18 ${i * 40 + 15},42`} fill={i % 2 === 0 ? '#FBBF24' : '#F472B6'} />
            ))}
            <line x1={0} y1={18} x2={300} y2={18} stroke="#ffffff" strokeWidth={2} opacity={0.5} />
          </g>
          {/* Bug real visto probando en vivo: a tamaño completo, el
              monstruo tapaba el texto de fecha que va por defecto a
              y=0.78 — se encoge y se mete en la esquina para dejar el
              centro libre para las capas de texto del usuario. */}
          {groundShadow(66, 418, 62)}
          <g transform="translate(46 366) scale(0.6)" strokeLinejoin="round">
            <circle cx={-25} cy={-50} r={11} fill="url(#monster-horn)" stroke="#115E59" strokeWidth={2} />
            <circle cx={5} cy={-60} r={9} fill="url(#monster-horn)" stroke="#115E59" strokeWidth={2} />
            <circle cx={30} cy={-48} r={10} fill="url(#monster-horn)" stroke="#115E59" strokeWidth={2} />
            <ellipse cx={0} cy={0} rx={75} ry={70} fill="url(#monster-body)" stroke="#115E59" strokeWidth={3} />
            {blush(-42, 8, 11)}
            {blush(42, 14, 11)}
            {sparkleEye(-20, -15, 20)}
            {sparkleEye(22, -6, 15)}
            <path d="M-15 25 q 15 18 35 2" stroke="#115E59" strokeWidth={3.5} fill="none" strokeLinecap="round" />
          </g>
          {[[240, 260], [265, 220], [220, 300]].map(([x, y], i) => (
            <path key={i} d={starPath(x, y, 7, 3)} fill="#FBBF24" opacity={0.85} />
          ))}
        </svg>
      )
    case 'futbol':
      return (
        <svg {...common} viewBox="0 0 300 400">
          {[[45, 340, 38], [255, 70, 26]].map(([cx, cy, r], i) => (
            <g key={i}>
              <circle cx={cx} cy={cy} r={r} fill="#ffffff" />
              <polygon
                points={ballPentagon(cx, cy, r * 0.42)}
                fill="#1F2937"
              />
              {[0, 1, 2, 3, 4].map((k) => {
                const a = (Math.PI * 2 * k) / 5 - Math.PI / 2
                const x1 = cx + Math.cos(a) * r * 0.42
                const y1 = cy + Math.sin(a) * r * 0.42
                const x2 = cx + Math.cos(a) * r * 0.95
                const y2 = cy + Math.sin(a) * r * 0.95
                return <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#1F2937" strokeWidth={2} />
              })}
              <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1F2937" strokeWidth={2} />
            </g>
          ))}
          {[[200, 330], [90, 60], [240, 220]].map(([x, y], i) => (
            <path key={i} d={starPath(x, y, 6, 3)} fill="#ffffff" opacity={0.8} />
          ))}
        </svg>
      )
    case 'unicornio':
      return (
        <svg {...common} viewBox="0 0 300 400">
          <defs>
            <MascotGradient id="uni-body" light="#ffffff" dark="#E9D8FD" />
            <MascotGradient id="uni-horn" light="#FEF3C7" dark="#F59E0B" />
          </defs>
          <path d="M20 60 A130 130 0 0 1 280 60" stroke="#FCA5A5" strokeWidth={10} fill="none" opacity={0.7} />
          <path d="M35 60 A115 115 0 0 1 265 60" stroke="#FDE68A" strokeWidth={10} fill="none" opacity={0.7} />
          <path d="M50 60 A100 100 0 0 1 250 60" stroke="#A7F3D0" strokeWidth={10} fill="none" opacity={0.7} />
          {groundShadow(198, 366, 58)}
          <g transform="translate(190 320) rotate(-6)" strokeLinejoin="round">
            <ellipse cx={0} cy={4} rx={50} ry={36} fill="url(#uni-body)" stroke="#C4B5FD" strokeWidth={2.5} />
            <path d="M-46 -14 Q-64 -46 -38 -60 Q-14 -50 -22 -20 Z" fill="url(#uni-body)" stroke="#C4B5FD" strokeWidth={2.5} />
            <circle cx={-38} cy={-32} r={22} fill="url(#uni-body)" stroke="#C4B5FD" strokeWidth={2.5} />
            <ellipse cx={-56} cy={-24} rx={13} ry={9} fill="url(#uni-body)" stroke="#C4B5FD" strokeWidth={2} />
            <polygon points="-46,-52 -38,-80 -30,-52" fill="url(#uni-horn)" stroke="#B45309" strokeWidth={2} />
            <polygon points="-24,-52 -18,-68 -12,-52" fill="url(#uni-body)" stroke="#C4B5FD" strokeWidth={2} />
            {[-10, 2, 14, 26].map((dy, i) => (
              <path
                key={i}
                d={`M-32 ${-38 + dy} q -26 8 -14 30`}
                stroke={['#F472B6', '#C4B5FD', '#93C5FD', '#FDE68A'][i]}
                strokeWidth={9}
                fill="none"
                strokeLinecap="round"
              />
            ))}
            {sparkleEye(-45, -31, 9.5)}
            {blush(-58, -16, 7)}
            <path d="M-62 -22 q -4 3 0 6" stroke="#C2793F" strokeWidth={2} fill="none" strokeLinecap="round" />
            <line x1={-25} y1={34} x2={-25} y2={54} stroke="url(#uni-body)" strokeWidth={9} strokeLinecap="round" />
            <line x1={0} y1={36} x2={0} y2={56} stroke="url(#uni-body)" strokeWidth={9} strokeLinecap="round" />
            <line x1={25} y1={34} x2={25} y2={54} stroke="url(#uni-body)" strokeWidth={9} strokeLinecap="round" />
          </g>
          {[[40, 90], [230, 140], [60, 250], [260, 260]].map(([x, y], i) => (
            <path key={i} d={starPath(x, y, 6, 3)} fill="#ffffff" opacity={0.85} />
          ))}
        </svg>
      )
    case 'dorado':
      return (
        <svg {...common} viewBox="0 0 300 400">
          <g opacity={0.9}>
            <circle cx={150} cy={330} r={70} fill="none" stroke="#D4AF6A" strokeWidth={3} />
            <circle cx={150} cy={330} r={58} fill="none" stroke="#D4AF6A" strokeWidth={1.5} />
            <circle cx={150} cy={330} r={82} fill="none" stroke="#D4AF6A" strokeWidth={1} opacity={0.6} />
          </g>
          {[[40, 60], [260, 90], [230, 200], [50, 220], [270, 300], [30, 340]].map(([x, y], i) => (
            <path key={i} d={starPath(x, y, i % 2 === 0 ? 5 : 3, 2)} fill="#D4AF6A" opacity={0.85} />
          ))}
          <path d="M0 40 h300 M0 44 h300" stroke="#D4AF6A" strokeWidth={0.5} opacity={0.3} />
        </svg>
      )
    case 'floral':
      return (
        <svg {...common} viewBox="0 0 300 400">
          {[[45, 350, 1], [255, 55, 0.8], [255, 360, 0.65]].map(([cx, cy, scale], i) => (
            <g key={i} transform={`translate(${cx} ${cy}) scale(${scale})`}>
              {[0, 60, 120, 180, 240, 300].map((deg) => (
                <ellipse key={deg} cx={0} cy={-16} rx={10} ry={16} fill={['#FBCFE8', '#FDBA74', '#FECDD3'][deg / 60] ?? '#FBCFE8'} opacity={0.9} transform={`rotate(${deg})`} />
              ))}
              <circle cx={0} cy={0} r={8} fill="#FDE68A" />
            </g>
          ))}
          <path d="M45 380 q -6 -40 10 -70" stroke="#86EFAC" strokeWidth={3} fill="none" opacity={0.8} />
          <path d="M255 90 q 10 30 -4 55" stroke="#86EFAC" strokeWidth={3} fill="none" opacity={0.8} />
          {[[150, 70], [90, 130], [210, 260]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={2.5} fill="#FDBA74" opacity={0.7} />
          ))}
        </svg>
      )
    case 'celeste':
      return (
        <svg {...common} viewBox="0 0 300 400">
          {[[70, 350, 1], [230, 60, 0.8], [40, 90, 0.6]].map(([cx, cy, scale], i) => (
            <g key={i} transform={`translate(${cx} ${cy}) scale(${scale})`} fill="#ffffff" opacity={0.85}>
              <circle cx={-24} cy={0} r={20} />
              <circle cx={0} cy={-10} r={26} />
              <circle cx={26} cy={0} r={20} />
              <rect x={-26} y={0} width={78} height={20} rx={10} />
            </g>
          ))}
          {[[150, 140], [200, 200], [90, 220], [250, 300], [30, 260]].map(([x, y], i) => (
            <path key={i} d={starPath(x, y, 5, 2)} fill="#ffffff" opacity={0.9} />
          ))}
        </svg>
      )
    case 'disco':
      return (
        <svg {...common} viewBox="0 0 300 400">
          <defs>
            <clipPath id="disco-ball-clip">
              <circle r={36} />
            </clipPath>
          </defs>
          {/* Bola de espejos de verdad (esfera + rejilla de facetas), no
              una diana — la primera versión con anillos concéntricos no
              se leía como bola de discoteca. Va a la esquina (no
              centrada arriba) porque el emoji del tipo de evento
              también se coloca ahí por defecto — bug real visto
              probando en vivo, se pisaban los dos. */}
          <g transform="translate(228 80) scale(0.8)">
            <line x1={0} y1={-70} x2={0} y2={-37} stroke="#ffffff" strokeWidth={1.5} opacity={0.6} />
            {[['#F472B6', -34], ['#38BDF8', 0], ['#FBBF24', 34]].map(([color, dx], i) => (
              <polygon key={i} points={`0,0 ${(dx as number) - 10},120 ${(dx as number) + 10},120`} fill={color as string} opacity={0.14} />
            ))}
            <circle r={36} fill="#CBD5F5" />
            <g clipPath="url(#disco-ball-clip)">
              {[-27, -18, -9, 0, 9, 18, 27].map((y) => (
                <line key={`h${y}`} x1={-36} y1={y} x2={36} y2={y} stroke="#7C86B8" strokeWidth={1} opacity={0.55} />
              ))}
              {Array.from({ length: 10 }).map((_, i) => {
                const x = -45 + i * 10
                return <line key={`d1${i}`} x1={x} y1={-40} x2={x + 18} y2={40} stroke="#7C86B8" strokeWidth={0.8} opacity={0.45} />
              })}
              {Array.from({ length: 10 }).map((_, i) => {
                const x = -45 + i * 10
                return <line key={`d2${i}`} x1={x} y1={40} x2={x + 18} y2={-40} stroke="#7C86B8" strokeWidth={0.8} opacity={0.45} />
              })}
            </g>
            <circle r={36} fill="none" stroke="#ffffff" strokeWidth={1} opacity={0.4} />
            <ellipse cx={-11} cy={-13} rx={11} ry={6} fill="#ffffff" opacity={0.55} transform="rotate(-25 -11 -13)" />
          </g>
          {[[40, 200], [260, 230], [70, 320], [230, 340], [30, 60], [270, 130]].map(([x, y], i) => (
            <path key={i} d={starPath(x, y, i % 2 === 0 ? 8 : 5, 3)} fill="#ffffff" opacity={0.85} />
          ))}
        </svg>
      )
    case 'dinosaurios':
      return (
        <svg {...common} viewBox="0 0 300 400">
          {/* Silueta de cuello largo (tipo braquiosaurio) — se lee mucho
              mejor a tamaño pequeño que una forma libre; la primera
              versión con un path complejo parecía una mancha. */}
          <defs>
            <MascotGradient id="dino-body" light="#A3E635" dark="#4D7C0F" />
            <MascotGradient id="dino-belly" light="#FEF9C3" dark="#FDE68A" />
          </defs>
          {groundShadow(110, 402, 66)}
          <g transform="translate(100 355) scale(0.62)" strokeLinejoin="round">
            <path d="M50 15 Q95 -5 85 25 Q72 18 50 28 Z" fill="url(#dino-body)" stroke="#365314" strokeWidth={3} />
            <ellipse cx={0} cy={15} rx={58} ry={34} fill="url(#dino-body)" stroke="#365314" strokeWidth={3} />
            <ellipse cx={0} cy={28} rx={34} ry={16} fill="url(#dino-belly)" />
            <ellipse cx={-68} cy={-28} rx={15} ry={36} fill="url(#dino-body)" stroke="#365314" strokeWidth={3} transform="rotate(-22 -68 -28)" />
            <circle cx={-92} cy={-56} r={19} fill="url(#dino-body)" stroke="#365314" strokeWidth={3} />
            {sparkleEye(-97, -60, 7)}
            {blush(-84, -48, 6)}
            {[-25, -5, 15].map((x, i) => (
              <polygon key={i} points={`${x},-10 ${x + 10},-26 ${x + 20},-10`} fill="url(#dino-belly)" stroke="#365314" strokeWidth={2} />
            ))}
            {[-32, -6, 22, 40].map((x, i) => (
              <ellipse key={i} cx={x} cy={44} rx={10} ry={16} fill="url(#dino-body)" stroke="#365314" strokeWidth={2.5} />
            ))}
          </g>
          {[[220, 90], [250, 130], [200, 60]].map(([x, y], i) => (
            <ellipse key={i} cx={x} cy={y} rx={7} ry={4} fill="#4D7C0F" opacity={0.6} transform={`rotate(${i * 30} ${x} ${y})`} />
          ))}
          {[[250, 340], [270, 310], [235, 365]].map(([x, y], i) => (
            <path key={i} d={`M${x} ${y} q -6 -10 0 -18 q 6 8 0 18`} fill="#166534" opacity={0.5} />
          ))}
        </svg>
      )
    case 'videojuegos':
      return (
        <svg {...common} viewBox="0 0 300 400">
          {/* Mando genérico (D-pad + botones) — sin logotipo ni forma de
              ninguna marca concreta, no es ninguna videoconsola real. */}
          <g transform="translate(230 340)">
            <rect x={-55} y={-30} width={110} height={60} rx={28} fill="#A78BFA" opacity={0.9} />
            <rect x={-40} y={-7} width={24} height={8} fill="#312E81" />
            <rect x={-32} y={-15} width={8} height={24} fill="#312E81" />
            <circle cx={30} cy={-8} r={6} fill="#4ADE80" />
            <circle cx={44} cy={2} r={6} fill="#F472B6" />
          </g>
          {[[40, 70], [90, 50], [60, 110], [30, 140]].map(([x, y], i) => (
            <rect key={i} x={x - 5} y={y - 5} width={10} height={10} fill={['#4ADE80', '#F472B6', '#FBBF24', '#38BDF8'][i]} opacity={0.85} />
          ))}
          {[[260, 200], [50, 300], [230, 100]].map(([x, y], i) => (
            <path key={i} d={starPath(x, y, 7, 3)} fill="#FBBF24" opacity={0.8} />
          ))}
        </svg>
      )
    case 'corazones':
      return (
        <svg {...common} viewBox="0 0 300 400">
          {[[50, 340, 1], [250, 70, 0.7], [235, 330, 0.55], [55, 80, 0.5]].map(([x, y, s], i) => (
            <path
              key={i}
              d={`M${x} ${(y as number) + 14 * (s as number)} C${(x as number) - 26 * (s as number)} ${(y as number) - 8 * (s as number)} ${(x as number) - 14 * (s as number)} ${(y as number) - 26 * (s as number)} ${x} ${(y as number) - 10 * (s as number)} C${(x as number) + 14 * (s as number)} ${(y as number) - 26 * (s as number)} ${(x as number) + 26 * (s as number)} ${(y as number) - 8 * (s as number)} ${x} ${(y as number) + 14 * (s as number)} Z`}
              fill="#ffffff"
              opacity={0.9}
            />
          ))}
          {[[150, 150], [90, 220], [210, 250], [170, 40]].map(([x, y], i) => (
            <path key={i} d={starPath(x, y, 5, 2)} fill="#ffffff" opacity={0.6} />
          ))}
        </svg>
      )
    case 'ositos':
      return (
        <svg {...common} viewBox="0 0 300 400">
          <defs>
            <MascotGradient id="bear-fur" light="#E8C39E" dark="#B98756" />
            <MascotGradient id="bear-fur-dark" light="#C89666" dark="#9C6B3E" />
          </defs>
          {groundShadow(60, 415, 64)}
          <g transform="translate(60 355) scale(0.62)" strokeLinejoin="round">
            <ellipse cx={0} cy={40} rx={54} ry={48} fill="url(#bear-fur-dark)" stroke="#6B4423" strokeWidth={3} />
            <circle cx={-40} cy={30} r={17} fill="url(#bear-fur-dark)" stroke="#6B4423" strokeWidth={2.5} />
            <circle cx={40} cy={30} r={17} fill="url(#bear-fur-dark)" stroke="#6B4423" strokeWidth={2.5} />
            <circle cx={-38} cy={-70} r={17} fill="url(#bear-fur)" stroke="#6B4423" strokeWidth={2.5} />
            <circle cx={38} cy={-70} r={17} fill="url(#bear-fur)" stroke="#6B4423" strokeWidth={2.5} />
            <circle cx={-38} cy={-70} r={8} fill="#F4A9C0" />
            <circle cx={38} cy={-70} r={8} fill="#F4A9C0" />
            <circle cx={0} cy={-40} r={50} fill="url(#bear-fur)" stroke="#6B4423" strokeWidth={3} />
            {blush(-32, -22, 10)}
            {blush(32, -22, 10)}
            {sparkleEye(-17, -46, 9)}
            {sparkleEye(17, -46, 9)}
            <ellipse cx={0} cy={-24} rx={16} ry={12} fill="#FBF3E3" stroke="#6B4423" strokeWidth={2} />
            <ellipse cx={0} cy={-28} rx={6} ry={4.5} fill="#3F2A16" />
            <path d="M0 -23 v6 M-9 -1 Q0 8 9 -1" stroke="#6B4423" strokeWidth={2.5} fill="none" strokeLinecap="round" />
          </g>
          {[[230, 300], [255, 340], [210, 350]].map(([x, y], i) => (
            <ellipse key={i} cx={x} cy={y} rx={6} ry={9} fill="#ffffff" opacity={0.7} transform={`rotate(${i * 25} ${x} ${y})`} />
          ))}
          {[[240, 90], [60, 60], [200, 140]].map(([x, y], i) => (
            <path key={i} d={starPath(x, y, 5, 2)} fill="#ffffff" opacity={0.6} />
          ))}
        </svg>
      )
    case 'gatitos':
      return (
        <svg {...common} viewBox="0 0 300 400">
          <defs>
            <MascotGradient id="cat-fur" light="#F5F3FF" dark="#C4B5FD" />
          </defs>
          {groundShadow(250, 400, 58)}
          <g transform="translate(250 350) scale(0.72)" strokeLinejoin="round">
            <path d="M38 20 Q64 8 56 -22" stroke="url(#cat-fur)" strokeWidth={15} fill="none" strokeLinecap="round" />
            <ellipse cx={0} cy={16} rx={42} ry={34} fill="url(#cat-fur)" stroke="#8B7BC7" strokeWidth={2.5} />
            {[-1, 1].map((s) => (
              <ellipse key={s} cx={s * 22} cy={44} rx={11} ry={8} fill="#ffffff" stroke="#8B7BC7" strokeWidth={2} />
            ))}
            <circle cx={0} cy={-34} r={32} fill="url(#cat-fur)" stroke="#8B7BC7" strokeWidth={2.5} />
            <polygon points="-26,-56 -8,-58 -15,-80" fill="url(#cat-fur)" stroke="#8B7BC7" strokeWidth={2.5} />
            <polygon points="8,-58 26,-56 15,-80" fill="url(#cat-fur)" stroke="#8B7BC7" strokeWidth={2.5} />
            <polygon points="-20,-58 -11,-59 -15,-73" fill="#F9A8D4" />
            <polygon points="11,-59 20,-58 15,-73" fill="#F9A8D4" />
            {blush(-24, -18, 8)}
            {blush(24, -18, 8)}
            {sparkleEye(-14, -34, 10)}
            {sparkleEye(14, -34, 10)}
            <path d="M0 -22 q -5 5 0 8 q 5 -3 0 -8" fill="#F9A8D4" stroke="#8B7BC7" strokeWidth={1} />
            <path d="M-4 -14 Q0 -9 4 -14" stroke="#6D28D9" strokeWidth={2} fill="none" strokeLinecap="round" />
            {[-1, 1].map((s) => (
              <g key={s} opacity={0.6}>
                <line x1={s * 6} y1={-20} x2={s * 30} y2={-24} stroke="#6D28D9" strokeWidth={1.2} />
                <line x1={s * 6} y1={-16} x2={s * 30} y2={-16} stroke="#6D28D9" strokeWidth={1.2} />
              </g>
            ))}
          </g>
          {[[40, 80], [70, 130], [30, 200]].map(([x, y], i) => (
            <ellipse key={i} cx={x} cy={y} rx={10} ry={7} fill="#ffffff" opacity={0.5} />
          ))}
          <circle cx={50} cy={330} r={16} fill="none" stroke="#ffffff" strokeWidth={4} opacity={0.6} />
        </svg>
      )
    case 'coches':
      return (
        <svg {...common} viewBox="0 0 300 400">
          <g opacity={0.9}>
            {Array.from({ length: 20 }).map((_, i) => (
              <rect key={i} x={(i % 10) * 30} y={i < 10 ? 0 : 16} width={30} height={16} fill={(i + Math.floor(i / 10)) % 2 === 0 ? '#ffffff' : '#1F2937'} />
            ))}
          </g>
          <g transform="translate(210 340)">
            <rect x={-60} y={-18} width={120} height={30} rx={12} fill="#DC2626" />
            <polygon points="-30,-18 -10,-38 40,-38 50,-18" fill="#DC2626" />
            <rect x={-8} y={-33} width={40} height={16} fill="#BFDBFE" opacity={0.8} />
            <circle cx={-32} cy={14} r={14} fill="#1F2937" />
            <circle cx={-32} cy={14} r={5} fill="#9CA3AF" />
            <circle cx={38} cy={14} r={14} fill="#1F2937" />
            <circle cx={38} cy={14} r={5} fill="#9CA3AF" />
          </g>
          {[0, 1, 2].map((i) => (
            <line key={i} x1={20} y1={330 + i * 12} x2={70} y2={330 + i * 12} stroke="#ffffff" strokeWidth={3} opacity={0.5} />
          ))}
          {[[240, 250], [40, 120], [260, 160]].map(([x, y], i) => (
            <path key={i} d={starPath(x, y, 6, 3)} fill="#ffffff" opacity={0.8} />
          ))}
        </svg>
      )
    case 'robots':
      return (
        <svg {...common} viewBox="0 0 300 400">
          <defs>
            <MascotGradient id="robot-body" light="#F1F5F9" dark="#94A3B8" />
            <MascotGradient id="robot-head" light="#E2E8F0" dark="#64748B" />
            <radialGradient id="robot-eye" cx="40%" cy="35%" r="70%">
              <stop offset="0%" stopColor="#FDE68A" />
              <stop offset="100%" stopColor="#F59E0B" />
            </radialGradient>
          </defs>
          {groundShadow(230, 388, 56)}
          <g transform="translate(230 350) scale(0.78)" strokeLinejoin="round">
            <line x1={0} y1={-90} x2={0} y2={-72} stroke="#94A3B8" strokeWidth={3} />
            <circle cx={0} cy={-96} r={7} fill="url(#robot-eye)" stroke="#B45309" strokeWidth={1.5} />
            <rect x={-36} y={-72} width={72} height={52} rx={14} fill="url(#robot-head)" stroke="#475569" strokeWidth={2.5} />
            <circle cx={-16} cy={-48} r={10} fill="url(#robot-eye)" stroke="#B45309" strokeWidth={1.5} />
            <circle cx={16} cy={-48} r={10} fill="url(#robot-eye)" stroke="#B45309" strokeWidth={1.5} />
            <circle cx={-18} cy={-51} r={3} fill="#ffffff" opacity={0.85} />
            <circle cx={14} cy={-51} r={3} fill="#ffffff" opacity={0.85} />
            <path d="M-10 -28 Q0 -21 10 -28" stroke="#475569" strokeWidth={2.5} fill="none" strokeLinecap="round" />
            <rect x={-44} y={-14} width={88} height={62} rx={14} fill="url(#robot-body)" stroke="#475569" strokeWidth={2.5} />
            <rect x={-18} y={8} width={36} height={22} rx={5} fill="#475569" />
            <circle cx={0} cy={19} r={7} fill="url(#robot-eye)" stroke="#B45309" strokeWidth={1.5} />
            <circle cx={-30} cy={2} r={4} fill="#CBD5E1" stroke="#64748B" strokeWidth={1} />
            <circle cx={30} cy={2} r={4} fill="#CBD5E1" stroke="#64748B" strokeWidth={1} />
            <rect x={-58} y={-8} width={16} height={38} rx={7} fill="url(#robot-body)" stroke="#475569" strokeWidth={2} />
            <rect x={42} y={-8} width={16} height={38} rx={7} fill="url(#robot-body)" stroke="#475569" strokeWidth={2} />
            <rect x={-26} y={48} width={18} height={28} rx={5} fill="url(#robot-head)" stroke="#475569" strokeWidth={2} />
            <rect x={8} y={48} width={18} height={28} rx={5} fill="url(#robot-head)" stroke="#475569" strokeWidth={2} />
          </g>
          {[0, 1, 2].map((i) => (
            <circle key={i} cx={40 + i * 14} cy={340} r={4} fill="none" stroke="#CBD5E1" strokeWidth={2} opacity={0.6} />
          ))}
          <path d="M40 320 h60 M70 320 v-30 M40 250 h30" stroke="#CBD5E1" strokeWidth={2} fill="none" opacity={0.35} />
          {[[260, 240], [40, 100], [220, 80]].map(([x, y], i) => (
            <path key={i} d={starPath(x, y, 6, 3)} fill="#FBBF24" opacity={0.75} />
          ))}
        </svg>
      )
    case 'superheroe':
      return (
        <svg {...common} viewBox="0 0 300 400">
          {/* Superhéroe infantil genérico (cara redonda, antifaz,
              estrella en el pecho) — sin ningún emblema ni color de una
              franquicia concreta, para no evocar a ningún personaje con
              copyright. La primera versión era una silueta sin cara y
              no resultaba nada entrañable. */}
          <defs>
            <MascotGradient id="hero-cape" light="#EF4444" dark="#B91C1C" />
            <MascotGradient id="hero-suit" light="#3B82F6" dark="#1E3A8A" />
            <MascotGradient id="hero-skin" light="#FDE0C4" dark="#F2B681" />
          </defs>
          {groundShadow(70, 375, 52)}
          <g transform="translate(70 340) scale(0.66)" strokeLinejoin="round">
            <path d="M-30 -10 Q-70 20 -55 90 Q-30 60 -15 70 Z" fill="url(#hero-cape)" stroke="#7F1D1D" strokeWidth={2.5} />
            <path d="M30 -10 Q70 20 55 90 Q30 60 15 70 Z" fill="url(#hero-cape)" stroke="#7F1D1D" strokeWidth={2.5} />
            <path d="M-32 20 Q-38 70 0 82 Q38 70 32 20 Q0 34 -32 20 Z" fill="url(#hero-suit)" stroke="#1E3A8A" strokeWidth={2.5} />
            <path d={starPath(0, 48, 13, 6)} fill="#FDE68A" />
            <circle cx={0} cy={-18} r={34} fill="url(#hero-skin)" stroke="#C2793F" strokeWidth={2.5} />
            <path d="M-34 -22 Q0 -46 34 -22 L30 -8 Q0 -26 -30 -8 Z" fill="url(#hero-suit)" stroke="#1E3A8A" strokeWidth={2.5} />
            {sparkleEye(-13, -14, 9)}
            {sparkleEye(13, -14, 9)}
            {blush(-20, -2, 7)}
            {blush(20, -2, 7)}
            <path d="M-10 4 Q0 12 10 4" stroke="#B45309" strokeWidth={2.5} fill="none" strokeLinecap="round" />
            <circle cx={-46} cy={30} r={13} fill="url(#hero-skin)" stroke="#C2793F" strokeWidth={2} />
            <path d="M28 30 Q52 4 46 -16" stroke="url(#hero-suit)" strokeWidth={17} fill="none" strokeLinecap="round" />
            <circle cx={46} cy={-18} r={13} fill="url(#hero-skin)" stroke="#C2793F" strokeWidth={2} />
          </g>
          {[[240, 90], [60, 60], [255, 230]].map(([x, y], i) => (
            <path key={i} d={starPath(x, y, i === 0 ? 16 : 9, i === 0 ? 7 : 4)} fill="#FDE68A" opacity={0.85} />
          ))}
        </svg>
      )
    case 'superheroina':
      return (
        <svg {...common} viewBox="0 0 300 400">
          <defs>
            <MascotGradient id="heroina-cape" light="#F472B6" dark="#BE185D" />
            <MascotGradient id="heroina-suit" light="#A78BFA" dark="#6D28D9" />
            <MascotGradient id="heroina-skin" light="#FDE0C4" dark="#F2B681" />
            <MascotGradient id="heroina-hair" light="#7C3AED" dark="#4C1D95" />
          </defs>
          {groundShadow(230, 375, 52)}
          <g transform="translate(230 340) scale(0.66)" strokeLinejoin="round">
            <path d="M-30 -14 Q-70 16 -55 86 Q-30 56 -15 66 Z" fill="url(#heroina-cape)" stroke="#9D174D" strokeWidth={2.5} />
            <path d="M30 -14 Q70 16 55 86 Q30 56 15 66 Z" fill="url(#heroina-cape)" stroke="#9D174D" strokeWidth={2.5} />
            <path d="M-30 18 Q-36 66 0 78 Q36 66 30 18 Q0 32 -30 18 Z" fill="url(#heroina-suit)" stroke="#5B21B6" strokeWidth={2.5} />
            <path d={starPath(0, 44, 12, 5.5)} fill="#FBCFE8" />
            <path d="M-34 -46 Q0 -66 34 -46 Q40 0 24 22 Q0 4 -24 22 Q-40 0 -34 -46 Z" fill="url(#heroina-hair)" />
            <circle cx={0} cy={-20} r={32} fill="url(#heroina-skin)" stroke="#C2793F" strokeWidth={2.5} />
            <path d="M-32 -24 Q0 -44 32 -24 L28 -10 Q0 -26 -28 -10 Z" fill="url(#heroina-suit)" stroke="#5B21B6" strokeWidth={2.5} />
            {sparkleEye(-12, -16, 8.5)}
            {sparkleEye(12, -16, 8.5)}
            {blush(-19, -4, 6.5)}
            {blush(19, -4, 6.5)}
            <path d="M-9 2 Q0 9 9 2" stroke="#B45309" strokeWidth={2.5} fill="none" strokeLinecap="round" />
            <circle cx={-28} cy={-40} r={9} fill="url(#heroina-hair)" />
            <circle cx={28} cy={-40} r={9} fill="url(#heroina-hair)" />
            <circle cx={44} cy={28} r={12} fill="url(#heroina-skin)" stroke="#C2793F" strokeWidth={2} />
            <path d="M-26 28 Q-50 2 -44 -18" stroke="url(#heroina-suit)" strokeWidth={16} fill="none" strokeLinecap="round" />
            <circle cx={-44} cy={-18} r={12} fill="url(#heroina-skin)" stroke="#C2793F" strokeWidth={2} />
          </g>
          {[[50, 90], [230, 60], [45, 230]].map(([x, y], i) => (
            <path key={i} d={starPath(x, y, i === 0 ? 16 : 9, i === 0 ? 7 : 4)} fill="#FBCFE8" opacity={0.85} />
          ))}
        </svg>
      )
    case 'pijamas':
      return (
        <svg {...common} viewBox="0 0 300 400">
          <g transform="translate(230 90)">
            <path d="M30 -30 A38 38 0 1 0 32 40 A30 30 0 1 1 30 -30 Z" fill="#FDE68A" opacity={0.9} />
          </g>
          {[[70, 60], [180, 40], [60, 150], [250, 200], [90, 250], [220, 300]].map(([x, y], i) => (
            <path key={i} d={starPath(x, y, i % 2 === 0 ? 8 : 5, 3)} fill="#ffffff" opacity={0.85} />
          ))}
          <g transform="translate(70 350)" opacity={0.9}>
            <path d="M-45 0 Q-45 -30 0 -30 Q45 -30 45 0 Z" fill="#818CF8" />
            <rect x={-45} y={0} width={90} height={14} rx={4} fill="#6366F1" />
          </g>
          <text x={165} y={330} fontSize={26} fill="#ffffff" opacity={0.7} fontFamily="inherit">
            Zzz
          </text>
        </svg>
      )
    case 'kpop':
      return (
        <svg {...common} viewBox="0 0 300 400">
          <g opacity={0.25}>
            {[60, 150, 240].map((x, i) => (
              <polygon key={i} points={`${x},0 ${x - 40},400 ${x + 40},400`} fill={['#F472B6', '#A78BFA', '#38BDF8'][i]} />
            ))}
          </g>
          <g transform="translate(150 335)">
            <ellipse cx={0} cy={-38} rx={14} ry={18} fill="#F5D0FE" />
            <rect x={-3} y={-20} width={6} height={26} fill="#E9D5FF" />
            <path d="M-16 6 L16 6 L10 16 L-10 16 Z" fill="#E9D5FF" />
            {Array.from({ length: 10 }).map((_, i) => (
              <line key={i} x1={0} y1={-56} x2={Math.cos((Math.PI * i) / 9 - Math.PI) * 15} y2={-56 + Math.sin((Math.PI * i) / 9 - Math.PI) * 15} stroke="#F5D0FE" strokeWidth={1} />
            ))}
          </g>
          {[[60, 80], [230, 120], [80, 260], [240, 300], [40, 340]].map(([x, y], i) => (
            <path key={i} d={starPath(x, y, i % 2 === 0 ? 7 : 5, 3)} fill="#ffffff" opacity={0.85} />
          ))}
          {[[190, 200], [110, 150]].map(([x, y], i) => (
            <text key={i} x={x} y={y} fontSize={20} fill="#ffffff" opacity={0.75}>
              ♪
            </text>
          ))}
        </svg>
      )
    case 'confeti':
    default:
      return (
        <svg {...common} viewBox="0 0 300 400">
          {[
            [30, 40, '#F472B6', 'c'],
            [270, 70, '#FBBF24', 't'],
            [250, 340, '#34D399', 'c'],
            [40, 330, '#7C3AED', 's'],
            [150, 30, '#FBBF24', 's'],
            [90, 370, '#F472B6', 't'],
            [220, 190, '#34D399', 'c'],
            [60, 190, '#7C3AED', 't'],
          ].map(([x, y, color, shape], i) =>
            shape === 'c' ? (
              <circle key={i} cx={x as number} cy={y as number} r={5} fill={color as string} opacity={0.8} />
            ) : shape === 's' ? (
              <rect key={i} x={(x as number) - 4} y={(y as number) - 4} width={8} height={8} rx={2} fill={color as string} opacity={0.8} transform={`rotate(20 ${x} ${y})`} />
            ) : (
              <polygon key={i} points={`${x as number},${(y as number) - 6} ${(x as number) + 6},${(y as number) + 5} ${(x as number) - 6},${(y as number) + 5}`} fill={color as string} opacity={0.8} />
            ),
          )}
        </svg>
      )
  }
}

function starPath(cx: number, cy: number, outerR: number, innerR: number): string {
  let d = ''
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? outerR : innerR
    const a = (Math.PI * i) / 4 - Math.PI / 2
    const x = cx + Math.cos(a) * r
    const y = cy + Math.sin(a) * r
    d += (i === 0 ? 'M' : 'L') + x + ' ' + y + ' '
  }
  return d + 'Z'
}

function ballPentagon(cx: number, cy: number, r: number): string {
  return Array.from({ length: 5 })
    .map((_, k) => {
      const a = (Math.PI * 2 * k) / 5 - Math.PI / 2
      return `${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`
    })
    .join(' ')
}

// Petición real: "deberían ser más elaborados, especialmente los
// personajes... que gusten tanto a niños como a padres" — degradado
// suave (esfera con luz), contorno tipo pegatina, sombra en el suelo,
// brillo en el ojo y mofletes sonrosados, en vez de formas planas de un
// solo color. Se reutiliza en todas las mascotas (monstruo, osito,
// gatito, dinosaurio, unicornio, superhéroes, robot).
function MascotGradient({ id, light, dark }: { id: string; light: string; dark: string }) {
  return (
    <radialGradient id={id} cx="32%" cy="26%" r="80%">
      <stop offset="0%" stopColor={light} />
      <stop offset="100%" stopColor={dark} />
    </radialGradient>
  )
}

function groundShadow(cx: number, cy: number, rx: number) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={rx * 0.26} fill="#000000" opacity={0.15} />
}

function sparkleEye(cx: number, cy: number, r: number, pupil = '#1F2937') {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#ffffff" />
      <circle cx={cx} cy={cy} r={r * 0.62} fill={pupil} />
      <circle cx={cx - r * 0.28} cy={cy - r * 0.28} r={r * 0.24} fill="#ffffff" />
    </g>
  )
}

function blush(cx: number, cy: number, r: number, color = '#F472B6') {
  return <ellipse cx={cx} cy={cy} rx={r} ry={r * 0.68} fill={color} opacity={0.4} />
}

// Petición real: "obras de arte" — cuando la plantilla trae una imagen
// propia (template.image, encargada fuera con licencia en regla), se
// usa esa foto en vez del dibujo SVG; si no, cae al arte por reglas de
// siempre. Mismo sitio para el editor y para la vista previa de solo
// lectura, así no hay que tocar dos veces cuando llegue cada imagen.
export function InvitationBackground({ templateKey }: { templateKey: string | null }) {
  const template = INVITATION_TEMPLATES.find((t) => t.key === templateKey)
  if (template?.image) {
    return <img src={template.image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
  }
  return <InvitationBackgroundArt artKey={template?.artKey ?? 'confeti'} />
}

// Petición real: "no quiero que vean todos esos chips para empezar" —
// con 96 temas, una fila de chips que se envuelve obliga a repasarlos
// todos. En su lugar: un botón que abre una rueda horizontal de
// miniaturas (ya en el orden de sortInvitationTemplatesForEvent, más
// probable primero) que se desliza con el dedo — scroll nativo con
// scroll-snap, sin librería de gestos — y un toque selecciona y cierra.
export function InvitationTemplatePicker({
  templates,
  selectedKey,
  onSelect,
}: {
  templates: InvitationTemplateMeta[]
  selectedKey: string
  onSelect: (template: InvitationTemplateMeta) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = templates.find((t) => t.key === selectedKey) ?? templates[0]
  const selectedThumbRef = useRef<HTMLButtonElement>(null)
  const didCenterOnce = useRef(false)

  // Petición real: "que la rueda vuelva a abrirse donde te quedaste, no
  // de nuevo al principio" — la rueda se queda siempre montada (solo se
  // oculta con display:none) para que el navegador conserve el scroll
  // entre un cierre y la siguiente apertura; lo único que se hace a
  // mano es centrar la seleccionada la primera vez que aparece.
  useEffect(() => {
    if (open && !didCenterOnce.current) {
      didCenterOnce.current = true
      selectedThumbRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' })
    }
  }, [open])

  return (
    <div className="invitation-template-picker">
      <button type="button" className="invitation-template-toggle" onClick={() => setOpen((v) => !v)}>
        🎨 Elige tu plantilla — {selected.label} {open ? '▲' : '▼'}
      </button>
      <div className="invitation-template-carousel" style={{ display: open ? 'flex' : 'none' }}>
        {templates.map((t) => (
          <button
            key={t.key}
            type="button"
            ref={t.key === selectedKey ? selectedThumbRef : undefined}
            className={'invitation-template-thumb' + (t.key === selectedKey ? ' invitation-template-thumb-active' : '')}
            onClick={() => {
              onSelect(t)
              setOpen(false)
            }}
          >
            <span className="invitation-template-thumb-preview">
              <InvitationBackground templateKey={t.key} />
            </span>
            <span className="invitation-template-thumb-label">{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function InvitationCanvasView({
  canvas,
  templateKey,
  photoUrls,
  backgroundImageUrl,
}: {
  canvas: InvitationCanvas
  templateKey: string | null
  photoUrls: Record<string, string>
  backgroundImageUrl?: string | null
}) {
  const template = INVITATION_TEMPLATES.find((t) => t.key === templateKey)
  const aspectRatio = !backgroundImageUrl && template?.imageAspect ? `${template.imageAspect} / 1` : '3 / 4'
  // Bug real reportado en vivo (iPhone, plantilla "boda"): el <div> de una capa de texto se posiciona con
  // `left` + `transform: translate(-50%,-50%)` pero sin `width` propio — un position:absolute sin width usa
  // "shrink-to-fit" acotado por (ancho del contenedor - left), NUNCA el ancho de la textArea de la
  // plantilla. Para una capa centrada (x=0.5, el caso normal) eso deja solo ~la mitad del ancho real que
  // estimateWrappedLineCount/autoArrangeLayers asumían (zone.width) — el texto ajustaba línea mucho antes de
  // lo estimado, así que el bloque pintado de verdad era más alto que el estimado y solapaba con la capa
  // siguiente, por mucho que se subiera AVG_CHAR_WIDTH_RATIO o se ampliara la zona. Se fija aquí el mismo
  // ancho (zoneWidthFrac) que ya usan esas funciones, igual que LINE_HEIGHT_RATIO se fija como line-height
  // real — para que el ajuste de línea real coincida con el estimado en las 100 plantillas.
  const zoneWidthFrac = backgroundImageUrl ? DEFAULT_TEXT_AREA.width : (template?.textArea ?? DEFAULT_TEXT_AREA).width
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio,
        borderRadius: 16,
        overflow: 'hidden',
        background: canvas.backgroundGradient || INVITATION_TEMPLATES[0].gradient,
      }}
    >
      {backgroundImageUrl ? (
        <img
          src={backgroundImageUrl}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `translate(${(canvas.backgroundOffsetX ?? 0) * 100}%, ${(canvas.backgroundOffsetY ?? 0) * 100}%) scale(${canvas.backgroundScale ?? 1})`,
          }}
        />
      ) : (
        <InvitationBackground templateKey={templateKey} />
      )}
      {canvas.layers
        .slice()
        .sort((a, b) => a.zIndex - b.zIndex)
        .map((layer) => {
          const isWrappingText = (layer.type === 'text' || layer.type === 'event_data') && !layer.curve
          return (
            <div
              key={layer.id}
              style={{
                position: 'absolute',
                left: `${layer.x * 100}%`,
                top: `${layer.y * 100}%`,
                width: isWrappingText ? `${zoneWidthFrac * 100}%` : undefined,
                transform: `translate(-50%, -50%) rotate(${layer.rotation}deg) scale(${layer.scale})`,
                opacity: layer.opacity ?? 1,
              }}
            >
              <InvitationLayerVisual layer={layer} photoUrls={photoUrls} />
            </div>
          )
        })}
    </div>
  )
}

const LAYER_COLOR_PRESETS = ['#ffffff', '#1f2233', '#4C6EF5', '#F472B6', '#FBBF24', '#34D399']
const LAYER_FONT_OPTIONS: { value: string; label: string }[] = [
  { value: 'inherit', label: 'Normal' },
  { value: 'Georgia, serif', label: 'Con serifa' },
  { value: '"Brush Script MT", cursive', label: 'Manuscrita' },
]

// Fase 3 Bloque 2 — alineación real por capa (antes textAlign: 'center' fijo para todas). Solo 3 opciones,
// sin ambigüedad de icono: ninguna requiere leyenda aparte para entenderse de un vistazo en móvil.
const ALIGN_OPTIONS: { value: InvitationTextAlign; icon: string; label: string }[] = [
  { value: 'left', icon: '⬅', label: 'Alinear a la izquierda' },
  { value: 'center', icon: '↔', label: 'Centrar' },
  { value: 'right', icon: '➡', label: 'Alinear a la derecha' },
]

const TEXT_STYLE_OPTIONS: { value: InvitationTextStyle; label: string }[] = [
  { value: '3d', label: '🧊 3D' },
  { value: 'sparkle', label: '✨ Purpurina' },
  { value: 'rainbow_static', label: '🌈 Arcoíris fijo' },
  { value: 'rainbow_animated', label: '🌈 Arcoíris animado' },
  { value: 'iridescent', label: '🌟 Iridiscente' },
  { value: 'metallic', label: '🥈 Metalizado' },
]

// Fase 3 Bloque 5B — etiquetas legibles para el aviso "Han cambiado: ..." (sección 26/28). 'closing' nunca
// aparece aquí (no es un dato del evento, nunca lleva `source`).
const EVENT_FIELD_LABELS: Record<Exclude<AutoComposeFieldKey, 'closing'>, string> = {
  title: 'el título',
  subtitle: 'la edad',
  fecha: 'la fecha',
  hora: 'la hora',
  lugar: 'el lugar',
  ceremonia: 'la ceremonia',
  celebracion: 'la celebración',
}

interface DragState {
  mode: 'move' | 'transform'
  layerId: string
  // 'move'
  startClientX?: number
  startClientY?: number
  rectW?: number
  rectH?: number
  x0?: number
  y0?: number
  // 'transform'
  centerPx?: { x: number; y: number }
  dist0?: number
  angle0?: number
  scale0?: number
  rotation0?: number
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

// INV-EDITOR-3 — Deshacer de verdad: un snapshot completo (capas Y fondo — plantilla, degradado, foto de
// fondo propia y su pan/zoom), no solo las capas. Antes "Restaurar plantilla"/"foto de fondo" pushHistory
// solo guardaba las capas, así que Deshacer nunca recuperaba la foto de fondo que esas acciones borraban.
interface EditorSnapshot {
  layers: InvitationLayer[]
  templateKey: string
  backgroundGradient: string
  backgroundImagePath: string | null
  backgroundImageUrl: string | null
  backgroundOffsetX: number
  backgroundOffsetY: number
  backgroundScale: number
  // Fase 3 Bloque 5B — mismo criterio que el resto del fondo (arriba): la zona de escritura de una
  // plantilla propia también es parte del snapshot completo, para que Deshacer/Rehacer la recuperen igual.
  customTextArea: SafeZone | null
}

// Constante nombrada en vez de un número mágico — cuántas operaciones deshacibles se conservan a la vez.
const MAX_HISTORY_ENTRIES = 20

// INV-EDITOR-5 — cambios sin guardar: comparación textual del snapshot SIN backgroundImageUrl (una URL
// firmada nueva en cada carga no es un cambio real de contenido, solo cambiaría el token de la firma).
function comparableSnapshotKey(s: EditorSnapshot): string {
  const { backgroundImageUrl: _unused, ...rest } = s
  return JSON.stringify(rest)
}

// INV-EDITOR-4 — reforma UX móvil: un único panel secundario (popover compacto) a la vez, según qué está
// seleccionado — nunca el antiguo bloque fijo con todos los controles a la vista simultáneamente.
type DesignerPanel = 'plantilla' | 'texto' | 'datos' | 'emoji' | 'forma' | 'color' | 'fuente' | 'efecto' | 'tamano' | 'mas' | 'pepa'

export function InvitationCanvasEditor({ event, onClose, onSaved }: { event: FamilyEvent; onClose: () => void; onSaved: () => void }) {
  const sortedTemplates = useMemo(() => sortInvitationTemplatesForEvent(INVITATION_TEMPLATES, event), [event])
  // Fase 3 Bloque 2 — solo los datos reales del evento (ver buildInvitationDataFields): nunca se inventa
  // ningún campo ausente, la lista puede salir corta o vacía si el evento todavía no tiene esos datos.
  const invitationDataFields = useMemo(() => buildInvitationDataFields(event), [event])
  const [templateKey, setTemplateKey] = useState(sortedTemplates[0].key)
  const [backgroundGradient, setBackgroundGradient] = useState(sortedTemplates[0].gradient)
  const [layers, setLayers] = useState<InvitationLayer[]>([])
  const [history, setHistory] = useState<EditorSnapshot[]>([])
  // Bloque 4 — ↪️ Rehacer: pila separada de snapshots "deshechos", en el mismo formato que `history`. Se
  // vacía cada vez que se apila una entrada nueva en `history` (pushHistory) — así una edición nueva tras
  // un Deshacer borra la rama redo, como en cualquier editor (Estado A→B→C, deshacer a B, editar a D: C
  // desaparece, no queda accesible).
  const [future, setFuture] = useState<EditorSnapshot[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // INV-EDITOR-3 — mientras el usuario sigue "dentro" de la misma edición continua (escribiendo en el
  // mismo campo de texto, arrastrando el mismo slider/selector de color), esta clave impide crear un
  // snapshot por cada pulsación/tick: solo se guarda historial al EMPEZAR una edición nueva (clave
  // distinta a la anterior); terminar el gesto (blur/soltar) la borra, para que la siguiente edición del
  // mismo campo vuelva a contar como una operación deshacible aparte.
  const continuousEditRef = useRef<string | null>(null)
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  // Petición real: "que cualquier usuario pueda importar una imagen
  // que le guste para hacer la invitación" — foto de fondo A PANTALLA
  // COMPLETA (distinta de "+ Foto", que añade una capa suelta movible)
  // — sustituye al degradado/dibujo de la plantilla, guardada en
  // event_invitations.background_image_path (columna ya existía desde
  // la Fase 0, sin usar hasta ahora).
  const [backgroundImagePath, setBackgroundImagePath] = useState<string | null>(null)
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(null)
  // Petición real: "que se pueda ajustar el tamaño del fondo con los
  // dedos, con un botón ajustar fondo que sea editable si está marcado
  // y cuando no lo está esté fijo" — arrastrar mueve, pellizcar con dos
  // dedos hace zoom; solo activo mientras adjustingBackground es true,
  // para no interferir con el arrastre normal de las capas de texto.
  const [backgroundOffsetX, setBackgroundOffsetX] = useState(0)
  const [backgroundOffsetY, setBackgroundOffsetY] = useState(0)
  const [backgroundScale, setBackgroundScale] = useState(1)
  const [adjustingBackground, setAdjustingBackground] = useState(false)
  const bgDragRef = useRef<{ pointers: Map<number, { x: number; y: number }>; startOffsetX: number; startOffsetY: number; startScale: number; startDist: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [uploadingBackground, setUploadingBackground] = useState(false)
  // INV-EDITOR-4 — un único panel secundario abierto a la vez (color/fuente/efecto/tamaño/curva.../
  // plantilla/emoji/forma), en vez del antiguo bloque fijo permanente con todos los controles a la vista.
  const [panel, setPanel] = useState<DesignerPanel | null>(null)
  // Corrección UX (2026-09-27) — dentro del modo de edición de texto ("panel === 'texto'"), cuál de las
  // dos filas secundarias (fuente/color) está desplegada — como mucho una a la vez, igual criterio que
  // `panel` para el resto del editor. Se resetea sola al salir del modo de edición (ver useEffect abajo).
  const [textEditTool, setTextEditTool] = useState<'font' | 'color' | null>(null)
  // Corrección UX — alto real visible (visualViewport) para no dejar la barra de edición de texto detrás
  // del teclado en iOS/Android: iOS no encoge `vh` cuando aparece el teclado (solo el visualViewport), así
  // que sin esto la hoja del diseñador (88vh) se queda con el mismo alto de siempre y su parte de abajo
  // (justo donde viven los controles de texto) termina tapada. Se mide siempre que el editor está montado
  // (barato, no hace nada mientras no hay teclado) pero solo se APLICA en el modo de edición de texto — el
  // resto del diseñador no cambia de tamaño nunca por esto.
  const [keyboardInset, setKeyboardInset] = useState(0)
  const [customEmoji, setCustomEmoji] = useState('')
  // Fase 3 Bloque 3 — "🕘 Recientes": se carga una vez al montar (no cambia mientras el editor está
  // abierto salvo que el propio usuario inserte un emoji, ver handleInsertEmoji).
  const [recentEmoji, setRecentEmoji] = useState<string[]>(() => loadRecentInvitationEmoji())
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  // Fase 3 Bloque 5B — arrastre del rectángulo de "zona de escritura" (mover/redimensionar), mismo patrón
  // que dragRef pero con su propio estado (geometría 0..1, no x/y/rotation/scale de una capa).
  const textAreaDragRef = useRef<{ mode: 'move' | 'resize'; startClientX: number; startClientY: number; rect0: SafeZone; canvasRect: DOMRect } | null>(null)
  // 2026-09-27 — solape real reportado en vivo (iPhone, "dinosaurios"/"espacio", imageAspect bajo ~0.43):
  // tras "Pepa, hazla bonita" el icono/título/mensaje aparecían superpuestos en el dispositivo real, aunque
  // el cálculo de fracciones (con measureText, ver d082f7b) daba hueco de sobra y no se reprodujo en ningún
  // entorno de escritorio probado — no se pudo aislar la causa exacta (posible diferencia real entre
  // Canvas measureText y el renderizado DOM en Safari/iOS para este rango de imageAspect). En vez de seguir
  // afinando una estimación que ya ha demostrado poder desviarse del render real, esta segunda pasada mide
  // el alto YA PINTADO de verdad (getBoundingClientRect) justo después de "Pepa" y separa las capas que
  // sigan tocándose — corrige el problema sea cual sea su causa real, sin tocar la estimación en sí.
  const layerElsRef = useRef<Map<string, HTMLDivElement>>(new Map())
  const reconcilePendingRef = useRef(false)
  // INV-EDITOR-5 — cambios sin guardar: el snapshot (comparable) tal como se cargó o se guardó por
  // última vez. null mientras sigue cargando (todavía no hay nada con lo que comparar).
  const savedSnapshotRef = useRef<string | null>(null)
  const [confirmingExit, setConfirmingExit] = useState(false)

  // ---------------------------------------------------------------------------------------------------
  // Fase 3 Bloque 5B — "✨ Pepa, hazla por mí" + plantilla propia + seguimiento de datos del evento.
  // ---------------------------------------------------------------------------------------------------
  // Zona de escritura confirmada por el usuario para un fondo importado propio (secciones 10-16). null =
  // fondo no propio, o propio pero sin zona confirmada todavía (Hazla bonita/por mí caen a DEFAULT_TEXT_AREA,
  // como siempre — sin ningún cambio para invitaciones guardadas antes de este bloque).
  const [customTextArea, setCustomTextArea] = useState<SafeZone | null>(null)
  const [definingTextArea, setDefiningTextArea] = useState(false)
  const [draftTextArea, setDraftTextArea] = useState<SafeZone>(DEFAULT_TEXT_AREA)
  // Asistente "Pepa, hazla por mí" (secciones 3-9): estilo elegido, foto (solo para "con foto") y errores
  // propios del asistente — nunca reutiliza `error` (ese es el de "Hazla bonita"/guardar).
  const [pepaStyle, setPepaStyle] = useState<AutoComposeStyle | null>(null)
  const [pepaUploadingPhoto, setPepaUploadingPhoto] = useState(false)
  const [pepaError, setPepaError] = useState<string | null>(null)
  // Sección 20 — regenerar sobre contenido ya existente pide confirmación antes de sustituirlo.
  const [pendingPepaGeneration, setPendingPepaGeneration] = useState<{ style: AutoComposeStyle; photoPath: string | null } | null>(null)
  // Secciones 26-33 — seguimiento de datos del evento: aviso al abrir el editor (si hay cambios) y panel de
  // actualización selectiva. `changesBannerDismissed` es solo de esta sesión de edición (no se persiste).
  const [changesBannerDismissed, setChangesBannerDismissed] = useState(false)
  const [showUpdatePanel, setShowUpdatePanel] = useState(false)
  const [manualFieldDecisions, setManualFieldDecisions] = useState<Record<string, 'update' | 'keep'>>({})
  const [removedFieldDecisions, setRemovedFieldDecisions] = useState<Record<string, boolean>>({})

  // Corrección UX — mide cuánto tapa el teclado (o cualquier otra barra del navegador) el visualViewport,
  // en vivo. `window.innerHeight` es el viewport de DISEÑO (el que asumen las unidades `vh`, que iOS no
  // reduce al abrir el teclado); `visualViewport.height` + `offsetTop` es lo que de verdad se ve. La
  // diferencia entre los dos es, por definición, el hueco que ha ocupado el teclado.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return
    const vv = window.visualViewport
    function update() {
      setKeyboardInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  useEffect(() => {
    getEventInvitation(event.id)
      .then(async (invitation) => {
        // Antes miraba layers.length > 0 para decidir si había "algo
        // guardado" — pero un diseño guardado con la foto de fondo en
        // blanco a propósito (0 capas) volvía a rellenarse solo al
        // reabrir. Lo que importa es si existe fila guardada, no si
        // tiene capas.
        if (invitation) {
          const loadedTemplateKey = invitation.templateKey || INVITATION_TEMPLATES[0].key
          const loadedGradient = invitation.canvas.backgroundGradient || INVITATION_TEMPLATES[0].gradient
          const loadedOffsetX = invitation.canvas.backgroundOffsetX ?? 0
          const loadedOffsetY = invitation.canvas.backgroundOffsetY ?? 0
          const loadedScale = invitation.canvas.backgroundScale ?? 1
          const loadedCustomTextArea = invitation.canvas.customTextArea ?? null
          setTemplateKey(loadedTemplateKey)
          setBackgroundGradient(loadedGradient)
          setLayers(invitation.canvas.layers)
          setBackgroundOffsetX(loadedOffsetX)
          setBackgroundOffsetY(loadedOffsetY)
          setBackgroundScale(loadedScale)
          setCustomTextArea(loadedCustomTextArea)
          if (invitation.backgroundImagePath) {
            setBackgroundImagePath(invitation.backgroundImagePath)
            getInvitationPhotoUrl(invitation.backgroundImagePath)
              .then(setBackgroundImageUrl)
              .catch(() => {})
          }
          // INV-EDITOR-5 — "lo guardado" es esto, no lo que haya en pantalla (backgroundImageUrl aún no
          // ha llegado, pero no forma parte de la comparación — ver comparableSnapshotKey).
          savedSnapshotRef.current = comparableSnapshotKey({
            layers: invitation.canvas.layers,
            templateKey: loadedTemplateKey,
            backgroundGradient: loadedGradient,
            backgroundImagePath: invitation.backgroundImagePath,
            backgroundImageUrl: null,
            backgroundOffsetX: loadedOffsetX,
            backgroundOffsetY: loadedOffsetY,
            backgroundScale: loadedScale,
            customTextArea: loadedCustomTextArea,
          })
          const paths = invitation.canvas.layers.map((l) => l.photoPath).filter((p): p is string => !!p)
          const urls = await Promise.all(paths.map((p) => getInvitationPhotoUrl(p).catch(() => null)))
          const map: Record<string, string> = {}
          paths.forEach((p, i) => {
            if (urls[i]) map[p] = urls[i] as string
          })
          setPhotoUrls(map)
        } else {
          const initialLayers = buildInvitationTemplateLayers(event, sortedTemplates[0])
          setLayers(initialLayers)
          savedSnapshotRef.current = comparableSnapshotKey({
            layers: initialLayers,
            templateKey: sortedTemplates[0].key,
            backgroundGradient: sortedTemplates[0].gradient,
            backgroundImagePath: null,
            backgroundImageUrl: null,
            backgroundOffsetX: 0,
            backgroundOffsetY: 0,
            backgroundScale: 1,
            customTextArea: null,
          })
        }
      })
      .catch((err) => setError(errorMessage(err, 'No se pudo cargar el diseño')))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id])

  const selected = layers.find((l) => l.id === selectedId) ?? null

  function currentSnapshot(): EditorSnapshot {
    return { layers, templateKey, backgroundGradient, backgroundImagePath, backgroundImageUrl, backgroundOffsetX, backgroundOffsetY, backgroundScale, customTextArea }
  }

  function pushHistory() {
    setHistory((h) => [...h.slice(-(MAX_HISTORY_ENTRIES - 1)), currentSnapshot()])
    // Bloque 4 — CUALQUIER operación nueva pasa por aquí (mover, redimensionar, cambiar color/fuente/
    // tamaño/alineación, añadir/borrar/duplicar, cambiar de plantilla, fondo importado...), así que vaciar
    // `future` aquí basta para que la regla "una edición nueva borra la rama redo" se cumpla siempre, sin
    // tener que tocar cada función una por una.
    setFuture([])
  }

  function applySnapshot(s: EditorSnapshot) {
    setLayers(s.layers)
    setTemplateKey(s.templateKey)
    setBackgroundGradient(s.backgroundGradient)
    setBackgroundImagePath(s.backgroundImagePath)
    setBackgroundImageUrl(s.backgroundImageUrl)
    setBackgroundOffsetX(s.backgroundOffsetX)
    setBackgroundOffsetY(s.backgroundOffsetY)
    setBackgroundScale(s.backgroundScale)
    setCustomTextArea(s.customTextArea)
  }

  function handleUndo() {
    if (history.length === 0) return
    const prev = history[history.length - 1]
    setFuture((f) => [...f.slice(-(MAX_HISTORY_ENTRIES - 1)), currentSnapshot()])
    applySnapshot(prev)
    setHistory((h) => h.slice(0, -1))
    continuousEditRef.current = null
  }

  function handleRedo() {
    if (future.length === 0) return
    const next = future[future.length - 1]
    setHistory((h) => [...h.slice(-(MAX_HISTORY_ENTRIES - 1)), currentSnapshot()])
    applySnapshot(next)
    setFuture((f) => f.slice(0, -1))
    continuousEditRef.current = null
  }

  // Selecciona (o deselecciona) un elemento — SIEMPRE cierra cualquier edición continua en curso y
  // cualquier panel abierto, para que ni una edición ni un panel del elemento anterior "sigan corriendo"
  // sobre el nuevo tras cambiar de selección.
  function selectLayer(id: string | null) {
    continuousEditRef.current = null
    setPanel(null)
    setSelectedId(id)
  }

  function togglePanel(p: DesignerPanel) {
    setPanel((cur) => (cur === p ? null : p))
  }

  // Cambio discreto (un clic completo: preset de color, fuente, estilo de texto, tamaño ±...) — cada uno
  // es su propia operación deshacible, siempre.
  function updateSelectedDiscrete(patch: Partial<InvitationLayer>) {
    if (!selectedId) return
    pushHistory()
    setLayers((ls) => ls.map((l) => (l.id === selectedId ? { ...l, ...patch } : l)))
  }

  // Cambio continuo (escribir texto, arrastrar la rueda de color o el slider de curva) — solo abre un
  // snapshot nuevo al EMPEZAR a editar ese campo; mientras siga siendo el mismo campo, se actualiza sin
  // apilar historial. `commitContinuousEdit` (blur/soltar el gesto) cierra la sesión.
  function updateSelectedContinuous(patch: Partial<InvitationLayer>, fieldKey: string) {
    if (!selectedId) return
    if (continuousEditRef.current !== fieldKey) {
      pushHistory()
      continuousEditRef.current = fieldKey
    }
    setLayers((ls) => ls.map((l) => (l.id === selectedId ? { ...l, ...patch } : l)))
  }

  function commitContinuousEdit() {
    continuousEditRef.current = null
  }

  function handleAddLayer(layer: InvitationLayer) {
    pushHistory()
    const maxZ = layers.reduce((m, l) => Math.max(m, l.zIndex), 0)
    setLayers((ls) => [...ls, { ...layer, zIndex: maxZ + 1 }])
    selectLayer(layer.id)
  }

  // Fase 3 Bloque 3 — inserta un emoji (de la biblioteca, de la búsqueda o de "Recientes") y lo apunta como
  // reciente — mismo criterio de "operación normal" que cualquier otra capa: se puede mover, cambiar de
  // tamaño, duplicar o borrar después sin ninguna diferencia.
  function handleInsertEmoji(char: string) {
    handleAddLayer(makeInvitationLayer('emoji', { text: char, fontSize: 48 }))
    recordRecentInvitationEmoji(char)
    setRecentEmoji(loadRecentInvitationEmoji())
  }

  function handleDuplicate() {
    if (!selected) return
    pushHistory()
    const maxZ = layers.reduce((m, l) => Math.max(m, l.zIndex), 0)
    const copy: InvitationLayer = { ...selected, id: `${selected.id}-copy-${Date.now()}`, x: clamp(selected.x + 0.05, 0, 1), y: clamp(selected.y + 0.05, 0, 1), zIndex: maxZ + 1 }
    setLayers((ls) => [...ls, copy])
    selectLayer(copy.id)
  }

  function handleDeleteSelected() {
    if (!selectedId) return
    pushHistory()
    setLayers((ls) => ls.filter((l) => l.id !== selectedId))
    selectLayer(null)
  }

  function handleReorder(direction: 1 | -1) {
    if (!selected) return
    pushHistory()
    const sorted = [...layers].sort((a, b) => a.zIndex - b.zIndex)
    const idx = sorted.findIndex((l) => l.id === selected.id)
    const swapIdx = idx + direction
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    const tmp = sorted[idx].zIndex
    sorted[idx].zIndex = sorted[swapIdx].zIndex
    sorted[swapIdx].zIndex = tmp
    setLayers(sorted)
  }

  // INV-EDITOR-6 — "Restaurar plantilla" SOLO repone las capas (icono/título/mensaje) a la posición de
  // la plantilla elegida. Antes también borraba en silencio la foto de fondo propia (si había una) —
  // ahora nunca la toca: quitar la foto de fondo es una acción aparte y explícita ("Quitar foto de
  // fondo", más abajo). Sigue siendo una única operación deshacible con "↩️ Deshacer".
  function handleRestoreTemplate() {
    pushHistory()
    setLayers(buildInvitationTemplateLayers(event, INVITATION_TEMPLATES.find((t) => t.key === templateKey)))
    selectLayer(null)
  }

  async function handleBackgroundPhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadingBackground(true)
    setError(null)
    try {
      const path = await uploadInvitationPhoto(event.id, file)
      const url = await getInvitationPhotoUrl(path)
      // Petición real: "para la foto subida debe ser editable de 0, ya
      // que es probable que sean plantillas que no sean nuestras y que
      // las quieran rellenar" — el icono/título/fecha que rellenamos
      // por defecto tiene sentido sobre nuestro propio arte, pero sobre
      // una plantilla ajena (traída de fuera) solo estorbaría. Se borra
      // solo la primera vez que se sube una foto de fondo, no en cada
      // cambio posterior, para no tirar un diseño ya empezado.
      // INV-EDITOR-3 — ahora SIEMPRE es una operación deshacible (antes solo lo era la primera vez).
      pushHistory()
      if (!backgroundImagePath) {
        setLayers([])
        selectLayer(null)
      }
      setBackgroundImagePath(path)
      setBackgroundImageUrl(url)
      // Fase 3 Bloque 5B (sección 13) — una imagen DISTINTA invalida la zona de escritura anterior (podía
      // estar pensada para otra composición: otra cara, otra decoración). Nunca se reutiliza en silencio:
      // se abre directamente el editor visual de la zona, con una propuesta razonable ya puesta (sección 12).
      setCustomTextArea(null)
      setDraftTextArea(DEFAULT_TEXT_AREA)
      setDefiningTextArea(true)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo subir la foto de fondo'))
    } finally {
      setUploadingBackground(false)
    }
  }

  // INV-EDITOR-3 — ahora deshacible (antes no formaba parte del historial en absoluto).
  function handleRemoveBackgroundPhoto() {
    pushHistory()
    setBackgroundImagePath(null)
    setBackgroundImageUrl(null)
    setBackgroundOffsetX(0)
    setBackgroundOffsetY(0)
    setBackgroundScale(1)
    setAdjustingBackground(false)
    setCustomTextArea(null)
  }

  // Un dedo mueve (pan), dos dedos hacen zoom (pinch) — solo mientras
  // "🔧 Ajustar fondo" está activo; si no, el fondo queda fijo y los
  // toques van a las capas de texto de siempre.
  function handleBackgroundPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!adjustingBackground) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    if (!bgDragRef.current) {
      // INV-EDITOR-3 — un único snapshot al EMPEZAR el gesto (pan o pinch), nunca uno por cada pointermove.
      pushHistory()
      bgDragRef.current = { pointers: new Map(), startOffsetX: backgroundOffsetX, startOffsetY: backgroundOffsetY, startScale: backgroundScale, startDist: 0 }
    }
    bgDragRef.current.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (bgDragRef.current.pointers.size === 2) {
      const pts = [...bgDragRef.current.pointers.values()]
      bgDragRef.current.startDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1
      bgDragRef.current.startScale = backgroundScale
    } else {
      bgDragRef.current.startOffsetX = backgroundOffsetX
      bgDragRef.current.startOffsetY = backgroundOffsetY
    }
  }

  function handleBackgroundPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = bgDragRef.current
    if (!drag || !drag.pointers.has(e.pointerId)) return
    e.stopPropagation()
    const prev = drag.pointers.get(e.pointerId)!
    drag.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pts = [...drag.pointers.values()]
    if (pts.length === 2) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1
      setBackgroundScale(clamp(drag.startScale * (dist / drag.startDist), 1, 3))
    } else if (pts.length === 1 && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect()
      const dx = (e.clientX - prev.x) / rect.width
      const dy = (e.clientY - prev.y) / rect.height
      setBackgroundOffsetX((x) => clamp(x + dx, -0.5, 0.5))
      setBackgroundOffsetY((y) => clamp(y + dy, -0.5, 0.5))
    }
  }

  function handleBackgroundPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    bgDragRef.current?.pointers.delete(e.pointerId)
    if (bgDragRef.current && bgDragRef.current.pointers.size === 0) bgDragRef.current = null
  }

  function handlePrettify() {
    pushHistory()
    // INV-EDITOR-2 — la zona segura real es la de la plantilla elegida (template.textArea); con una foto
    // de fondo propia (sin plantilla de arte detrás) o una plantilla sin zona propia, cae a
    // DEFAULT_TEXT_AREA (ver domain/events.ts, autoArrangeLayers) — nunca una zona nueva inventada aquí.
    // Fase 3 Bloque 5B (sección 14) — si el usuario confirmó una zona de escritura propia para el fondo
    // importado, "Hazla bonita" la respeta en vez de asumir ciegamente DEFAULT_TEXT_AREA; sin zona
    // confirmada (o sin fondo propio) el comportamiento es EXACTAMENTE el de siempre, sin ningún cambio.
    const template = backgroundImageUrl ? undefined : INVITATION_TEMPLATES.find((t) => t.key === templateKey)
    const zone = template?.textArea ?? (backgroundImageUrl ? (customTextArea ?? undefined) : undefined)
    const result = autoArrangeLayers(layers, zone, template?.imageAspect ?? 1, domTextMeasurer)
    setLayers(result.layers)
    // Corrección tras certificación iPhone — nunca se reduce el fontSize ni se fuerza el texto a caber:
    // si de verdad no cabe ni comprimiendo los huecos al mínimo, se avisa en vez de ocultarlo.
    setError(result.overflowed ? 'El texto no cabe entero en la zona limpia de esta plantilla — prueba a acortarlo, a hacerlo más pequeño con "Tamaño", o usa otra plantilla.' : null)
    // Ver el comentario junto a layerElsRef/reconcilePendingRef: la siguiente pasada (useLayoutEffect)
    // comprueba el alto YA PINTADO de verdad y separa las capas si el estimado se quedó corto.
    reconcilePendingRef.current = true
  }

  // Segunda pasada tras "Pepa, hazla bonita": mide el alto REAL ya pintado (getBoundingClientRect) de
  // icono/título/mensaje y, si dos siguen tocándose de verdad, separa la de abajo — corrige el problema
  // igual si la causa es una diferencia real de Canvas measureText vs. el motor de texto del dispositivo,
  // sin tocar la estimación (ver domain/events.ts). useLayoutEffect (no useEffect): se ejecuta después de
  // que el DOM ya tiene las posiciones nuevas pero ANTES de que el navegador pinte ese fotograma, así que
  // si hace falta corregir, el usuario nunca llega a ver el solape a medio corregir.
  useLayoutEffect(() => {
    if (!reconcilePendingRef.current) return
    reconcilePendingRef.current = false
    const containerEl = canvasRef.current
    if (!containerEl) return
    const containerRect = containerEl.getBoundingClientRect()
    if (containerRect.height <= 0) return

    const stackedIds = layers
      .filter((l) => l.type === 'emoji' || l.type === 'text' || l.type === 'event_data')
      .sort((a, b) => a.y - b.y)
      .map((l) => l.id)

    const orderedBoxes = stackedIds.flatMap((id) => {
      const el = layerElsRef.current.get(id)
      if (!el) return []
      const r = el.getBoundingClientRect()
      if (r.height <= 0) return []
      return [{ id, top: (r.top - containerRect.top) / containerRect.height, bottom: (r.bottom - containerRect.top) / containerRect.height }]
    })
    const shifts = reconcileOverlappingBoxes(orderedBoxes)
    if (shifts.size > 0) {
      setLayers((prev) => prev.map((l) => (shifts.has(l.id) ? { ...l, y: l.y + shifts.get(l.id)! } : l)))
    }
  }, [layers])

  async function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadingPhoto(true)
    setError(null)
    try {
      const path = await uploadInvitationPhoto(event.id, file)
      const url = await getInvitationPhotoUrl(path)
      setPhotoUrls((m) => ({ ...m, [path]: url }))
      handleAddLayer(makeInvitationLayer('photo', { photoPath: path, fontSize: 130, zIndex: 0 }))
    } catch (err) {
      setError(errorMessage(err, 'No se pudo subir la foto'))
    } finally {
      setUploadingPhoto(false)
    }
  }

  function handleLayerPointerDown(e: ReactPointerEvent<HTMLDivElement>, layer: InvitationLayer) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    pushHistory()
    selectLayer(layer.id)
    const rect = canvasRef.current!.getBoundingClientRect()
    dragRef.current = { mode: 'move', layerId: layer.id, startClientX: e.clientX, startClientY: e.clientY, rectW: rect.width, rectH: rect.height, x0: layer.x, y0: layer.y }
  }

  function handleHandlePointerDown(e: ReactPointerEvent<HTMLDivElement>, layer: InvitationLayer) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    pushHistory()
    selectLayer(layer.id)
    const rect = canvasRef.current!.getBoundingClientRect()
    const centerPx = { x: rect.left + layer.x * rect.width, y: rect.top + layer.y * rect.height }
    const dx0 = e.clientX - centerPx.x
    const dy0 = e.clientY - centerPx.y
    dragRef.current = {
      mode: 'transform',
      layerId: layer.id,
      centerPx,
      dist0: Math.hypot(dx0, dy0) || 1,
      angle0: Math.atan2(dy0, dx0),
      scale0: layer.scale,
      rotation0: layer.rotation,
    }
  }

  function handleDragPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = dragRef.current
    if (!d) return
    if (d.mode === 'move') {
      const dx = (e.clientX - d.startClientX!) / d.rectW!
      const dy = (e.clientY - d.startClientY!) / d.rectH!
      setLayers((ls) => ls.map((l) => (l.id === d.layerId ? { ...l, x: clamp(d.x0! + dx, 0, 1), y: clamp(d.y0! + dy, 0, 1) } : l)))
    } else {
      const dx = e.clientX - d.centerPx!.x
      const dy = e.clientY - d.centerPx!.y
      const dist = Math.hypot(dx, dy)
      const angle = Math.atan2(dy, dx)
      const newScale = clamp(d.scale0! * (dist / d.dist0!), 0.3, 3)
      const newRotation = d.rotation0! + (angle - d.angle0!) * (180 / Math.PI)
      setLayers((ls) => ls.map((l) => (l.id === d.layerId ? { ...l, scale: newScale, rotation: newRotation } : l)))
    }
  }

  function handleDragPointerUp() {
    dragRef.current = null
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await saveEventInvitation(event.id, templateKey, { backgroundGradient, layers, backgroundOffsetX, backgroundOffsetY, backgroundScale, customTextArea }, backgroundImagePath)
      // INV-EDITOR-5 — a partir de aquí, lo guardado ya coincide con lo que se ve: deja de estar "sucio".
      savedSnapshotRef.current = comparableSnapshotKey(currentSnapshot())
      setConfirmingExit(false)
      onSaved()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar el diseño'))
    } finally {
      setSaving(false)
    }
  }

  // INV-EDITOR-5 — cambios sin guardar: true solo cuando lo que se ve de verdad difiere de lo último
  // cargado/guardado (nunca durante la carga inicial, cuando savedSnapshotRef todavía es null).
  const dirty = savedSnapshotRef.current !== null && comparableSnapshotKey(currentSnapshot()) !== savedSnapshotRef.current

  // =======================================================================================================
  // Fase 3 Bloque 5B — "✨ Pepa, hazla por mí": el editor solo decide QUÉ generar (plantilla activa ya
  // elegida con el selector de siempre + estilo + foto) y aplica el resultado del motor como UNA sola
  // operación de historial — ninguna receta ni regla de validación se reimplementa aquí (viven en
  // domain/invitationAutoCompose.ts, Bloque 5A).
  // =======================================================================================================
  const currentTemplateForPepa = INVITATION_TEMPLATES.find((t) => t.key === templateKey)
  // La "plantilla" para el motor es la que YA está activa en el editor (secciones 3-4: se elige ANTES, con
  // el selector de siempre — "Cambiar plantilla" dentro del asistente solo reabre ese mismo panel, nunca
  // uno nuevo). Con un fondo propio sin zona de escritura confirmada, no hay geometría real todavía: null.
  const activeTemplateForPepa: InvitationTemplateMeta | null = backgroundImageUrl
    ? customTextArea
      ? buildCustomTemplateMeta(customTextArea)
      : null
    : (currentTemplateForPepa ?? null)

  const pepaCompatibility: StyleCompatibility[] = useMemo(() => {
    if (!activeTemplateForPepa) return []
    return checkAllStyleCompatibility({ event, template: activeTemplateForPepa, measurer: domTextMeasurer })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, activeTemplateForPepa?.key, activeTemplateForPepa?.textArea, activeTemplateForPepa?.imageAspect])

  function hasExistingInvitationContent(): boolean {
    return layers.length > 0 || !!backgroundImagePath
  }

  function applyPepaGeneration(style: AutoComposeStyle, photoPath: string | null) {
    if (!activeTemplateForPepa) return
    const result = composeInvitationForMe({ event, template: activeTemplateForPepa, style, photoPath: photoPath ?? undefined, measurer: domTextMeasurer })
    if (result.status !== 'success') {
      // Sección 42 — el Canvas real tiene la última palabra y puede fallar aunque la comprobación de
      // compatibilidad dijera que sí (caso límite): nunca se deja una composición a medias ni se borra la
      // anterior, y se ofrece volver a elegir estilo o cambiar de plantilla (enlace ya presente en el panel).
      setPepaError('PEPA no ha conseguido colocar todo correctamente en esta plantilla. Prueba otro estilo o elige otra plantilla.')
      setPepaStyle(null)
      return
    }
    pushHistory()
    setLayers(result.layers)
    setPepaStyle(null)
    setPepaError(null)
    setPanel(null)
    selectLayer(null)
    setError(null)
  }

  // Sección 20 — regenerar sobre contenido ya existente pide confirmación antes de sustituirlo; sin
  // contenido previo (invitación recién empezada) se genera directamente.
  function requestPepaGeneration(style: AutoComposeStyle, photoPath: string | null) {
    if (hasExistingInvitationContent()) setPendingPepaGeneration({ style, photoPath })
    else applyPepaGeneration(style, photoPath)
  }

  function handlePepaSelectStyle(style: AutoComposeStyle) {
    const compat = pepaCompatibility.find((c) => c.style === style)
    if (!compat?.compatible) return
    setPepaStyle(style)
    setPepaError(null)
    // Sección 8 — la foto se pide SOLO ahora que se ha elegido "Con foto", nunca antes.
    if (style === 'con_foto') return
    requestPepaGeneration(style, null)
  }

  async function handlePepaPhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPepaUploadingPhoto(true)
    setPepaError(null)
    try {
      // Mismo pipeline de subida/compresión que ya usa "+ Foto" (sección 8) — nunca un segundo sistema.
      const path = await uploadInvitationPhoto(event.id, file)
      const url = await getInvitationPhotoUrl(path)
      setPhotoUrls((m) => ({ ...m, [path]: url }))
      requestPepaGeneration('con_foto', path)
    } catch (err) {
      setPepaError(errorMessage(err, 'No se pudo subir la foto'))
    } finally {
      setPepaUploadingPhoto(false)
    }
  }

  function confirmPepaRegeneration() {
    if (!pendingPepaGeneration) return
    applyPepaGeneration(pendingPepaGeneration.style, pendingPepaGeneration.photoPath)
    setPendingPepaGeneration(null)
  }

  // ---------------------------------------------------------------------------------------------------
  // Zona de escritura de una plantilla propia (secciones 10-16) — un único rectángulo, mover con un dedo
  // en el centro, redimensionar con el tirador de la esquina; mismo patrón de puntero (setPointerCapture +
  // fracción del rect real del lienzo) que ya usan handleLayerPointerDown/handleHandlePointerDown.
  // ---------------------------------------------------------------------------------------------------
  function confirmTextArea() {
    setCustomTextArea(draftTextArea)
    setDefiningTextArea(false)
  }

  function handleTextAreaRectPointerDown(e: ReactPointerEvent<HTMLDivElement>, mode: 'move' | 'resize') {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    textAreaDragRef.current = { mode, startClientX: e.clientX, startClientY: e.clientY, rect0: draftTextArea, canvasRect: canvasRef.current!.getBoundingClientRect() }
  }

  function handleTextAreaRectPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = textAreaDragRef.current
    if (!d) return
    e.stopPropagation()
    const dx = (e.clientX - d.startClientX) / d.canvasRect.width
    const dy = (e.clientY - d.startClientY) / d.canvasRect.height
    if (d.mode === 'move') {
      setDraftTextArea({ ...d.rect0, x: clamp(d.rect0.x + dx, 0, 1 - d.rect0.width), y: clamp(d.rect0.y + dy, 0, 1 - d.rect0.height) })
    } else {
      setDraftTextArea({ ...d.rect0, width: clamp(d.rect0.width + dx, 0.15, 1 - d.rect0.x), height: clamp(d.rect0.height + dy, 0.15, 1 - d.rect0.y) })
    }
  }

  function handleTextAreaRectPointerUp() {
    textAreaDragRef.current = null
  }

  // ---------------------------------------------------------------------------------------------------
  // Seguimiento de datos del evento (secciones 22-39) — comparación en vivo entre lo que cada capa
  // procedente del evento tenía "en su momento" (`source.valueAtInsertion`) y el dato real actual.
  // ---------------------------------------------------------------------------------------------------
  const eventDataChanges: InvitationEventDataChange[] = useMemo(() => getInvitationEventDataChanges(layers, event), [layers, event])
  const hasTrackedEventData = useMemo(() => invitationHasTrackedEventData(layers), [layers])

  function openUpdatePanel() {
    setManualFieldDecisions({})
    setRemovedFieldDecisions({})
    setShowUpdatePanel(true)
  }

  // Sección 29/33 — actualización SELECTIVA (solo los campos elegidos) aplicada como UNA sola operación de
  // historial, aunque afecte a varios campos a la vez; nunca toca texto libre, decoración, foto o plantilla.
  function applyEventDataUpdate() {
    const fieldsToUpdate: Exclude<AutoComposeFieldKey, 'closing'>[] = []
    const fieldsToRemove: Exclude<AutoComposeFieldKey, 'closing'>[] = []
    for (const change of eventDataChanges) {
      if (change.current === null) {
        // Sección 34 — dato eliminado del evento: solo se quita la capa si el usuario lo confirma aquí.
        if (removedFieldDecisions[change.field]) fieldsToRemove.push(change.field)
        continue
      }
      const layer = layers.find((l) => l.source?.field === change.field)
      const manuallyEdited = layer ? isInvitationLayerManuallyEdited(layer) : false
      if (manuallyEdited) {
        // Sección 32 — nunca se sobrescribe una personalización sin permiso explícito.
        if (manualFieldDecisions[change.field] === 'update') fieldsToUpdate.push(change.field)
      } else {
        fieldsToUpdate.push(change.field)
      }
    }
    if (fieldsToUpdate.length === 0 && fieldsToRemove.length === 0) {
      setShowUpdatePanel(false)
      return
    }
    pushHistory()
    setLayers(removeInvitationLayersForRemovedFields(updateInvitationLayersFromEvent(layers, event, fieldsToUpdate), fieldsToRemove))
    setShowUpdatePanel(false)
  }

  // Único punto de salida (✕ del encabezado y tocar fuera del modal) — si hay cambios sin guardar, pide
  // confirmación en vez de cerrar y perderlos en silencio.
  function requestClose() {
    if (dirty) setConfirmingExit(true)
    else onClose()
  }

  const currentTemplate = INVITATION_TEMPLATES.find((t) => t.key === templateKey)
  const canvasAspectRatio = !backgroundImageUrl && currentTemplate?.imageAspect ? `${currentTemplate.imageAspect} / 1` : '3 / 4'
  // Ver el comentario junto a "zoneWidthFrac" en InvitationCanvasView: sin esto, el <div> de una capa de
  // texto usa "shrink-to-fit" real (acotado por left, no por el ancho de la zona) y ajusta línea mucho antes
  // de lo que estimateWrappedLineCount asume, así que el bloque pintado de verdad puede ser más alto que el
  // estimado y solapar con la capa siguiente — el mismo editor donde se reportó el bug real en vivo.
  const zoneWidthFrac = backgroundImageUrl ? (customTextArea ?? DEFAULT_TEXT_AREA).width : (currentTemplate?.textArea ?? DEFAULT_TEXT_AREA).width

  // INV-EDITOR-4 — barra contextual: solo las herramientas que aplican al tipo seleccionado (o, sin
  // selección, las acciones para añadir/elegir plantilla) — nunca los 9 controles de siempre a la vez.
  const isTextLike = selected?.type === 'text' || selected?.type === 'event_data'
  // Corrección UX — modo de edición de texto: la barra compacta (Terminar/alineación/B/I/fuente/color/
  // tamaño) sustituye a la barra de herramientas normal SOLO mientras se edita el contenido de una capa de
  // texto. El resto de paneles (color de una forma, tamaño de una foto...) no cambian en nada.
  const textEditMode = panel === 'texto' && isTextLike
  useEffect(() => {
    if (!textEditMode) setTextEditTool(null)
  }, [textEditMode])

  return (
    <>
    <div className="modal-overlay" onClick={requestClose}>
      <div
        className="modal-sheet invitation-designer-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 420,
          // Corrección UX — solo mientras se edita texto y el teclado tapa parte de la pantalla: sube la
          // hoja y le resta exactamente ese hueco, para que la barra de edición de texto (justo encima del
          // teclado) nunca quede oculta detrás de él. Sin teclado (o fuera del modo de edición), esto no
          // hace nada — la hoja se queda con su 88vh de siempre (ver .invitation-designer-sheet en styles.css).
          ...(textEditMode && keyboardInset > 0
            ? { marginBottom: keyboardInset, height: `calc(88vh - ${keyboardInset}px)`, maxHeight: `calc(88vh - ${keyboardInset}px)` }
            : {}),
        }}
      >
        <div className="modal-header" style={{ padding: '16px 16px 0' }}>
          <h2 className="section-title" style={{ margin: 0 }}>
            Diseño de la invitación
          </h2>
          <button type="button" className="modal-close" onClick={requestClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        {error && (
          <p className="error" style={{ margin: '6px 16px 0' }}>
            {error}
          </p>
        )}
        {loading ? (
          <p className="muted" style={{ padding: '0 16px 16px' }}>
            Cargando…
          </p>
        ) : (
          <>
            <div className="invitation-utility-row">
              <button type="button" className="link-button" onClick={handleUndo} disabled={history.length === 0}>
                ↩️ Deshacer
              </button>
              <button type="button" className="link-button" onClick={handleRedo} disabled={future.length === 0}>
                ↪️ Rehacer
              </button>
              <button type="button" className="link-button" onClick={handlePrettify}>
                ✨ Pepa, hazla bonita
              </button>
              <button type="button" className="link-button" onClick={() => togglePanel('pepa')}>
                ✨ Pepa, hazla por mí
              </button>
              <button type="button" className="link-button" onClick={handleSave} disabled={saving} style={{ marginLeft: 'auto', fontWeight: 600 }}>
                {saving ? 'Guardando…' : '💾 Guardar'}
              </button>
            </div>

            {/* Fase 3 Bloque 5B (sección 26/28) — si esta invitación tiene datos con seguimiento y el
                evento cambió desde entonces, avisar ANTES de dejar editar con normalidad. */}
            {hasTrackedEventData && eventDataChanges.length > 0 && !changesBannerDismissed && !showUpdatePanel && (
              <div className="invitation-changed-data-banner" style={{ margin: '0 16px 8px', padding: 10, borderRadius: 10, background: '#FEF3C7', color: '#78350F', fontSize: 13 }}>
                <p style={{ margin: 0, fontWeight: 600 }}>⚠️ Hay datos del evento que han cambiado desde que creaste esta invitación.</p>
                <p style={{ margin: '4px 0 0' }}>
                  Han cambiado:{' '}
                  {eventDataChanges
                    .map((c) => EVENT_FIELD_LABELS[c.field])
                    .filter(Boolean)
                    .join(', ')}
                  .
                </p>
                <div className="filter-row" style={{ marginTop: 8 }}>
                  <button type="button" className="chip chip-active" onClick={openUpdatePanel}>
                    ✨ Sí, actualizar
                  </button>
                  <button type="button" className="link-button" onClick={() => setChangesBannerDismissed(true)}>
                    Ahora no
                  </button>
                </div>
              </div>
            )}

            {/* El lienzo domina la pantalla: ocupa todo el espacio disponible entre la fila de arriba y
                la barra contextual de abajo, en vez de ser una tarjeta más entre paneles y botones. */}
            <div className="invitation-canvas-wrap">
              <div
                ref={canvasRef}
                onPointerDown={() => selectLayer(null)}
                // 2E — en iPhone, trabajar repetidamente (long-press, doble toque) sobre una capa dentro
                // del lienzo editable podía abrir el menú contextual nativo de iOS (Compartir/Guardar en
                // Fotos/Copiar/Copiar sujeto...) por encima de nuestros propios controles. Localizado SOLO
                // al lienzo (no a toda la app): onContextMenu bloquea el menú nativo, WebkitTouchCallout
                // desactiva el callout de long-press de Safari, WebkitUserSelect/userSelect evitan la
                // selección nativa de texto/imagen que dispara "Copiar"/"Copiar sujeto". La selección de
                // capas, el arrastre, el resize y la edición de texto (que ocurre en un campo aparte, no
                // aquí dentro) siguen funcionando exactamente igual — nada de esto los toca.
                onContextMenu={(e) => e.preventDefault()}
                style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: canvasAspectRatio,
                  maxHeight: '100%',
                  borderRadius: 16,
                  overflow: 'hidden',
                  background: backgroundGradient,
                  touchAction: 'none',
                  WebkitTouchCallout: 'none',
                  WebkitUserSelect: 'none',
                  userSelect: 'none',
                } as CSSProperties}
              >
                {backgroundImageUrl ? (
                  <img
                    src={backgroundImageUrl}
                    alt=""
                    draggable={false}
                    onPointerDown={handleBackgroundPointerDown}
                    onPointerMove={handleBackgroundPointerMove}
                    onPointerUp={handleBackgroundPointerUp}
                    onPointerCancel={handleBackgroundPointerUp}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      transform: `translate(${backgroundOffsetX * 100}%, ${backgroundOffsetY * 100}%) scale(${backgroundScale})`,
                      touchAction: adjustingBackground ? 'none' : undefined,
                      cursor: adjustingBackground ? 'grab' : undefined,
                    }}
                  />
                ) : (
                  <InvitationBackground templateKey={templateKey} />
                )}
                {layers
                  .slice()
                  .sort((a, b) => a.zIndex - b.zIndex)
                  .map((layer) => {
                    const isWrappingText = (layer.type === 'text' || layer.type === 'event_data') && !layer.curve
                    return (
                    <div
                      key={layer.id}
                      ref={(el) => {
                        if (el) layerElsRef.current.set(layer.id, el)
                        else layerElsRef.current.delete(layer.id)
                      }}
                      onPointerDown={(e) => handleLayerPointerDown(e, layer)}
                      onPointerMove={handleDragPointerMove}
                      onPointerUp={handleDragPointerUp}
                      onPointerCancel={handleDragPointerUp}
                      style={{
                        position: 'absolute',
                        left: `${layer.x * 100}%`,
                        top: `${layer.y * 100}%`,
                        width: isWrappingText ? `${zoneWidthFrac * 100}%` : undefined,
                        transform: `translate(-50%, -50%) rotate(${layer.rotation}deg) scale(${layer.scale})`,
                        opacity: layer.opacity ?? 1,
                        cursor: 'grab',
                        touchAction: 'none',
                        outline: layer.id === selectedId ? '2px dashed #ffffff' : 'none',
                        outlineOffset: 4,
                      }}
                    >
                      <InvitationLayerVisual layer={layer} photoUrls={photoUrls} />
                      {layer.id === selectedId && (
                        <div
                          onPointerDown={(e) => handleHandlePointerDown(e, layer)}
                          onPointerMove={handleDragPointerMove}
                          onPointerUp={handleDragPointerUp}
                          onPointerCancel={handleDragPointerUp}
                          style={{
                            position: 'absolute',
                            right: -14,
                            bottom: -14,
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            background: '#4C6EF5',
                            border: '2px solid white',
                            cursor: 'grab',
                            touchAction: 'none',
                          }}
                        />
                      )}
                    </div>
                  )})}
                {/* Fase 3 Bloque 5B (secciones 10-16) — rectángulo de "zona de escritura" para un fondo
                    propio: arrastrar desde el centro mueve, el tirador de la esquina redimensiona — mismo
                    patrón de puntero que el resto de capas (setPointerCapture + fracción del rect real). */}
                {definingTextArea && (
                  <div
                    onPointerDown={(e) => handleTextAreaRectPointerDown(e, 'move')}
                    onPointerMove={handleTextAreaRectPointerMove}
                    onPointerUp={handleTextAreaRectPointerUp}
                    onPointerCancel={handleTextAreaRectPointerUp}
                    style={{
                      position: 'absolute',
                      left: `${draftTextArea.x * 100}%`,
                      top: `${draftTextArea.y * 100}%`,
                      width: `${draftTextArea.width * 100}%`,
                      height: `${draftTextArea.height * 100}%`,
                      border: '2px dashed #4C6EF5',
                      background: 'rgba(76, 110, 245, 0.15)',
                      borderRadius: 8,
                      cursor: 'grab',
                      touchAction: 'none',
                      zIndex: 50,
                    }}
                  >
                    <div
                      onPointerDown={(e) => handleTextAreaRectPointerDown(e, 'resize')}
                      onPointerMove={handleTextAreaRectPointerMove}
                      onPointerUp={handleTextAreaRectPointerUp}
                      onPointerCancel={handleTextAreaRectPointerUp}
                      style={{
                        position: 'absolute',
                        right: -14,
                        bottom: -14,
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: '#4C6EF5',
                        border: '2px solid white',
                        cursor: 'nwse-resize',
                        touchAction: 'none',
                      }}
                    />
                  </div>
                )}
                {/* Barra de confirmación DENTRO del mismo <div ref={canvasRef}> (misma referencia de
                    posicionamiento que el rectángulo de arriba — position:'relative' ya lo trae ese <div>,
                    ver su style más arriba, sin tocar el <div className="invitation-canvas-wrap"> exterior). */}
                {definingTextArea && (
                  <div
                    className="filter-row"
                    style={{ position: 'absolute', top: 8, left: 8, right: 8, justifyContent: 'center', background: 'rgba(255,255,255,0.92)', borderRadius: 10, padding: 8, zIndex: 51 }}
                  >
                    <span className="muted" style={{ fontSize: 12 }}>Ahí es donde PEPA escribirá</span>
                    <button type="button" className="link-button" onClick={() => setDraftTextArea(DEFAULT_TEXT_AREA)}>
                      ↺ Restablecer
                    </button>
                    <button type="button" className="chip chip-active" onClick={confirmTextArea} style={{ fontWeight: 600 }}>
                      ✓ Confirmar zona
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Corrección UX (2026-09-27) — modo de edición de texto: barra compacta propia, pegada al
                teclado, en vez de la barra de herramientas + panel genéricos de abajo. Reutiliza EXACTAMENTE
                las mismas funciones/estado que el resto del editor (updateSelectedDiscrete/Continuous,
                resolveLayerFontWeight, ALIGN_OPTIONS, LAYER_FONT_OPTIONS, LAYER_COLOR_PRESETS) — nada de
                lógica nueva, solo una disposición distinta para móvil. */}
            {textEditMode && selected && (
              <div className="invitation-text-edit-bar" style={{ paddingBottom: `max(8px, env(safe-area-inset-bottom, 0px))` }}>
                {textEditTool === 'font' && (
                  <div className="invitation-font-preview-row">
                    {LAYER_FONT_OPTIONS.map((f) => (
                      <button
                        key={f.value}
                        type="button"
                        className={'invitation-font-preview-btn' + ((selected.fontFamily || 'inherit') === f.value ? ' invitation-font-preview-btn-active' : '')}
                        onClick={() => updateSelectedDiscrete({ fontFamily: f.value })}
                        style={{ fontFamily: f.value === 'inherit' ? BASE_FONT_STACK : f.value }}
                        aria-label={f.label}
                      >
                        Aa
                      </button>
                    ))}
                  </div>
                )}
                {textEditTool === 'color' && (
                  <div className="filter-row" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                    {LAYER_COLOR_PRESETS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => updateSelectedDiscrete({ color: c })}
                        style={{ width: 30, height: 30, borderRadius: '50%', background: c, border: selected.color === c ? '2px solid #4C6EF5' : '1px solid #d8dae8' }}
                        aria-label={`Color ${c}`}
                      />
                    ))}
                    <input
                      type="color"
                      className="color-wheel-input"
                      value={selected.color && /^#[0-9a-fA-F]{6}$/.test(selected.color) ? selected.color : '#ffffff'}
                      onChange={(e) => updateSelectedContinuous({ color: e.target.value }, 'color')}
                      onBlur={commitContinuousEdit}
                      aria-label="Elegir cualquier color"
                    />
                  </div>
                )}
                <div className="invitation-text-edit-toolbar">
                  <button type="button" className="invitation-text-edit-done" onClick={() => setPanel(null)} aria-label="Terminar edición">
                    ✓
                  </button>
                  {ALIGN_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={'invitation-text-edit-btn' + ((selected.textAlign ?? 'center') === opt.value ? ' invitation-text-edit-btn-active' : '')}
                      onClick={() => updateSelectedDiscrete({ textAlign: opt.value })}
                      aria-label={opt.label}
                    >
                      {opt.icon}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={'invitation-text-edit-btn' + (resolveLayerFontWeight(selected) === 700 ? ' invitation-text-edit-btn-active' : '')}
                    onClick={() => updateSelectedDiscrete({ bold: resolveLayerFontWeight(selected) !== 700 })}
                    aria-label="Negrita"
                    style={{ fontWeight: 700 }}
                  >
                    B
                  </button>
                  <button
                    type="button"
                    className={'invitation-text-edit-btn' + (selected.italic ? ' invitation-text-edit-btn-active' : '')}
                    onClick={() => updateSelectedDiscrete({ italic: !selected.italic })}
                    aria-label="Cursiva"
                    style={{ fontStyle: 'italic' }}
                  >
                    I
                  </button>
                  <button
                    type="button"
                    className={'invitation-text-edit-btn' + (textEditTool === 'font' ? ' invitation-text-edit-btn-active' : '')}
                    onClick={() => setTextEditTool((t) => (t === 'font' ? null : 'font'))}
                    aria-label="Fuente"
                  >
                    Aa
                  </button>
                  <button
                    type="button"
                    className={'invitation-text-edit-btn' + (textEditTool === 'color' ? ' invitation-text-edit-btn-active' : '')}
                    onClick={() => setTextEditTool((t) => (t === 'color' ? null : 'color'))}
                    aria-label="Color"
                  >
                    <span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: '50%', background: selected.color || '#ffffff', border: '1px solid #d8dae8' }} />
                  </button>
                  <button
                    type="button"
                    className="invitation-text-edit-btn"
                    onClick={() => updateSelectedDiscrete({ fontSize: Math.max(10, (selected.fontSize ?? 16) - 2) })}
                    aria-label="Letra más pequeña"
                  >
                    A−
                  </button>
                  <span className="muted" style={{ fontSize: 12, flexShrink: 0 }}>
                    {Math.round(selected.fontSize ?? 16)}
                  </span>
                  <button
                    type="button"
                    className="invitation-text-edit-btn"
                    onClick={() => updateSelectedDiscrete({ fontSize: (selected.fontSize ?? 16) + 2 })}
                    aria-label="Letra más grande"
                  >
                    A+
                  </button>
                </div>
                <textarea
                  className="invitation-text-edit-textarea"
                  autoFocus
                  value={selected.text ?? ''}
                  onChange={(e) => updateSelectedContinuous({ text: e.target.value }, 'text')}
                  onBlur={commitContinuousEdit}
                  rows={3}
                />
              </div>
            )}

            {/* Barra contextual + su panel (como mucho uno abierto a la vez), fija abajo, respetando el
                Home Indicator del iPhone (env(safe-area-inset-bottom)). */}
            {!textEditMode && (
            <div className="invitation-toolbar-wrap">
              {panel && <div className="invitation-panel-overlay" onClick={() => setPanel(null)} />}
              {panel && (
                <div className="invitation-panel" onClick={(e) => e.stopPropagation()}>
                  {panel === 'plantilla' && (
                    <>
                      <InvitationTemplatePicker
                        templates={sortedTemplates}
                        selectedKey={templateKey}
                        onSelect={(t) => {
                          // INV-EDITOR-3 — deshacible siempre, cambien o no las capas (antes solo se
                          // guardaba historial cuando además tocaba recolocar las 3 capas por defecto).
                          pushHistory()
                          setTemplateKey(t.key)
                          setBackgroundGradient(t.gradient)
                          // Petición real: "no quiero que el texto se salga de ese área, habrá que
                          // ajustarlo tarjeta por tarjeta" — si todavía son las 3 capas por defecto sin
                          // tocar, recolocarlas en el hueco de la plantilla nueva; si ya hay capas
                          // propias (añadidas, movidas, borradas... el recuento ya no cuadra), se
                          // respetan tal cual.
                          if (layers.length === 3) {
                            setLayers(buildInvitationTemplateLayers(event, t))
                          }
                        }}
                      />
                      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                        O usa tu propia foto como fondo entero, en vez de un tema:
                      </p>
                      <div className="filter-row" style={{ marginTop: 2 }}>
                        <label className="chip" style={{ cursor: 'pointer' }}>
                          {uploadingBackground ? 'Subiendo…' : backgroundImageUrl ? '🖼️ Cambiar foto de fondo' : '🖼️ Usar mi foto de fondo'}
                          <input type="file" accept="image/*" onChange={handleBackgroundPhotoChange} style={{ display: 'none' }} disabled={uploadingBackground} />
                        </label>
                        {backgroundImageUrl && (
                          <ConfirmButton label="Quitar foto de fondo" confirmLabel="Quitar" className="link-button" onConfirm={handleRemoveBackgroundPhoto} />
                        )}
                        {backgroundImageUrl && (
                          <button
                            type="button"
                            className={'chip' + (adjustingBackground ? ' chip-active' : '')}
                            onClick={() => setAdjustingBackground((v) => !v)}
                          >
                            🔧 Ajustar fondo
                          </button>
                        )}
                        {/* Fase 3 Bloque 5B (secciones 10-16) — solo tiene sentido con un fondo propio: las
                            100 plantillas PEPA ya traen su textArea calibrado. */}
                        {backgroundImageUrl && (
                          <button
                            type="button"
                            className="chip"
                            onClick={() => {
                              setDraftTextArea(customTextArea ?? DEFAULT_TEXT_AREA)
                              setDefiningTextArea(true)
                            }}
                          >
                            📐 {customTextArea ? 'Editar zona de escritura' : 'Definir zona de escritura'}
                          </button>
                        )}
                      </div>
                      {adjustingBackground && (
                        <p className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                          Arrastra la foto para moverla y pellizca con dos dedos para hacer zoom.
                        </p>
                      )}
                      {/* INV-EDITOR-6 — "Restaurar plantilla" nunca toca la foto de fondo propia (si
                          hay una): solo vuelve a colocar icono/título/mensaje. Quitar la foto es la
                          acción de arriba, aparte y explícita. */}
                      <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>
                        Vuelve a colocar el icono, el título y el mensaje en su sitio de la plantilla — tu foto de fondo (si tienes una) no se toca.
                      </p>
                      <div className="filter-row" style={{ marginTop: 2 }}>
                        <ConfirmButton label="↺ Restaurar plantilla" confirmLabel="Restaurar" className="link-button" onConfirm={handleRestoreTemplate} />
                      </div>
                    </>
                  )}

                  {/* Fase 3 Bloque 5B — "✨ Pepa, hazla por mí": la plantilla es la que YA está activa (se
                      elige ANTES, con el selector de arriba — "Cambiar plantilla" solo reabre ese mismo
                      panel); aquí solo se elige el estilo y, si hace falta, la foto. */}
                  {panel === 'pepa' && (
                    <>
                      <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
                        Plantilla: <strong>{backgroundImageUrl ? 'tu foto de fondo' : (currentTemplateForPepa?.label ?? templateKey)}</strong>{' '}
                        <button type="button" className="link-button" style={{ fontSize: 12 }} onClick={() => togglePanel('plantilla')}>
                          Cambiar
                        </button>
                      </p>

                      {backgroundImageUrl && !customTextArea ? (
                        <div>
                          <p className="muted" style={{ fontSize: 13 }}>
                            Antes de elegir un estilo, dile a PEPA dónde debe escribir sobre tu foto.
                          </p>
                          <button
                            type="button"
                            className="chip chip-active"
                            onClick={() => {
                              setDraftTextArea(DEFAULT_TEXT_AREA)
                              setDefiningTextArea(true)
                            }}
                          >
                            📐 Definir zona de escritura
                          </button>
                        </div>
                      ) : (
                        <>
                          <p className="muted" style={{ fontSize: 13, margin: '0 0 6px' }}>¿Cómo quieres que PEPA prepare tu invitación?</p>
                          {pepaError && (
                            <p className="error" style={{ fontSize: 13, margin: '0 0 6px' }}>
                              {pepaError}
                            </p>
                          )}
                          <div className="filter-row" style={{ flexWrap: 'wrap' }}>
                            {(
                              [
                                { style: 'clasica' as const, label: '📝 Clásica' },
                                { style: 'con_foto' as const, label: '📷 Con foto' },
                                { style: 'divertida' as const, label: '🎉 Divertida' },
                              ]
                            ).map(({ style, label }) => {
                              const compat = pepaCompatibility.find((c) => c.style === style)
                              const disabled = !compat?.compatible
                              return (
                                <div key={style} style={{ minWidth: 120 }}>
                                  <button
                                    type="button"
                                    className={'chip' + (pepaStyle === style ? ' chip-active' : '')}
                                    disabled={disabled}
                                    aria-disabled={disabled}
                                    onClick={() => handlePepaSelectStyle(style)}
                                    style={disabled ? { opacity: 0.5 } : undefined}
                                  >
                                    {label}
                                  </button>
                                  {disabled && compat?.reason && (
                                    <p className="muted" style={{ fontSize: 11, margin: '2px 0 0' }}>
                                      {compat.reason}
                                    </p>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                          {pepaStyle === 'con_foto' && (
                            <div style={{ marginTop: 10 }}>
                              <label className="chip" style={{ cursor: 'pointer' }}>
                                {pepaUploadingPhoto ? 'Subiendo…' : '➕ Elegir foto'}
                                <input type="file" accept="image/*" onChange={handlePepaPhotoChange} style={{ display: 'none' }} disabled={pepaUploadingPhoto} />
                              </label>
                              <p className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                                Si esta plantilla no admite foto, elige otra plantilla o vuelve a "Elegir estilo".
                              </p>
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}

                  {panel === 'emoji' && (
                    <>
                      {/* Petición real: "los emojis salen muy pocos, lo suyo sería poder usar cualquier
                          emoji del teclado" — el teclado emoji nativo del móvil ya funciona en cualquier
                          campo de texto, así que el mismo campo sirve para dos cosas: buscar un concepto en
                          español (biblioteca local, sin API) O pegar/escribir directamente cualquier emoji
                          del teclado y añadirlo tal cual con "+ Añadir". */}
                      <form
                        style={{ display: 'flex', gap: 6 }}
                        onSubmit={(e) => {
                          e.preventDefault()
                          const em = customEmoji.trim()
                          if (!em) return
                          handleInsertEmoji(em)
                          setCustomEmoji('')
                        }}
                      >
                        <input
                          type="text"
                          value={customEmoji}
                          onChange={(e) => setCustomEmoji(e.target.value)}
                          placeholder="Buscar (tarta, corazón...) o pegar un emoji"
                          style={{ flex: 1 }}
                        />
                        <button type="submit" className="chip" disabled={!customEmoji.trim()}>
                          + Añadir
                        </button>
                      </form>
                      {customEmoji.trim() ? (
                        (() => {
                          const results = searchInvitationEmoji(customEmoji)
                          return (
                            <div className="filter-row" style={{ flexWrap: 'wrap', marginTop: 8 }}>
                              {results.length === 0 && (
                                <p className="muted" style={{ fontSize: 12 }}>
                                  Sin resultados para "{customEmoji}" — si es un emoji, tócalo en tu teclado y pulsa "+ Añadir" para usarlo tal cual.
                                </p>
                              )}
                              {results.map((e) => (
                                <button key={e.char} type="button" className="chip" onClick={() => handleInsertEmoji(e.char)}>
                                  {e.char}
                                </button>
                              ))}
                            </div>
                          )
                        })()
                      ) : (
                        <>
                          {recentEmoji.length > 0 && (
                            <>
                              <p className="muted" style={{ fontSize: 11, margin: '8px 0 2px' }}>
                                🕘 Recientes
                              </p>
                              <div className="filter-row" style={{ flexWrap: 'wrap' }}>
                                {recentEmoji.map((em) => (
                                  <button key={em} type="button" className="chip" onClick={() => handleInsertEmoji(em)}>
                                    {em}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                          {INVITATION_EMOJI_CATEGORIES.map((cat) => (
                            <div key={cat.key}>
                              <p className="muted" style={{ fontSize: 11, margin: '8px 0 2px' }}>
                                {cat.label}
                              </p>
                              <div className="filter-row" style={{ flexWrap: 'wrap' }}>
                                {cat.emojis.map((e) => (
                                  <button key={e.char} type="button" className="chip" onClick={() => handleInsertEmoji(e.char)}>
                                    {e.char}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </>
                  )}

                  {panel === 'forma' && (
                    <div className="filter-row" style={{ flexWrap: 'wrap' }}>
                      {INVITATION_SHAPES.map((s) => (
                        <button key={s.key} type="button" className="chip" onClick={() => handleAddLayer(makeInvitationLayer('shape', { shapeKey: s.key, color: '#ffffff', fontSize: 60 }))}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {panel === 'datos' && (
                    <div className="filter-row" style={{ flexWrap: 'wrap' }}>
                      {invitationDataFields.length === 0 && (
                        <p className="muted" style={{ fontSize: 12 }}>
                          Este evento todavía no tiene fecha, hora o lugar puestos — en cuanto los rellenes en "⚙️ Gestionar evento", aparecerán aquí.
                        </p>
                      )}
                      {invitationDataFields.map((f) => {
                        const alreadyInserted = layers.some((l) => l.text === f.value)
                        return (
                          <button
                            key={f.key}
                            type="button"
                            className={'chip' + (alreadyInserted ? ' chip-active' : '')}
                            onClick={() =>
                              // Fase 3 Bloque 5B (sección 23-24) — igual que las capas de "Pepa, hazla por mí",
                              // esta capa insertada a mano queda marcada con su procedencia, para poder detectar
                              // más tarde si el evento cambió.
                              handleAddLayer(
                                makeInvitationLayer('event_data', {
                                  text: f.value,
                                  color: '#ffffff',
                                  fontSize: 14,
                                  source: { kind: 'event_field', field: toEventFieldKey(f.key), valueAtInsertion: f.value },
                                }),
                              )
                            }
                          >
                            {alreadyInserted ? '✓ ' : ''}
                            {f.value}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {panel === 'color' && selected && (selected.type === 'text' || selected.type === 'event_data' || selected.type === 'shape') && (
                    <div className="filter-row" style={{ alignItems: 'center' }}>
                      {LAYER_COLOR_PRESETS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => updateSelectedDiscrete({ color: c })}
                          style={{ width: 30, height: 30, borderRadius: '50%', background: c, border: selected.color === c ? '2px solid #4C6EF5' : '1px solid #d8dae8' }}
                          aria-label={`Color ${c}`}
                        />
                      ))}
                      {/* Petición real: "mejor pon un botón que puedas elegir el color de la letra de
                          una paleta más amplia" — input[type=color] nativo abre la rueda de color
                          completa del móvil, sin límite a los 6 rápidos de arriba. */}
                      <input
                        type="color"
                        className="color-wheel-input"
                        value={selected.color && /^#[0-9a-fA-F]{6}$/.test(selected.color) ? selected.color : '#ffffff'}
                        onChange={(e) => updateSelectedContinuous({ color: e.target.value }, 'color')}
                        onBlur={commitContinuousEdit}
                        aria-label="Elegir cualquier color"
                      />
                    </div>
                  )}

                  {panel === 'fuente' && selected && isTextLike && (
                    <label style={{ display: 'block' }}>
                      Fuente
                      <select value={selected.fontFamily || 'inherit'} onChange={(e) => updateSelectedDiscrete({ fontFamily: e.target.value })}>
                        {LAYER_FONT_OPTIONS.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {/* Petición real: "formato 3D", "letras de brillos... purpurina", "un color arcoíris...
                      uno fijo [que cambia a lo largo de lo escrito, no con el tiempo] y otro que vaya
                      cambiando conforme lo mires", "otro estilo iridiscente" — todos rellenos
                      alternativos del texto; tocar el que ya está activo lo quita (vuelve a "normal"). */}
                  {panel === 'efecto' && selected && isTextLike && (
                    <div className="filter-row" style={{ flexWrap: 'wrap' }}>
                      {TEXT_STYLE_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          className={'chip' + ((selected.textStyle ?? 'normal') === opt.value ? ' chip-active' : '')}
                          onClick={() => updateSelectedDiscrete({ textStyle: (selected.textStyle ?? 'normal') === opt.value ? 'normal' : opt.value })}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {panel === 'tamano' && selected && (
                    <div className="filter-row" style={{ alignItems: 'center', justifyContent: 'center' }}>
                      {/* Petición real: "he insertado una foto y no consigo editar su tamaño" — con ±2
                          el cambio era imperceptible en una foto/forma de 60-300px (sí se notaba en
                          texto, de 10-40px); foto/forma usan un paso mayor. El punto azul de la esquina
                          (pellizcar/arrastrar) sigue siendo el gesto principal. */}
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => updateSelectedDiscrete({ fontSize: Math.max(10, (selected.fontSize ?? 16) - (isTextLike ? 2 : 15)) })}
                      >
                        A-
                      </button>
                      <span className="muted" style={{ fontSize: 12 }}>
                        {Math.round(selected.fontSize ?? 16)}
                      </span>
                      <button type="button" className="link-button" onClick={() => updateSelectedDiscrete({ fontSize: (selected.fontSize ?? 16) + (isTextLike ? 2 : 15) })}>
                        A+
                      </button>
                    </div>
                  )}

                  {panel === 'mas' && selected && (
                    <>
                      {selected.type === 'text' && (
                        <label style={{ display: 'block' }}>
                          Curvar texto {selected.curve ? `(${selected.curve > 0 ? '⌣ arriba' : '⌢ abajo'})` : '(recto)'}
                          <input
                            type="range"
                            min={-100}
                            max={100}
                            value={selected.curve ?? 0}
                            onChange={(e) => updateSelectedContinuous({ curve: Number(e.target.value) }, 'curve')}
                            onPointerUp={commitContinuousEdit}
                            onBlur={commitContinuousEdit}
                            style={{ width: '100%' }}
                          />
                        </label>
                      )}
                      {selected.type === 'shape' && (
                        <label style={{ display: 'block' }}>
                          Opacidad ({Math.round((selected.opacity ?? 1) * 100)}%)
                          <input
                            type="range"
                            min={20}
                            max={100}
                            value={Math.round((selected.opacity ?? 1) * 100)}
                            onChange={(e) => updateSelectedContinuous({ opacity: Number(e.target.value) / 100 }, 'opacity')}
                            onPointerUp={commitContinuousEdit}
                            onBlur={commitContinuousEdit}
                            style={{ width: '100%' }}
                          />
                        </label>
                      )}
                      {selected.type === 'photo' && (
                        <div className="filter-row" style={{ marginBottom: 10 }}>
                          <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>
                            Recorte:
                          </span>
                          <button
                            type="button"
                            className={'chip' + ((selected.photoMask ?? 'none') === 'none' ? ' chip-active' : '')}
                            onClick={() => updateSelectedDiscrete({ photoMask: 'none' })}
                          >
                            Original
                          </button>
                          <button
                            type="button"
                            className={'chip' + (selected.photoMask === 'circle' ? ' chip-active' : '')}
                            onClick={() => updateSelectedDiscrete({ photoMask: 'circle' })}
                          >
                            ⚪ Círculo
                          </button>
                        </div>
                      )}
                      <div className="filter-row" style={{ marginTop: selected.type === 'text' ? 10 : 0 }}>
                        <button type="button" className="link-button" onClick={() => handleReorder(1)}>
                          ⬆ Adelante
                        </button>
                        <button type="button" className="link-button" onClick={() => handleReorder(-1)}>
                          ⬇ Atrás
                        </button>
                        <button type="button" className="link-button" onClick={handleDuplicate}>
                          ⧉ Duplicar
                        </button>
                        <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Borrar elemento" onConfirm={handleDeleteSelected} />
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="invitation-toolbar">
                {!selected ? (
                  <>
                    <button
                      type="button"
                      className="invitation-toolbar-btn"
                      onClick={() => handleAddLayer(makeInvitationLayer('text', { text: 'Texto', color: '#ffffff', fontSize: 18, fontFamily: 'inherit' }))}
                    >
                      <span className="invitation-toolbar-icon">🔤</span>
                      <span>Texto</span>
                    </button>
                    <button type="button" className={'invitation-toolbar-btn' + (panel === 'datos' ? ' invitation-toolbar-btn-active' : '')} onClick={() => togglePanel('datos')}>
                      <span className="invitation-toolbar-icon">📋</span>
                      <span>Datos</span>
                    </button>
                    <label className="invitation-toolbar-btn" style={{ cursor: 'pointer' }}>
                      <span className="invitation-toolbar-icon">{uploadingPhoto ? '…' : '📷'}</span>
                      <span>Foto</span>
                      <input type="file" accept="image/*" onChange={handlePhotoChange} style={{ display: 'none' }} disabled={uploadingPhoto} />
                    </label>
                    <button type="button" className={'invitation-toolbar-btn' + (panel === 'emoji' ? ' invitation-toolbar-btn-active' : '')} onClick={() => togglePanel('emoji')}>
                      <span className="invitation-toolbar-icon">😀</span>
                      <span>Emoji</span>
                    </button>
                    <button type="button" className={'invitation-toolbar-btn' + (panel === 'forma' ? ' invitation-toolbar-btn-active' : '')} onClick={() => togglePanel('forma')}>
                      <span className="invitation-toolbar-icon">◆</span>
                      <span>Forma</span>
                    </button>
                    <button type="button" className={'invitation-toolbar-btn' + (panel === 'plantilla' ? ' invitation-toolbar-btn-active' : '')} onClick={() => togglePanel('plantilla')}>
                      <span className="invitation-toolbar-icon">🎨</span>
                      <span>Plantilla</span>
                    </button>
                  </>
                ) : isTextLike ? (
                  <>
                    <button type="button" className={'invitation-toolbar-btn' + (panel === 'texto' ? ' invitation-toolbar-btn-active' : '')} onClick={() => togglePanel('texto')}>
                      <span className="invitation-toolbar-icon">✏️</span>
                      <span>Editar</span>
                    </button>
                    <button type="button" className={'invitation-toolbar-btn' + (panel === 'color' ? ' invitation-toolbar-btn-active' : '')} onClick={() => togglePanel('color')}>
                      <span className="invitation-toolbar-icon">🎨</span>
                      <span>Color</span>
                    </button>
                    <button type="button" className={'invitation-toolbar-btn' + (panel === 'fuente' ? ' invitation-toolbar-btn-active' : '')} onClick={() => togglePanel('fuente')}>
                      <span className="invitation-toolbar-icon">Aa</span>
                      <span>Fuente</span>
                    </button>
                    <button type="button" className={'invitation-toolbar-btn' + (panel === 'efecto' ? ' invitation-toolbar-btn-active' : '')} onClick={() => togglePanel('efecto')}>
                      <span className="invitation-toolbar-icon">✨</span>
                      <span>Efecto</span>
                    </button>
                    <button type="button" className={'invitation-toolbar-btn' + (panel === 'tamano' ? ' invitation-toolbar-btn-active' : '')} onClick={() => togglePanel('tamano')}>
                      <span className="invitation-toolbar-icon">🔠</span>
                      <span>Tamaño</span>
                    </button>
                    <button type="button" className={'invitation-toolbar-btn' + (panel === 'mas' ? ' invitation-toolbar-btn-active' : '')} onClick={() => togglePanel('mas')}>
                      <span className="invitation-toolbar-icon">⋯</span>
                      <span>Más</span>
                    </button>
                  </>
                ) : selected.type === 'shape' ? (
                  <>
                    <button type="button" className={'invitation-toolbar-btn' + (panel === 'color' ? ' invitation-toolbar-btn-active' : '')} onClick={() => togglePanel('color')}>
                      <span className="invitation-toolbar-icon">🎨</span>
                      <span>Color</span>
                    </button>
                    <button type="button" className={'invitation-toolbar-btn' + (panel === 'tamano' ? ' invitation-toolbar-btn-active' : '')} onClick={() => togglePanel('tamano')}>
                      <span className="invitation-toolbar-icon">🔠</span>
                      <span>Tamaño</span>
                    </button>
                    <button type="button" className={'invitation-toolbar-btn' + (panel === 'mas' ? ' invitation-toolbar-btn-active' : '')} onClick={() => togglePanel('mas')}>
                      <span className="invitation-toolbar-icon">⋯</span>
                      <span>Más</span>
                    </button>
                  </>
                ) : (
                  // foto | emoji — sin controles de texto/color.
                  <>
                    <button type="button" className={'invitation-toolbar-btn' + (panel === 'tamano' ? ' invitation-toolbar-btn-active' : '')} onClick={() => togglePanel('tamano')}>
                      <span className="invitation-toolbar-icon">🔠</span>
                      <span>Tamaño</span>
                    </button>
                    <button type="button" className={'invitation-toolbar-btn' + (panel === 'mas' ? ' invitation-toolbar-btn-active' : '')} onClick={() => togglePanel('mas')}>
                      <span className="invitation-toolbar-icon">⋯</span>
                      <span>Más</span>
                    </button>
                  </>
                )}
              </div>
            </div>
            )}
          </>
        )}
      </div>
    </div>
    {/* INV-EDITOR-5 — cambios sin guardar: overlay propio, HERMANO del principal (nunca anidado dentro),
        para que tocar su fondo no burbujee y dispare también el requestClose del editor. */}
    {confirmingExit && (
      <div className="modal-overlay" style={{ zIndex: 60 }} onClick={() => setConfirmingExit(false)}>
        <div className="modal-sheet" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
          <h2 className="section-title" style={{ margin: 0 }}>
            Tienes cambios sin guardar
          </h2>
          <p className="muted" style={{ marginTop: 6 }}>
            Si sales ahora, se pierde lo que has cambiado en el diseño desde la última vez que lo guardaste.
          </p>
          <div className="filter-row" style={{ marginTop: 14, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setConfirmingExit(false)}>
              Seguir editando
            </button>
            <button type="button" className="link-button" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando…' : '💾 Guardar y salir'}
            </button>
            <button type="button" className="link-button" onClick={onClose}>
              Salir sin guardar
            </button>
          </div>
        </div>
      </div>
    )}
    {/* Fase 3 Bloque 5B (sección 20) — regenerar con "Pepa, hazla por mí" sobre contenido ya existente pide
        confirmación explícita antes de sustituirlo; la composición anterior no se toca hasta confirmar. */}
    {pendingPepaGeneration && (
      <div className="modal-overlay" style={{ zIndex: 60 }} onClick={() => setPendingPepaGeneration(null)}>
        <div className="modal-sheet" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
          <h2 className="section-title" style={{ margin: 0 }}>
            PEPA va a crear una nueva composición
          </h2>
          <p className="muted" style={{ marginTop: 6 }}>Tus cambios actuales se sustituirán.</p>
          <div className="filter-row" style={{ marginTop: 14, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setPendingPepaGeneration(null)}>
              Cancelar
            </button>
            <button type="button" className="link-button" style={{ fontWeight: 600 }} onClick={confirmPepaRegeneration}>
              Crear nueva
            </button>
          </div>
        </div>
      </div>
    )}
    {/* Fase 3 Bloque 5B (secciones 28-33) — actualización selectiva de los datos del evento: campos no
        personalizados se actualizan directamente, campos personalizados a mano piden decisión, campos
        eliminados del evento piden confirmación aparte para quitar su capa. Todo se aplica como UNA sola
        operación de historial (ver applyEventDataUpdate). */}
    {showUpdatePanel && (
      <div className="modal-overlay" style={{ zIndex: 60 }} onClick={() => setShowUpdatePanel(false)}>
        <div className="modal-sheet" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
          <h2 className="section-title" style={{ margin: 0 }}>
            Actualizar datos de la invitación
          </h2>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {eventDataChanges.map((change) => {
              const layer = layers.find((l) => l.source?.field === change.field)
              const manuallyEdited = layer ? isInvitationLayerManuallyEdited(layer) : false
              if (change.current === null) {
                return (
                  <div key={change.field} style={{ fontSize: 13 }}>
                    <p style={{ margin: 0 }}>
                      {EVENT_FIELD_LABELS[change.field]}: el dato ya no existe en el evento («{change.previous}»).
                    </p>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <input
                        type="checkbox"
                        checked={!!removedFieldDecisions[change.field]}
                        onChange={(e) => setRemovedFieldDecisions((m) => ({ ...m, [change.field]: e.target.checked }))}
                      />
                      Quitar esta capa
                    </label>
                  </div>
                )
              }
              if (manuallyEdited) {
                const decision = manualFieldDecisions[change.field] ?? 'keep'
                return (
                  <div key={change.field} style={{ fontSize: 13 }}>
                    <p style={{ margin: 0 }}>
                      Modificaste manualmente el texto de {EVENT_FIELD_LABELS[change.field]}. Actualizarlo lo sustituirá por «{change.current}».
                    </p>
                    <div className="filter-row" style={{ marginTop: 4 }}>
                      <button
                        type="button"
                        className={'chip' + (decision === 'update' ? ' chip-active' : '')}
                        onClick={() => setManualFieldDecisions((m) => ({ ...m, [change.field]: 'update' }))}
                      >
                        Actualizar
                      </button>
                      <button
                        type="button"
                        className={'chip' + (decision === 'keep' ? ' chip-active' : '')}
                        onClick={() => setManualFieldDecisions((m) => ({ ...m, [change.field]: 'keep' }))}
                      >
                        Mantener mi texto
                      </button>
                    </div>
                  </div>
                )
              }
              return (
                <p key={change.field} style={{ margin: 0, fontSize: 13 }}>
                  {EVENT_FIELD_LABELS[change.field]}: «{change.previous}» → «{change.current}» (se actualizará)
                </p>
              )
            })}
          </div>
          <div className="filter-row" style={{ marginTop: 14, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setShowUpdatePanel(false)}>
              Cancelar
            </button>
            <button type="button" className="link-button" style={{ fontWeight: 600 }} onClick={applyEventDataUpdate}>
              Aplicar
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
