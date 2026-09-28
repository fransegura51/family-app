import { ChangeEvent, type CSSProperties, PointerEvent as ReactPointerEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ASSUMED_CANVAS_SIZE_PX,
  autoArrangeLayers,
  buildInvitationDataFields,
  buildInvitationTemplateLayers,
  clampLayerCenterAccessible,
  DEFAULT_TEXT_AREA,
  estimateLayerBoxFraction,
  findFreeDataLayerPosition,
  findFreeDecorationLayerPosition,
  INVITATION_EMOJI_CATEGORIES,
  INVITATION_SHAPES,
  INVITATION_TEMPLATES,
  invitationEmojiSkinToneVariants,
  LINE_HEIGHT_RATIO,
  recoverInaccessibleLayerPositions,
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

// Corrección WYSIWYG (2026-09-28) — CAUSA REAL del bug "lo que veo en el editor no es lo que se guarda":
// el editor (InvitationCanvasEditor) y la vista de solo lectura (InvitationCanvasView, usada en el módulo
// Invitación y en el modal de envío) son dos contenedores con un ancho máximo en px DISTINTO (la hoja del
// editor puede llegar a 420px; la vista previa del módulo, a 320px). Las capas se posicionan en % (correcto,
// escala bien), pero `fontSize` es px absoluto — el navegador calcula los saltos de línea reales contra el
// ANCHO REAL en píxeles del contenedor en cada sitio, así que el mismo texto, con el mismo fontSize, puede
// partir línea en un punto distinto según dónde se pinte, desplazando verticalmente todo lo que viene
// detrás. No es que nada se reconstruya al guardar — los datos guardados son idénticos — es que el mismo
// dato se ve distinto según el ancho real del contenedor.
// SOLUCIÓN: renderizar el lienzo SIEMPRE a un tamaño lógico fijo en píxeles (el mismo que ya asume el
// medidor de texto de "Hazla bonita"/"Pepa, hazla por mí": ASSUMED_CANVAS_SIZE_PX) y escalar visualmente
// ese resultado con `transform: scale()` para que quepa en cada contenedor — el salto de línea se calcula
// SIEMPRE contra el mismo ancho lógico, en el editor y en cualquier vista previa, y solo cambia el zoom
// visual final (igual que Canva/Figma). El medidor de texto (domTextMeasurer) ya mide en px absolutos
// independientes de cualquier transform CSS, así que sigue siendo consistente con este ancho lógico. El
// arrastre de capas ya convierte por el rect REAL (post-transform) del contenedor, así que sigue
// funcionando sin cambios — getBoundingClientRect() de un elemento con `scale()` ya devuelve su tamaño
// visual, no el lógico.
function useCanvasScale(containerRef: { current: HTMLElement | null }, logicalWidthPx: number): number {
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const width = el.getBoundingClientRect().width
      if (width > 0) setScale(width / logicalWidthPx)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef.current, logicalWidthPx])
  return scale
}

// Corrección (2026-09-29, aprobada explícitamente — única parte del sistema WYSIWYG que se toca en esta
// fase) — bug real encontrado auditando el bug del corazón inaccesible: useCanvasScale (arriba) solo mira
// el ANCHO disponible. Eso es correcto para InvitationCanvasView (la vista de solo lectura, en una página
// normal, nunca con límite de alto) pero NO para el editor: su lienzo vive dentro de una hoja de alto FIJO
// (88vh) y, en una plantilla vertical (Globos, Monstruo, Fútbol, Unicornio...) con poco alto disponible
// (pantalla real pequeña, o poca altura libre tras cabecera+toolbar), el lienzo cabía de sobra por ancho
// pero el alto que la relación de aspecto pedía superaba el hueco real — como el <div ref={canvasRef}>
// tenía `width:100%` fijo (no derivado de la relación de aspecto) y `maxHeight:100%` + overflow:hidden,
// el navegador simplemente RECORTABA la parte de abajo del lienzo, invisible e intocable de verdad, con
// cualquier capa ahí dentro geométricamente válida pero inalcanzable — ningún clamp de arrastre podía
// arreglarlo porque el recorte pasaba ANTES, a nivel de contenedor.
//
// Esta variante calcula la escala como el MÍNIMO entre lo que permite el ancho y lo que permite el alto
// disponibles (igual que `object-fit: contain`) — el lienzo completo cabe siempre entero, nunca se
// recorta. Mide `wrapperRef` (el contenedor `.invitation-canvas-wrap`, NO el propio lienzo): su tamaño ya
// es el hueco real que flexbox le ha asignado (cabecera + barra inferior + safe-area ya restados por el
// propio motor de layout, sin sumar constantes a mano — flex:1 más min-height:0 en ese contenedor). Al ser
// el panel Color/Tamaño/Más `position:absolute` (no participa del flujo normal), abrir o cerrar un panel
// NO cambia la altura de `.invitation-canvas-wrap` — así que el lienzo no "salta" de tamaño al tocar esos
// botones. El propio lienzo lógico (ASSUMED_CANVAS_SIZE_PX, coordenadas x/y, tamaños de capa,
// autoArrangeLayers, resolveEffectiveZone, InvitationCanvasView) no cambia en absoluto: solo cambia cuánto
// se escala visualmente el editor para caber entero.
function useFitCanvasScale(wrapperRef: { current: HTMLElement | null }, logicalWidthPx: number, logicalHeightPx: number): number {
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      setScale(Math.min(rect.width / logicalWidthPx, rect.height / logicalHeightPx))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wrapperRef.current, logicalWidthPx, logicalHeightPx])
  return scale
}

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
  // Corrección WYSIWYG — ver el comentario de useCanvasScale más arriba: imageAspectNumeric/logicalWidthPx/
  // logicalHeightPx son el tamaño LÓGICO fijo del lienzo (siempre el mismo, en el editor y aquí); `scale`
  // es solo el zoom visual para que quepa en el contenedor real de cada sitio donde se use este componente.
  const imageAspectNumeric = !backgroundImageUrl && template?.imageAspect ? template.imageAspect : 3 / 4
  const logicalWidthPx = ASSUMED_CANVAS_SIZE_PX
  const logicalHeightPx = ASSUMED_CANVAS_SIZE_PX / imageAspectNumeric
  const outerRef = useRef<HTMLDivElement>(null)
  const scale = useCanvasScale(outerRef, logicalWidthPx)
  // Bug real reportado en vivo (iPhone, plantilla "boda"): el <div> de una capa de texto se posiciona con
  // `left` + `transform: translate(-50%,-50%)` pero sin `width` propio — un position:absolute sin width usa
  // "shrink-to-fit" acotado por (ancho del contenedor - left), NUNCA el ancho de la textArea de la
  // plantilla. Para una capa centrada (x=0.5, el caso normal) eso deja solo ~la mitad del ancho real que
  // estimateWrappedLineCount/autoArrangeLayers asumían (zone.width) — el texto ajustaba línea mucho antes de
  // lo estimado, así que el bloque pintado de verdad era más alto que el estimado y solapaba con la capa
  // siguiente, por mucho que se subiera AVG_CHAR_WIDTH_RATIO o se ampliara la zona. Se fija aquí el mismo
  // ancho (zoneWidthFrac) que ya usan esas funciones, igual que LINE_HEIGHT_RATIO se fija como line-height
  // real — para que el ajuste de línea real coincida con el estimado en las 100 plantillas.
  // Geometría segura (2026-09-28) — este valor es el cálculo HEREDADO, para capas SIN `zoneWidthFrac` propio
  // (toda invitación guardada antes de este cambio, y cualquier capa sin rol como foto/decoración). Una capa
  // generada por el motor DESPUÉS de este cambio lleva su propio ancho efectivo grabado
  // (`layer.zoneWidthFrac`, ver InvitationLayer en domain/types.ts) — se usa tal cual, sin recalcularlo aquí,
  // para que WYSIWYG y el motor midan literalmente el mismo número (nunca dos fórmulas que puedan divergir).
  const legacyZoneWidthFrac = backgroundImageUrl ? DEFAULT_TEXT_AREA.width : (template?.textArea ?? DEFAULT_TEXT_AREA).width
  return (
    <div
      ref={outerRef}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: `${imageAspectNumeric}`,
        borderRadius: 16,
        overflow: 'hidden',
        background: canvas.backgroundGradient || INVITATION_TEMPLATES[0].gradient,
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, width: logicalWidthPx, height: logicalHeightPx, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
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
          const zoneWidthFrac = layer.zoneWidthFrac ?? legacyZoneWidthFrac
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
    </div>
  )
}

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
  hora_ceremonia: 'la hora de la ceremonia',
  celebracion: 'la celebración',
}

