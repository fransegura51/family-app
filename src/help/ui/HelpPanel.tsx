import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { HelpConversation } from '@/help/ui/HelpConversation'
import { useOptionalHelp } from '@/help/ui/helpContext'
import { HelpVoiceSetting } from '@/help/ui/HelpVoiceSetting'
import { PepaFace } from '@/help/ui/PepaFace'
import '@/help/ui/help.css'

// Panel flotante «Pepa te acompaña» (ayuda contextual). NO es un diálogo modal: no tapa ni bloquea la pantalla de debajo del todo, así que lo que la persona estuviera escribiendo
// en un formulario se conserva (el panel no desmonta nada). En móvil es una hoja inferior; en tableta y ordenador, un panel lateral. Esc lo minimiza (la conversación sigue
// mientras no se cierre). Dentro de la pantalla de Ayuda no se pinta: allí la conversación ya está en la propia pantalla.
export function HelpPanel() {
  const help = useOptionalHelp()
  const location = useLocation()
  const ref = useRef<HTMLElement | null>(null)
  const open = Boolean(help?.panelOpen) && location.pathname !== '/ayuda'

  useEffect(() => {
    if (!open || !help) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') help.minimize()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, help])

  if (!help || !open) return null
  return (
    <aside ref={ref} className="help-panel" role="complementary" aria-label="Pepa te acompaña: Ayuda" data-help-panel="true">
      <header className="help-panel-head">
        <PepaFace size={34} />
        <div className="help-panel-title">
          <strong>Pepa te acompaña</strong>
          <span className="muted">Ayuda</span>
        </div>
        <HelpVoiceSetting compact />
        <button type="button" className="help-icon-btn" onClick={() => help.minimize()} aria-label="Minimizar la Ayuda (la conversación se conserva)" title="Minimizar">
          —
        </button>
        <button type="button" className="help-icon-btn" onClick={() => help.closeHelp()} aria-label="Cerrar la Ayuda (se borra la conversación)" title="Cerrar">
          ✕
        </button>
      </header>
      <div className="help-panel-body">
        <HelpConversation focusModule={help.focusModule ?? help.currentModule} autoFocus />
      </div>
    </aside>
  )
}
