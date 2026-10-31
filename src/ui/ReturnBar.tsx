import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { returnRouteState, takeNavOrigin, type NavOrigin } from '@/state/navOrigin'

// NAV-01 — barra «← Volver a [origen]» pegada arriba (sticky, mismo estilo que la de Historial de precios). Solo se enseña si se llegó desde otro módulo.
export function ReturnBar({ label, onBack, testId = 'return-bar' }: { label: string; onBack: () => void; testId?: string }) {
  return (
    <div className="receipt-back-bar" data-testid={testId}>
      <button type="button" onClick={onBack} aria-label={`Volver a ${label}`}>
        ← Volver a {label}
      </button>
    </div>
  )
}

/**
 * Para la pantalla DE DESTINO de un enlace entre módulos: recoge el origen una sola vez al montarse (o el heredado al volver a una pantalla intermedia) y da la barra lista.
 * `restoreScroll` (por defecto sí) devuelve la página a su sitio cuando es ELLA la pantalla a la que se vuelve.
 */
export function useNavOrigin(to: string): { origin: NavOrigin | null; bar: React.ReactNode } {
  const navigate = useNavigate()
  const location = useLocation()
  const [origin] = useState<NavOrigin | null>(() => takeNavOrigin(to, (location.state as { navParent?: NavOrigin } | null)?.navParent ?? null))
  const restoreY = (location.state as { navRestoreScrollY?: number } | null)?.navRestoreScrollY
  useEffect(() => {
    // Al llegar de vuelta a esta pantalla desde un destino, la página vuelve al punto en el que estaba.
    if (typeof restoreY === 'number' && restoreY > 0) {
      const t = window.setTimeout(() => window.scrollTo(0, restoreY), 350) // cuando ya hay contenido cargado
      return () => window.clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const bar = origin ? <ReturnBar label={origin.label} onBack={() => navigate(origin.path, { state: returnRouteState(origin) })} /> : null
  return { origin, bar }
}
