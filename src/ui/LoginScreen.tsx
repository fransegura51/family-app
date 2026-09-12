import { FormEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, useRef, useState } from 'react'
import { supabase } from '@/data/supabaseClient'

// Petición real: "que aparezca en la pantalla de inicio con el símbolo
// [...] en redondo, en un rincón [...] que se pueda mover" — mismo
// patrón ya usado para los botones redondos de Pepa (VoiceCapture.tsx:
// arrastre con puntero, .voice-fab-round/.voice-fab-dragging), aquí con
// un único botón y su propia clave de posición guardada en el
// dispositivo. Por defecto, abajo a la derecha (no tapa el formulario).
const TIKTOK_URL = 'https://vm.tiktok.com/ZN9SCoTPw5T4b-Psl03/'
const TIKTOK_FAB_SIZE = 48
const TIKTOK_FAB_TAP_THRESHOLD_PX = 8
const TIKTOK_FAB_POSITION_KEY = 'familyapp:tiktok-fab-position'

interface FabPosition {
  top: number
  left: number
}

// null = todavía no se ha arrastrado nunca — se queda anclado a la
// esquina por CSS (right/bottom, ver estilo más abajo), que se adapta
// solo a cualquier tamaño de pantalla. Calcular esa esquina a mano con
// window.innerWidth/innerHeight (como se hizo al principio) es frágil:
// si el tamaño de la ventana cambia justo después del primer render
// (bug real visto en pruebas: el bloque quedaba fuera de la pantalla,
// en -64,-64), la posición por defecto se queda calculada con un
// tamaño que ya no es el real. Solo se guardan coordenadas en px
// (top/left) una vez la familia lo ha arrastrado de verdad — ahí sí
// son un valor concreto y fiable (el sitio exacto donde lo soltaron).
function loadTiktokFabPosition(): FabPosition | null {
  try {
    const raw = localStorage.getItem(TIKTOK_FAB_POSITION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed?.top === 'number' && typeof parsed?.left === 'number') return parsed
    return null
  } catch {
    return null
  }
}

function saveTiktokFabPosition(position: FabPosition) {
  try {
    localStorage.setItem(TIKTOK_FAB_POSITION_KEY, JSON.stringify(position))
  } catch {
    // localStorage puede fallar en privado/incógnito — no es crítico,
    // solo se pierde recordar dónde se dejó el botón.
  }
}

function TiktokFab() {
  const [position, setPosition] = useState<FabPosition | null>(() => loadTiktokFabPosition())
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  // Posición real (getBoundingClientRect) justo al empezar a arrastrar —
  // vale igual si hasta ahora estaba anclado por CSS (esquina por
  // defecto) o por top/left ya guardados; a partir de aquí el arrastre
  // siempre trabaja con números concretos.
  const dragRef = useRef<{ startX: number; startY: number; startTop: number; startLeft: number; moved: number } | null>(null)
  const wasDraggedRef = useRef(false)

  function handleDragStart(e: ReactPointerEvent<HTMLAnchorElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    wasDraggedRef.current = false
    const rect = e.currentTarget.getBoundingClientRect()
    dragRef.current = { startX: e.clientX, startY: e.clientY, startTop: rect.top, startLeft: rect.left, moved: 0 }
    setDragging(true)
  }

  function handleDragMove(e: ReactPointerEvent<HTMLAnchorElement>) {
    const drag = dragRef.current
    if (!drag) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    drag.moved = Math.max(drag.moved, Math.abs(dx), Math.abs(dy))
    if (drag.moved >= TIKTOK_FAB_TAP_THRESHOLD_PX) wasDraggedRef.current = true
    setDragOffset({ x: dx, y: dy })
  }

  function handleDragEnd(e: ReactPointerEvent<HTMLAnchorElement>) {
    const drag = dragRef.current
    dragRef.current = null
    setDragging(false)
    setDragOffset({ x: 0, y: 0 })
    if (!drag) return
    if (drag.moved >= TIKTOK_FAB_TAP_THRESHOLD_PX) {
      const maxLeft = Math.max(0, window.innerWidth - TIKTOK_FAB_SIZE)
      const maxTop = Math.max(0, window.innerHeight - TIKTOK_FAB_SIZE)
      const next = {
        top: Math.min(Math.max(0, drag.startTop + (e.clientY - drag.startY)), maxTop),
        left: Math.min(Math.max(0, drag.startLeft + (e.clientX - drag.startX)), maxLeft),
      }
      setPosition(next)
      saveTiktokFabPosition(next)
    }
  }

  function handleClick(e: ReactMouseEvent) {
    // Si justo antes hubo un arrastre de verdad, este clic que viene
    // detrás no debe abrir el enlace — ya se ha hecho lo que se quería.
    if (wasDraggedRef.current) {
      wasDraggedRef.current = false
      e.preventDefault()
    }
  }

  const showDefaultCorner = !dragging && position == null
  const draggedOrSaved = dragging ? { top: dragRef.current!.startTop + dragOffset.y, left: dragRef.current!.startLeft + dragOffset.x } : position

  return (
    <a
      href={TIKTOK_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="Síguenos en TikTok"
      className={'voice-fab-round tiktok-fab' + (dragging ? ' voice-fab-dragging' : '') + (showDefaultCorner ? ' tiktok-fab-default-corner' : '')}
      style={{
        ...(draggedOrSaved ? { top: draggedOrSaved.top, left: draggedOrSaved.left } : {}),
        width: TIKTOK_FAB_SIZE,
        height: TIKTOK_FAB_SIZE,
      }}
      onClick={handleClick}
      onPointerDown={handleDragStart}
      onPointerMove={handleDragMove}
      onPointerUp={handleDragEnd}
      onPointerCancel={handleDragEnd}
    >
      <svg viewBox="0 0 24 24" width="24" height="24" fill="white" aria-hidden="true">
        <path d="M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
      </svg>
    </a>
  )
}

export function LoginScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setInfo(null)

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setError(error.message)
      } else if (!data.session) {
        // Confirmación de email activada en el proyecto: no hay sesión todavía.
        setInfo('Cuenta creada. Revisa tu email para confirmar antes de entrar.')
      }
    }
    setLoading(false)
  }

  return (
    <div className="screen screen-centered">
      <h1>Family App</h1>
      <form onSubmit={handleSubmit} className="card">
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        {info && <p className="muted">{info}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Procesando…' : mode === 'signin' ? 'Entrar' : 'Crear cuenta'}
        </button>
      </form>
      <button
        type="button"
        className="link-button"
        onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin')
          setError(null)
          setInfo(null)
        }}
      >
        {mode === 'signin' ? '¿No tienes cuenta? Crear una' : '¿Ya tienes cuenta? Entrar'}
      </button>
      {/* Una persona tiene que poder leer la política ANTES de crear la
          cuenta (RGPD) — páginas estáticas de public/, sin sesión. */}
      <p className="muted" style={{ fontSize: 12, marginTop: 24, textAlign: 'center' }}>
        Al crear una cuenta aceptas los{' '}
        <a href={`${import.meta.env.BASE_URL}terminos.html`}>términos de uso</a> y la{' '}
        <a href={`${import.meta.env.BASE_URL}privacidad.html`}>política de privacidad</a>.
      </p>
      {/* Petición real: "queremos ponerle un enlace directo desde la
          aplicación a la cuenta del TikTok que tiene Pepa" — visible
          incluso antes de entrar, pensado para quien todavía no usa la
          app. */}
      <TiktokFab />
    </div>
  )
}
