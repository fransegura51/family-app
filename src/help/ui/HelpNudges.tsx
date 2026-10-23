import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { HELP_CONTEXTUAL_ENABLED } from '@/help/flags'
import { HELP_MODULE_BY_ID } from '@/help/catalog'
import { getWelcomeState, hasSeenModuleHint, HELP_WELCOME_KEY, markModuleHintSeen, setWelcomeState } from '@/help/prefs'
import { moduleForPath } from '@/help/context'
import type { HelpModuleId } from '@/help/types'
import { useOptionalHelp } from '@/help/ui/helpContext'
import { PepaFace } from '@/help/ui/PepaFace'
import { usePrefChange } from '@/state/prefs/usePrefChange'
import '@/help/ui/help.css'

// Sugerencias DISCRETAS de «Pepa te acompaña». Dos, y nada más:
//  1. Bienvenida: solo a cuentas nuevas (las marca el alta), en Inicio y una sola vez: «¿Te enseño PEPA en 1 o 2 minutos?» con «Ahora no» (no vuelve a preguntar).
//  2. Primera visita a un módulo: un aviso pequeño, una sola vez por módulo y cuenta, que remite al «?» de la pantalla.
// Nunca aparecen mientras hay un tutorial en marcha o el panel de Pepa abierto, ni a cuentas anteriores (sin marca de cuenta nueva): evitar molestias y repeticiones.
const HINT_MODULES: HelpModuleId[] = ['calendario', 'compras', 'cocina', 'economia', 'eventos', 'pequenos', 'familia', 'cumpleanos', 'contactos', 'galeria', 'documentos', 'ubicacion']

export function HelpNudges() {
  const help = useOptionalHelp()
  const location = useLocation()
  const [welcome, setWelcome] = useState(() => getWelcomeState())
  const [hint, setHint] = useState<HelpModuleId | null>(null)
  usePrefChange(HELP_WELCOME_KEY, () => setWelcome(getWelcomeState()))

  // Al cerrarse un tutorial (completado u omitido) se vuelve a leer el estado: la bienvenida no debe reaparecer.
  const activeTour = help?.activeTour ?? null
  useEffect(() => setWelcome(getWelcomeState()), [activeTour])

  const busy = !help || Boolean(help.activeTour) || help.panelOpen
  const module = moduleForPath(location.pathname)

  // Primera visita a un módulo (solo cuentas nuevas): se recuerda como visto en el mismo momento de enseñarla, para no repetirla.
  useEffect(() => {
    if (!HELP_CONTEXTUAL_ENABLED || busy || welcome === null || !module || !HINT_MODULES.includes(module) || hasSeenModuleHint(module)) return
    markModuleHintSeen(module)
    setHint(module)
    const t = window.setTimeout(() => setHint((cur) => (cur === module ? null : cur)), 9000)
    return () => window.clearTimeout(t)
  }, [module, busy, welcome])

  if (!help || busy) return null

  if (welcome === 'pending' && location.pathname === '/') {
    return (
      <aside className="help-nudge" role="complementary" aria-label="Pepa te propone un recorrido">
        <PepaFace size={36} />
        <div className="help-nudge-body">
          <p>
            <strong>Hola, soy Pepa.</strong> ¿Te enseño PEPA en 1 o 2 minutos?
          </p>
          <div className="help-actions">
            <button type="button" className="help-btn help-btn-primary" onClick={() => help.startTourById('bienvenida')}>
              Sí, enséñame
            </button>
            <button type="button" className="help-btn" onClick={() => {
                setWelcomeState('skipped')
                setWelcome('skipped')
              }}>
              Ahora no
            </button>
          </div>
        </div>
      </aside>
    )
  }

  if (hint) {
    const label = HELP_MODULE_BY_ID.get(hint)?.label ?? ''
    return (
      <aside className="help-nudge help-nudge-hint" role="status" aria-label={`Sugerencia sobre ${label}`}>
        <PepaFace size={28} />
        <p>
          ¿Primera vez en {label}? Toca el <strong>?</strong> de arriba cuando quieras ver cómo funciona.
        </p>
        <button type="button" className="help-icon-btn" onClick={() => setHint(null)} aria-label="Cerrar la sugerencia">
          ✕
        </button>
      </aside>
    )
  }
  return null
}