// Evolución del generador narrativo (2026-09-28) — un campo real ya no vive necesariamente en su propia
// capa: puede formar parte del párrafo BODY (`source.kind:'event_narrative'`), que teje varios campos a la
// vez. Busca la capa que lleva CUALQUIERA de los dos tipos de procedencia para un campo dado, en vez de
// asumir siempre `source.field` suelto.
function findLayerForField(layers: InvitationLayer[], field: string): InvitationLayer | undefined {
  return layers.find((l) => {
    const source = l.source
    if (!source) return false
    if (source.kind === 'event_field') return source.field === field
    return source.fields.some((f) => f.field === field)
  })
}

// Agrupa los cambios detectados por la capa a la que pertenecen — varios campos de un mismo párrafo
// narrativo se muestran/deciden JUNTOS (sección 10: el párrafo se regenera entero, nunca palabra por
// palabra, así que no tiene sentido pedir una decisión distinta para cada campo que contiene).
interface InvitationChangeGroup {
  key: string
  layer: InvitationLayer | undefined
  changes: InvitationEventDataChange[]
}

function groupEventDataChanges(changes: InvitationEventDataChange[], layers: InvitationLayer[]): InvitationChangeGroup[] {
  const groups = new Map<string, InvitationChangeGroup>()
  for (const change of changes) {
    const layer = findLayerForField(layers, change.field)
    const key = layer ? layer.id : `field:${change.field}`
    let group = groups.get(key)
    if (!group) {
      group = { key, layer, changes: [] }
      groups.set(key, group)
    }
    group.changes.push(change)
  }
  return [...groups.values()]
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
// Reorganización (2026-09-28) — 'texto'/'fuente'/'efecto' ya no son estados de `panel`: el menú de texto
// (dos filas fijas) se muestra directamente en cuanto hay una capa de texto seleccionada (ver
// `textEditMode`), y Fuente/Efecto viven dentro de ese menú (`textEditTool`), no como paneles aparte.
// Unificación Emoji+Forma → Decorar (2026-09-28) — 'emoji' y 'forma' dejan de ser paneles independientes;
// ahora comparten un único panel 'decorar' con dos pestañas (ver `decorarTab`). Es solo una reorganización
// de la barra: ni el modelo de capas (InvitationLayer sigue siendo type:'emoji'|'shape' de siempre) ni el
// contenido de cada catálogo cambian.
type DesignerPanel = 'plantilla' | 'datos' | 'decorar' | 'color' | 'tamano' | 'mas' | 'pepa'
type DecorarTab = 'emoji' | 'forma'

const LONG_PRESS_MS = 450
const LONG_PRESS_MOVE_TOLERANCE_PX = 10

// Unificación Emoji+Forma → Decorar (2026-09-28) — long-press estilo WhatsApp/iOS para elegir tono de piel
// real de Unicode (ver invitationEmojiSkinToneVariants, domain/events.ts). Un emoji sin variantes se sigue
// insertando al toque, sin ningún paso de más — mismo comportamiento de siempre, código sin cambios para
// ese caso. El temporizador se cancela si el dedo se mueve más de un pequeño umbral (para no robarle el
// scroll del panel al usuario) o se suelta antes de tiempo; `firedRef` evita que el "click" sintético que
// el navegador dispara después de un long-press inserte también el emoji base antes de elegir variante.
function InvitationEmojiChip({ char, onInsert }: { char: string; onInsert: (char: string) => void }) {
  const variants = useMemo(() => invitationEmojiSkinToneVariants(char), [char])
  const [showVariants, setShowVariants] = useState(false)
  const [popoverPos, setPopoverPos] = useState<{ left: number; top: number } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firedRef = useRef(false)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement | null>(null)

  function clearTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  function openVariants() {
    const rect = btnRef.current?.getBoundingClientRect()
    const popoverWidth = variants.length * 40 + 16
    if (rect) {
      const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - 8 - popoverWidth))
      const top = Math.max(8, rect.top - 56)
      setPopoverPos({ left, top })
    }
    setShowVariants(true)
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    if (variants.length === 0) return
    startRef.current = { x: e.clientX, y: e.clientY }
    firedRef.current = false
    clearTimer()
    timerRef.current = setTimeout(() => {
      firedRef.current = true
      openVariants()
    }, LONG_PRESS_MS)
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!startRef.current) return
    const dx = e.clientX - startRef.current.x
    const dy = e.clientY - startRef.current.y
    if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_TOLERANCE_PX) clearTimer()
  }

  function handlePointerEnd() {
    clearTimer()
  }

  function handleClick() {
    if (firedRef.current) {
      firedRef.current = false
      return
    }
    onInsert(char)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="chip"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerLeave={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onClick={handleClick}
        // Igual que el lienzo (más arriba): solo en los chips que de verdad tienen variantes, para que un
        // long-press no dispare el menú contextual nativo de Safari por encima del selector de tonos.
        onContextMenu={variants.length > 0 ? (e) => e.preventDefault() : undefined}
        style={variants.length > 0 ? ({ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' } as CSSProperties) : undefined}
      >
        {char}
      </button>
      {showVariants && popoverPos && (
        <>
          <div className="invitation-emoji-variant-overlay" onPointerDown={() => setShowVariants(false)} />
          <div className="invitation-emoji-variant-popover" style={{ left: popoverPos.left, top: popoverPos.top }}>
            {variants.map((v) => (
              <button
                key={v}
                type="button"
                className="chip"
                onClick={() => {
                  setShowVariants(false)
                  onInsert(v)
                }}
              >
                {v}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}

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
  // Corrección UX (2026-09-27, reorganizada 2026-09-28) — dentro del menú de texto (dos filas fijas, ver
  // más abajo), cuál "cajón" secundario está desplegado justo encima de esas dos filas — como mucho uno a
  // la vez. Color ya no vive aquí (sección 4 del encargo): pulsarlo abre DIRECTAMENTE el selector nativo
  // completo (input[type=color]), sin cajón intermedio. Se resetea sola al cambiar de selección.
  const [textEditTool, setTextEditTool] = useState<'font' | 'size' | 'effect' | 'curve' | null>(null)
  // Corrección (2026-09-28) — edición de texto EN EL LIENZO (en el sitio real de la capa), en vez de un
  // textarea grande aparte abajo: las dos filas de herramientas están siempre visibles en cuanto hay un
  // texto seleccionado (para poder mover/formatear sin querer abrir el teclado), y este flag decide si,
  // ADEMÁS, esa capa concreta se está escribiendo ahora mismo (entonces se sustituye su render normal por
  // un <textarea> posicionado exactamente donde está la capa). Se resetea al cambiar de selección.
  const [textEditingActive, setTextEditingActive] = useState(false)
  const inPlaceTextareaRef = useRef<HTMLTextAreaElement>(null)
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
  // Unificación Emoji+Forma → Decorar (2026-09-28) — pestaña activa dentro del panel único 'decorar'.
  const [decorarTab, setDecorarTab] = useState<DecorarTab>('emoji')
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  // Corrección (2026-09-29) — ref al CONTENEDOR (.invitation-canvas-wrap), no al lienzo en sí, para medir
  // el hueco real disponible con useFitCanvasScale (ver más arriba).
  const canvasWrapRef = useRef<HTMLDivElement>(null)
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
  // Asistente "Pepa, hazla por mí" (secciones 3-9, 17-18): estilo elegido, foto y errores propios del
  // asistente — nunca reutiliza `error` (ese es el de "Hazla bonita"/guardar). Sección 18 — la foto es
  // ORTOGONAL al estilo (Clásico/Divertido con o sin foto, las 4 combinaciones son válidas): su propio
  // estado, independiente de `pepaStyle`, en vez de un tercer valor de estilo "con_foto".
  const [pepaStyle, setPepaStyle] = useState<AutoComposeStyle | null>(null)
  const [pepaPhotoPath, setPepaPhotoPath] = useState<string | null>(null)
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
          // Corrección (2026-09-28) — recuperación conservadora al abrir: una invitación guardada ANTES de
          // la corrección del arrastre (ver handleDragPointerMove) podía tener alguna capa realmente
          // inaccesible (su centro en el límite/esquina del lienzo, sin hueco táctil real). Se recoloca
          // aquí lo mínimo necesario — nunca se recentra nada, y una capa ya accesible (aunque sobresalga
          // parcialmente, eso sigue permitido) no se toca. savedSnapshotRef sigue comparando contra lo que
          // de verdad hay en la base de datos (invitation.canvas.layers, sin recuperar) — si esto recoloca
          // algo, se ve como "cambios sin guardar" hasta que la familia pulse Guardar, igual que cualquier
          // otro cambio, en vez de reescribir la base de datos en silencio.
          const loadedTemplateMeta = INVITATION_TEMPLATES.find((t) => t.key === loadedTemplateKey)
          const loadedImageAspect = !invitation.backgroundImagePath && loadedTemplateMeta?.imageAspect ? loadedTemplateMeta.imageAspect : 3 / 4
          setLayers(recoverInaccessibleLayerPositions(invitation.canvas.layers, loadedImageAspect))
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
    setTextEditTool(null)
    setTextEditingActive(false)
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
  // Unificación Emoji+Forma → Decorar (2026-09-28) — corrección: ya no se inserta siempre en (0.5, 0.5)
  // (ver makeInvitationLayer) porque varios emoji seguidos quedaban apilados exactamente encima unos de
  // otros; findFreeDecorationLayerPosition busca el primer hueco libre (domain/events.ts).
  function handleInsertEmoji(char: string) {
    const layer = makeInvitationLayer('emoji', { text: char, fontSize: 48 })
    const { x, y } = findFreeDecorationLayerPosition(layer, layers, imageAspectNumeric)
    handleAddLayer({ ...layer, x, y })
    recordRecentInvitationEmoji(char)
    setRecentEmoji(loadRecentInvitationEmoji())
  }

  // Unificación Emoji+Forma → Decorar (2026-09-28) — mismo tratamiento que handleInsertEmoji, extraído del
  // onClick en línea que tenía antes la rejilla de formas, para poder reusar el mismo cálculo de hueco libre.
  function handleInsertShape(shapeKey: string) {
    const layer = makeInvitationLayer('shape', { shapeKey, color: '#ffffff', fontSize: 60 })
    const { x, y } = findFreeDecorationLayerPosition(layer, layers, imageAspectNumeric)
    handleAddLayer({ ...layer, x, y })
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
      // Corrección (2026-09-28) — bug real (iPhone): arrastrar una capa hasta el borde/esquina la dejaba
      // con su centro exactamente en el límite (0 o 1) sin tener en cuenta su propio tamaño, así que podía
      // quedar un resto demasiado pequeño (o inexistente) para volver a tocarla — capa persistente pero
      // inaccesible. clampLayerCenterAccessible (domain/events.ts) sigue permitiendo sobresalir del lienzo
      // a propósito, solo garantiza un hueco táctil mínimo por eje — mismo motor para las 5 capas, sin
      // ninguna rama por `layer.type` aquí.
      //
      // Corrección real (2026-09-28, seguía fallando en iPhone real tras la primera corrección) — el
      // umbral (MIN_ACCESSIBLE_TOUCH_PX) tiene que compararse contra el tamaño REAL en pantalla del
      // lienzo, no contra el lienzo lógico fijo de referencia (ASSUMED_CANVAS_SIZE_PX=380). El
      // renderizado usa fracciones (0..1) sobre el tamaño lógico, escaladas visualmente al tamaño real del
      // contenedor (useCanvasScale) — así que "36px lógicos" solo equivalen a 36px REALES en pantalla
      // cuando el lienzo se renderiza exactamente a 380px; si en este dispositivo/plantilla concretos el
      // lienzo ha tenido que encogerse más (pantalla estrecha, plantilla con aspecto muy vertical, poco
      // alto disponible), esos "36px lógicos" se quedaban en muchos menos px reales — justo el caso real
      // reportado. d.rectW/d.rectH (el rect REAL del lienzo, medido en handleLayerPointerDown al empezar
      // ESTE arrastre) son las unidades correctas: el hueco resultante siempre es de verdad tocable en
      // ESTA pantalla, sea cual sea su escala.
      //
      // (2026-09-29) — sigue haciendo falta con useFitCanvasScale: aunque el lienzo ya no se recorte
      // nunca (ver su comentario), d.rectW/d.rectH pueden ser menores que 380px lógicos en un teléfono
      // estrecho o con una plantilla muy vertical — este clamp es quien garantiza que, aun así, quede
      // hueco táctil real; sin él, useFitCanvasScale por sí solo NO evitaría una esquina de pocos px.
      setLayers((ls) =>
        ls.map((l) => {
          if (l.id !== d.layerId) return l
          const zoneWidthFrac = l.zoneWidthFrac ?? legacyZoneWidthFrac
          const box = estimateLayerBoxFraction(l, zoneWidthFrac, imageAspectNumeric)
          const scale = l.scale || 1
          const x = clampLayerCenterAccessible(d.x0! + dx, box.halfWidth * scale, d.rectW!)
          const y = clampLayerCenterAccessible(d.y0! + dy, box.halfHeight * scale, d.rectH!)
          return { ...l, x, y }
        }),
      )
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
    // Sección 18 — la compatibilidad se recalcula con la foto actual del asistente (si hay una elegida):
    // una plantilla puede tener hueco de sobra sin foto pero no con ella.
    return checkAllStyleCompatibility({ event, template: activeTemplateForPepa, photoPath: pepaPhotoPath, measurer: domTextMeasurer })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, activeTemplateForPepa?.key, activeTemplateForPepa?.textArea, activeTemplateForPepa?.imageAspect, pepaPhotoPath])

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
    // Sección 18 — se deja `pepaStyle` puesto (no se resetea a null) para que, si el usuario añade o quita
    // la foto después, se regenere con el MISMO estilo sin tener que volver a elegirlo.
    setPepaStyle(style)
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

  // Sección 17-18 — un estilo siempre compone directamente (Clásico/Divertido ya no dependen de la foto
  // para generar): usa la foto ya elegida en el asistente, si hay una — nunca la pide antes ni la exige.
  function handlePepaSelectStyle(style: AutoComposeStyle) {
    const compat = pepaCompatibility.find((c) => c.style === style)
    if (!compat?.compatible) return
    setPepaStyle(style)
    setPepaError(null)
    requestPepaGeneration(style, pepaPhotoPath)
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
      setPepaPhotoPath(path)
      // Sección 18 — si ya hay un estilo elegido, la foto nueva regenera con ese mismo estilo; si todavía
      // no se ha elegido ninguno, solo se guarda para cuando el usuario toque un estilo.
      if (pepaStyle) requestPepaGeneration(pepaStyle, path)
    } catch (err) {
      setPepaError(errorMessage(err, 'No se pudo subir la foto'))
    } finally {
      setPepaUploadingPhoto(false)
    }
  }

  function handlePepaRemovePhoto() {
    setPepaPhotoPath(null)
    if (pepaStyle) requestPepaGeneration(pepaStyle, null)
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
  //
  // Evolución del generador narrativo (sección 10) — un campo "eliminado del evento" que forma parte de un
  // párrafo BODY nunca borra la capa entera (perdería el resto de hechos que sigue teniendo): se resuelve
  // regenerando el párrafo, igual que un campo simplemente cambiado — `updateInvitationLayersFromEvent` ya
  // reconstruye la gramática sin la cláusula que falta. "Quitar esta capa" solo tiene sentido para un dato
  // suelto (`event_field`, una capa = un hecho).
  function applyEventDataUpdate() {
    const fieldsToUpdate: Exclude<AutoComposeFieldKey, 'closing'>[] = []
    const fieldsToRemove: Exclude<AutoComposeFieldKey, 'closing'>[] = []
    for (const change of eventDataChanges) {
      const layer = findLayerForField(layers, change.field)
      const isNarrative = layer?.source?.kind === 'event_narrative'
      if (change.current === null && !isNarrative) {
        // Sección 34 — dato eliminado del evento: solo se quita la capa si el usuario lo confirma aquí.
        if (removedFieldDecisions[change.field]) fieldsToRemove.push(change.field)
        continue
      }
      const manuallyEdited = layer ? isInvitationLayerManuallyEdited(layer) : false
      if (manuallyEdited) {
        // Sección 11/32 — nunca se sobrescribe una personalización sin permiso explícito.
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
  // Corrección WYSIWYG — ver el comentario de useCanvasScale más arriba: el lienzo del editor se renderiza
  // al MISMO tamaño lógico fijo (ASSUMED_CANVAS_SIZE_PX) que InvitationCanvasView, para que el salto de
  // línea real sea exactamente el mismo aquí y en cualquier vista previa/guardado posterior — solo cambia
  // el zoom visual (`canvasScale`) según el espacio real disponible en cada dispositivo.
  const imageAspectNumeric = !backgroundImageUrl && currentTemplate?.imageAspect ? currentTemplate.imageAspect : 3 / 4
  const logicalWidthPx = ASSUMED_CANVAS_SIZE_PX
  const logicalHeightPx = ASSUMED_CANVAS_SIZE_PX / imageAspectNumeric
  // Corrección (2026-09-29) — useFitCanvasScale (no useCanvasScale) para que el lienzo del editor quepa
  // SIEMPRE entero (ancho Y alto), ver el comentario junto a su definición.
  const canvasScale = useFitCanvasScale(canvasWrapRef, logicalWidthPx, logicalHeightPx)
  // Ver el comentario junto a "legacyZoneWidthFrac" en InvitationCanvasView: sin esto, el <div> de una capa de
  // texto usa "shrink-to-fit" real (acotado por left, no por el ancho de la zona) y ajusta línea mucho antes
  // de lo que estimateWrappedLineCount asume, así que el bloque pintado de verdad puede ser más alto que el
  // estimado y solapar con la capa siguiente — el mismo editor donde se reportó el bug real en vivo. Valor
  // HEREDADO, para capas sin `zoneWidthFrac` propio — ver el mismo comentario en InvitationCanvasView.
  const legacyZoneWidthFrac = backgroundImageUrl ? (customTextArea ?? DEFAULT_TEXT_AREA).width : (currentTemplate?.textArea ?? DEFAULT_TEXT_AREA).width

  // INV-EDITOR-4 — barra contextual: solo las herramientas que aplican al tipo seleccionado (o, sin
  // selección, las acciones para añadir/elegir plantilla) — nunca los 9 controles de siempre a la vez.
  const isTextLike = selected?.type === 'text' || selected?.type === 'event_data'
  // Reorganización (2026-09-28) — las DOS FILAS FIJAS de herramientas de texto sustituyen a la barra de
  // herramientas normal en cuanto hay una capa de texto seleccionada (no hace falta un paso "Editar" aparte
  // para verlas: alineación/formato/tipografía/apariencia/transformación/capas, todo en un único sitio, sin
  // duplicar Fuente/Tamaño en otro panel). El contenido de la capa solo se vuelve editable (textEditingActive)
  // cuando se pulsa el botón "Editar" de esas dos filas — así seleccionar para mover/formatear nunca abre el
  // teclado por sorpresa. El resto de paneles (color de una forma, tamaño de una foto...) no cambian en nada.
  const textEditMode = isTextLike && !!selected
  useEffect(() => {
    if (!textEditMode) {
      setTextEditTool(null)
      setTextEditingActive(false)
    }
  }, [textEditMode])
  // Autofoco al entrar en edición de texto en el lienzo (mismo criterio que el textarea de antes: autoFocus
  // no basta cuando el elemento no acaba de montarse en este render, así que se hace explícito aquí).
  useEffect(() => {
    if (textEditingActive) inPlaceTextareaRef.current?.focus()
  }, [textEditingActive])

  // Corrección UX (2026-09-28) — Forma usaba una interfaz de color distinta (6 presets + una rueda aparte),
  // ya inconsistente con el selector que se corrigió para Texto. Un único selector directo — sin presets —
  // para cualquier tipo de capa con color editable.
  //
  // Corrección real (2026-09-28, probado en iPhone real: el panel salía prácticamente en blanco y tocarlo
  // no hacía nada) — el truco anterior (un <input type="color"> invisible, opacity:0, superpuesto encima
  // de un swatch decorativo) no es fiable en Safari/iOS: el toque no siempre llega al input real cuando
  // este no es el propio elemento visible. Se vuelve al patrón que SÍ funcionaba ya en este archivo antes
  // de esta fase (el selector "elegir cualquier color" de Forma, nunca reportado como roto): el
  // <input type="color"> real, VISIBLE, estilizado con la clase ya existente .color-wheel-input (un
  // anillo de colores con el color actual dentro, vía ::-webkit-color-swatch) — el propio input ES el
  // botón, así que el toque siempre llega directamente a un control nativo real, nunca a un decorado
  // encima. Sigue siendo un único selector directo (sin presets), compartido tal cual por Texto y Forma.
  function renderColorSwatch() {
    if (!selected) return null
    return (
      <input
        type="color"
        className="color-wheel-input"
        value={selected.color && /^#[0-9a-fA-F]{6}$/.test(selected.color) ? selected.color : '#ffffff'}
        onChange={(e) => updateSelectedContinuous({ color: e.target.value }, 'color')}
        onBlur={commitContinuousEdit}
        aria-label="Color"
        title="Color"
      />
    )
  }

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
            <div className="invitation-canvas-wrap" ref={canvasWrapRef}>
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
                  // Corrección (2026-09-29) — tamaño EXPLÍCITO (no `width:100%` + `aspectRatio` +
                  // `maxHeight:100%`): con ese trío, el navegador nunca reducía el ANCHO aunque el ALTO
                  // quedara acotado por maxHeight, así que el contenido (más alto que el hueco real)
                  // quedaba recortado por overflow:hidden — justo el bug del corazón inaccesible. Ahora
                  // canvasScale (useFitCanvasScale) ya es el mínimo entre lo que permite el ancho Y el
                  // alto disponibles, así que este tamaño SIEMPRE cabe entero — nunca hace falta recortar.
                  width: logicalWidthPx * canvasScale,
                  height: logicalHeightPx * canvasScale,
                  borderRadius: 16,
                  overflow: 'hidden',
                  background: backgroundGradient,
                  touchAction: 'none',
                  WebkitTouchCallout: 'none',
                  WebkitUserSelect: 'none',
                  userSelect: 'none',
                } as CSSProperties}
              >
                {/* Corrección WYSIWYG — contenido a tamaño lógico fijo (ver useFitCanvasScale más arriba),
                    escalado visualmente para llenar el <div ref={canvasRef}> real. canvasRef sigue siendo
                    el elemento cuyo rect real (ya escalado) usan handleLayerPointerDown/handleDragPointerMove/
                    handleHandlePointerDown/handleTextAreaRectPointerDown/la reconciliación de Prettify —
                    ninguno de ellos cambia: getBoundingClientRect() de un ancestro con overflow:hidden ya
                    refleja el tamaño visual real, sea cual sea la profundidad del árbol por debajo. */}
                <div style={{ position: 'absolute', top: 0, left: 0, width: logicalWidthPx, height: logicalHeightPx, transform: `scale(${canvasScale})`, transformOrigin: 'top left' }}>
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
                    const zoneWidthFrac = layer.zoneWidthFrac ?? legacyZoneWidthFrac
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
                      {textEditingActive && layer.id === selectedId && (layer.type === 'text' || layer.type === 'event_data') ? (
                        // Corrección (2026-09-28) — edición EN EL LIENZO, en el sitio real de la capa, en vez
                        // de un textarea grande aparte abajo (duplicado). Mientras se escribe, se simplifica
                        // visualmente (tamaño/color/alineación sí; curva/3D/purpurina/degradados no — esos
                        // efectos vuelven en cuanto se pulsa "✓ Listo", el texto real guardado es idéntico).
                        <textarea
                          ref={inPlaceTextareaRef}
                          value={selected?.text ?? ''}
                          onChange={(e) => updateSelectedContinuous({ text: e.target.value }, 'text')}
                          onBlur={commitContinuousEdit}
                          onPointerDown={(e) => e.stopPropagation()}
                          onInput={(e) => {
                            const el = e.currentTarget
                            el.style.height = 'auto'
                            el.style.height = `${el.scrollHeight}px`
                          }}
                          className="invitation-inplace-textarea"
                          style={{
                            width: '100%',
                            color: layer.color || '#ffffff',
                            fontFamily: layer.fontFamily && layer.fontFamily !== 'inherit' ? layer.fontFamily : BASE_FONT_STACK,
                            fontSize: layer.fontSize ?? 16,
                            fontWeight: resolveLayerFontWeight(layer),
                            fontStyle: layer.italic ? 'italic' : 'normal',
                            textAlign: layer.textAlign ?? 'center',
                            lineHeight: LINE_HEIGHT_RATIO,
                          }}
                        />
                      ) : (
                        <InvitationLayerVisual layer={layer} photoUrls={photoUrls} />
                      )}
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
                </div>
                {/* Barra de confirmación FUERA del lienzo a tamaño lógico (arriba): es UI del editor, no
                    contenido de la invitación — debe verse siempre a tamaño de texto normal, nunca
                    encogerse/agrandarse con el zoom visual del lienzo. Sigue dentro de <div ref={canvasRef}>
                    (misma referencia de posicionamiento que antes, position:'relative' ya lo trae ese <div>,
                    sin tocar el <div className="invitation-canvas-wrap"> exterior). */}
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
                resolveLayerFontWeight, ALIGN_OPTIONS, LAYER_FONT_OPTIONS, renderColorSwatch) — nada de
                lógica nueva, solo una disposición distinta para móvil. */}
            {/* Reorganización (2026-09-28) — menú de texto en DOS FILAS FIJAS, agrupadas por familia y
                separadas por una línea vertical fina (petición real), siempre visibles mientras haya un
                texto seleccionado (no hace falta pulsar "Editar" para verlas — solo para escribir). Fuente
                y Tamaño existen UNA sola vez aquí (antes se repetían en el panel inferior genérico). Al
                pulsar una herramienta, sus opciones se despliegan justo encima de las dos filas — nunca una
                pantalla nueva. Mismo estilo visual de botones que antes (.invitation-text-edit-btn), solo
                reorganizados. */}
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
                {textEditTool === 'size' && (
                  <div className="filter-row" style={{ alignItems: 'center', justifyContent: 'center' }}>
                    <button type="button" className="invitation-text-edit-btn" onClick={() => updateSelectedDiscrete({ fontSize: Math.max(10, (selected.fontSize ?? 16) - 2) })} aria-label="Letra más pequeña">
                      A−
                    </button>
                    <span className="muted" style={{ fontSize: 12, flexShrink: 0 }}>
                      {Math.round(selected.fontSize ?? 16)}
                    </span>
                    <button type="button" className="invitation-text-edit-btn" onClick={() => updateSelectedDiscrete({ fontSize: (selected.fontSize ?? 16) + 2 })} aria-label="Letra más grande">
                      A+
                    </button>
                  </div>
                )}
                {textEditTool === 'effect' && (
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
                {textEditTool === 'curve' && selected.type === 'text' && (
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
                <div className="invitation-text-toolbar-row">
                  <button
                    type="button"
                    className={'invitation-text-edit-btn' + (textEditingActive ? ' invitation-text-edit-btn-active' : '')}
                    onClick={() => setTextEditingActive((v) => !v)}
                    aria-label={textEditingActive ? 'Terminar edición del texto' : 'Editar texto'}
                  >
                    {textEditingActive ? '✓' : '✏️'}
                  </button>
                  <div className="invitation-text-toolbar-sep" />
                  {/* GRUPO 1 — posición/alineación */}
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
                  <div className="invitation-text-toolbar-sep" />
                  {/* GRUPO 2 — formato */}
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
                  <div className="invitation-text-toolbar-sep" />
                  {/* GRUPO 3 — tipografía (fuente + tamaño, cada uno UNA sola vez en todo el editor) */}
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
                    className={'invitation-text-edit-btn' + (textEditTool === 'size' ? ' invitation-text-edit-btn-active' : '')}
                    onClick={() => setTextEditTool((t) => (t === 'size' ? null : 'size'))}
                    aria-label="Tamaño"
                    title="Tamaño"
                  >
                    A±
                  </button>
                </div>
                <div className="invitation-text-toolbar-row">
                  {/* GRUPO 4 — apariencia (color y efectos juntos). renderColorSwatch (definido más arriba)
                      es la MISMA implementación que usa Forma — un único selector directo, sin presets. */}
                  {renderColorSwatch()}
                  <button
                    type="button"
                    className={'invitation-text-edit-btn' + (textEditTool === 'effect' ? ' invitation-text-edit-btn-active' : '')}
                    onClick={() => setTextEditTool((t) => (t === 'effect' ? null : 'effect'))}
                    aria-label="Efectos"
                  >
                    ✨
                  </button>
                  {selected.type === 'text' && (
                    <>
                      <div className="invitation-text-toolbar-sep" />
                      {/* GRUPO 5 — transformación (solo tiene sentido en una línea, no en event_data) */}
                      <button
                        type="button"
                        className={'invitation-text-edit-btn' + (textEditTool === 'curve' ? ' invitation-text-edit-btn-active' : '')}
                        onClick={() => setTextEditTool((t) => (t === 'curve' ? null : 'curve'))}
                        aria-label="Curvar texto"
                      >
                        ⌒
                      </button>
                    </>
                  )}
                  <div className="invitation-text-toolbar-sep" />
                  {/* GRUPO 6 — capas/objeto. Corrección real: ⬆/⬇ se confundían con "mover el objeto arriba/
                      abajo" (ya hay arrastre libre en el lienzo) en vez de "orden de capas" — dos cuadrados
                      superpuestos (uno relleno = la posición a la que pasa, otro solo con borde = la otra)
                      leen como capas apiladas, nunca como movimiento físico. */}
                  <button type="button" className="invitation-text-edit-btn" onClick={() => handleReorder(1)} aria-label="Traer adelante" title="Traer adelante">
                    <span style={{ position: 'relative', display: 'inline-block', width: 16, height: 16 }}>
                      <span style={{ position: 'absolute', left: 0, top: 5, width: 10, height: 10, border: '1.5px solid currentColor', borderRadius: 2, opacity: 0.45 }} />
                      <span style={{ position: 'absolute', right: 0, top: 1, width: 10, height: 10, background: 'currentColor', borderRadius: 2 }} />
                    </span>
                  </button>
                  <button type="button" className="invitation-text-edit-btn" onClick={() => handleReorder(-1)} aria-label="Enviar atrás" title="Enviar atrás">
                    <span style={{ position: 'relative', display: 'inline-block', width: 16, height: 16 }}>
                      <span style={{ position: 'absolute', right: 0, top: 1, width: 10, height: 10, border: '1.5px solid currentColor', borderRadius: 2, opacity: 0.45 }} />
                      <span style={{ position: 'absolute', left: 0, top: 5, width: 10, height: 10, background: 'currentColor', borderRadius: 2 }} />
                    </span>
                  </button>
                  <button type="button" className="invitation-text-edit-btn" onClick={handleDuplicate} aria-label="Duplicar">
                    ⧉
                  </button>
                  <ConfirmIconButton icon="✕" className="invitation-text-edit-btn" ariaLabel="Borrar elemento" onConfirm={handleDeleteSelected} />
                </div>
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
                          {/* Sección 17-18 — solo dos estilos; la foto es una elección aparte, ortogonal a
                              cualquiera de los dos (Clásico/Divertido, con o sin foto, las 4 combinaciones
                              son válidas) — nunca un tercer estilo "Con foto". */}
                          <div className="filter-row" style={{ flexWrap: 'wrap' }}>
                            {(
                              [
                                { style: 'clasico' as const, label: '📝 Clásico' },
                                { style: 'divertido' as const, label: '🎉 Moderno' },
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
                          <div style={{ marginTop: 10 }}>
                            {pepaPhotoPath ? (
                              <div className="filter-row" style={{ alignItems: 'center' }}>
                                <span className="muted" style={{ fontSize: 12 }}>📷 Foto añadida</span>
                                <button type="button" className="link-button" style={{ fontSize: 12 }} onClick={handlePepaRemovePhoto}>
                                  Quitar
                                </button>
                              </div>
                            ) : (
                              <label className="chip" style={{ cursor: 'pointer' }}>
                                {pepaUploadingPhoto ? 'Subiendo…' : '📷 Añadir foto (opcional)'}
                                <input type="file" accept="image/*" onChange={handlePepaPhotoChange} style={{ display: 'none' }} disabled={pepaUploadingPhoto} />
                              </label>
                            )}
                            <p className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                              Puedes elegir un estilo con o sin foto — si esta plantilla no tiene hueco para tu foto, quítala o elige otra plantilla.
                            </p>
                          </div>
                        </>
                      )}
                    </>
                  )}

                  {panel === 'decorar' && (
                    <>
                      {/* Unificación Emoji+Forma → Decorar (2026-09-28) — un único punto de entrada con dos
                          pestañas, en vez de dos botones de barra distintos; cada pestaña reutiliza tal cual
                          el catálogo y las acciones que ya tenía por separado (nada de contenido nuevo). */}
                      <div className="filter-row" style={{ marginBottom: 8 }}>
                        <button
                          type="button"
                          className={'chip' + (decorarTab === 'emoji' ? ' chip-active' : '')}
                          onClick={() => setDecorarTab('emoji')}
                        >
                          😀 Emojis
                        </button>
                        <button
                          type="button"
                          className={'chip' + (decorarTab === 'forma' ? ' chip-active' : '')}
                          onClick={() => setDecorarTab('forma')}
                        >
                          ◆ Formas
                        </button>
                      </div>

                      {decorarTab === 'emoji' && (
                        <>
                          {/* Petición real: "los emojis salen muy pocos, lo suyo sería poder usar cualquier
                              emoji del teclado" — el teclado emoji nativo del móvil ya funciona en cualquier
                              campo de texto, así que el mismo campo sirve para dos cosas: buscar un concepto
                              en español (biblioteca local, sin API) O pegar/escribir directamente cualquier
                              emoji del teclado y añadirlo tal cual con "+ Añadir". */}
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
                                    <InvitationEmojiChip key={e.char} char={e.char} onInsert={handleInsertEmoji} />
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
                                      <InvitationEmojiChip key={em} char={em} onInsert={handleInsertEmoji} />
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
                                      <InvitationEmojiChip key={e.char} char={e.char} onInsert={handleInsertEmoji} />
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </>
                          )}
                        </>
                      )}

                      {decorarTab === 'forma' && (
                        <div className="filter-row" style={{ flexWrap: 'wrap' }}>
                          {INVITATION_SHAPES.map((s) => (
                            <button key={s.key} type="button" className="chip" onClick={() => handleInsertShape(s.key)}>
                              {s.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
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
                            onClick={() => {
                              // Fase 3 Bloque 5B (sección 23-24) — igual que las capas de "Pepa, hazla por mí",
                              // esta capa insertada a mano queda marcada con su procedencia, para poder detectar
                              // más tarde si el evento cambió.
                              // Corrección (2026-09-28) — cada dato busca su propia posición libre en vez de
                              // caer siempre en el centro exacto (0.5, 0.5), donde varios datos seguidos
                              // quedaban apilados unos encima de otros.
                              const pos = findFreeDataLayerPosition(layers)
                              handleAddLayer(
                                makeInvitationLayer('event_data', {
                                  text: f.value,
                                  color: '#ffffff',
                                  fontSize: 14,
                                  x: pos.x,
                                  y: pos.y,
                                  source: { kind: 'event_field', field: toEventFieldKey(f.key), valueAtInsertion: f.value },
                                }),
                              )
                            }}
                          >
                            {alreadyInserted ? '✓ ' : ''}
                            {f.value}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {/* Fuente/Tamaño/Efecto de texto y su Color ya no viven aquí (2026-09-28) — están
                      SIEMPRE visibles en las dos filas fijas del menú de texto (ver más abajo) en cuanto
                      hay una capa de texto seleccionada, sin duplicar controles en dos sitios distintos.
                      Este panel de color solo sigue haciendo falta para una forma. Corrección UX
                      (2026-09-28) — ya no hay presets + rueda aparte: mismo selector directo que Texto
                      (renderColorSwatch, definido más arriba), sin mantener dos sistemas de color. */}
                  {panel === 'color' && selected && selected.type === 'shape' && (
                    <div className="filter-row" style={{ alignItems: 'center' }}>{renderColorSwatch()}</div>
                  )}

                  {panel === 'tamano' && selected && (
                    <div className="filter-row" style={{ alignItems: 'center', justifyContent: 'center' }}>
                      {/* Petición real: "he insertado una foto y no consigo editar su tamaño" — el texto
                          ya no llega aquí (tiene su propio control en las dos filas fijas), así que el paso
                          es siempre el de foto/forma/emoji. El punto azul de la esquina (pellizcar/
                          arrastrar) sigue siendo el gesto principal. Corrección UX (2026-09-28) — Forma
                          usa ahora el mismo patrón "A±" que Texto (mismo estilo de botón, mismo glifo "−"),
                          en vez del antiguo icono 🔠 de la barra; foto/emoji siguen con el mismo control,
                          sin cambios pedidos para ellos en esta corrección. */}
                      <button type="button" className="invitation-text-edit-btn" onClick={() => updateSelectedDiscrete({ fontSize: Math.max(10, (selected.fontSize ?? 16) - 15) })} aria-label="Más pequeño">
                        A−
                      </button>
                      <span className="muted" style={{ fontSize: 12 }}>
                        {Math.round(selected.fontSize ?? 16)}
                      </span>
                      <button type="button" className="invitation-text-edit-btn" onClick={() => updateSelectedDiscrete({ fontSize: (selected.fontSize ?? 16) + 15 })} aria-label="Más grande">
                        A+
                      </button>
                    </div>
                  )}

                  {panel === 'mas' && selected && (
                    <>
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
                      <div className="filter-row">
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
                    <button type="button" className={'invitation-toolbar-btn' + (panel === 'decorar' ? ' invitation-toolbar-btn-active' : '')} onClick={() => togglePanel('decorar')}>
                      <span className="invitation-toolbar-icon">🖌️</span>
                      <span>Decorar</span>
                    </button>
                    <button type="button" className={'invitation-toolbar-btn' + (panel === 'plantilla' ? ' invitation-toolbar-btn-active' : '')} onClick={() => togglePanel('plantilla')}>
                      <span className="invitation-toolbar-icon">🎨</span>
                      <span>Plantilla</span>
                    </button>
                  </>
                ) : selected.type === 'shape' ? (
                  <>
                    <button type="button" className={'invitation-toolbar-btn' + (panel === 'color' ? ' invitation-toolbar-btn-active' : '')} onClick={() => togglePanel('color')}>
                      <span className="invitation-toolbar-icon">🎨</span>
                      <span>Color</span>
                    </button>
                    <button type="button" className={'invitation-toolbar-btn' + (panel === 'tamano' ? ' invitation-toolbar-btn-active' : '')} onClick={() => togglePanel('tamano')}>
                      <span className="invitation-toolbar-icon">A±</span>
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
            {/* Evolución del generador narrativo (sección 10) — los cambios se agrupan por la capa a la que
                pertenecen: varios campos de un mismo párrafo BODY comparten UNA sola decisión (el párrafo se
                regenera entero, nunca palabra por palabra), en vez de una fila independiente por campo que
                podría contradecirse entre sí. Un dato suelto (`event_field`) sigue siendo su propio grupo de
                un solo campo, con el mismo comportamiento de siempre. */}
            {groupEventDataChanges(eventDataChanges, layers).map((group) => {
              const isNarrative = group.layer?.source?.kind === 'event_narrative'
              const labels = group.changes.map((c) => EVENT_FIELD_LABELS[c.field]).join(', ')
              const manuallyEdited = group.layer ? isInvitationLayerManuallyEdited(group.layer) : false
              const allRemoved = group.changes.every((c) => c.current === null)

              if (allRemoved && !isNarrative) {
                const change = group.changes[0]
                return (
                  <div key={group.key} style={{ fontSize: 13 }}>
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
                const decision = manualFieldDecisions[group.changes[0].field] ?? 'keep'
                const setDecisionForGroup = (value: 'update' | 'keep') =>
                  setManualFieldDecisions((m) => {
                    const next = { ...m }
                    for (const c of group.changes) next[c.field] = value
                    return next
                  })
                return (
                  <div key={group.key} style={{ fontSize: 13 }}>
                    <p style={{ margin: 0 }}>
                      {isNarrative
                        ? `Modificaste manualmente el párrafo que menciona ${labels}. Actualizarlo lo redactará de nuevo con los datos actuales.`
                        : `Modificaste manualmente el texto de ${labels}. Actualizarlo lo sustituirá por «${group.changes[0].current}».`}
                    </p>
                    <div className="filter-row" style={{ marginTop: 4 }}>
                      <button type="button" className={'chip' + (decision === 'update' ? ' chip-active' : '')} onClick={() => setDecisionForGroup('update')}>
                        Actualizar
                      </button>
                      <button type="button" className={'chip' + (decision === 'keep' ? ' chip-active' : '')} onClick={() => setDecisionForGroup('keep')}>
                        Mantener mi texto
                      </button>
                    </div>
                  </div>
                )
              }
              return (
                <p key={group.key} style={{ margin: 0, fontSize: 13 }}>
                  {isNarrative ? `${labels}: se redactará de nuevo el párrafo con los datos actuales` : `${EVENT_FIELD_LABELS[group.changes[0].field]}: «${group.changes[0].previous}» → «${group.changes[0].current}» (se actualizará)`}
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
