import { ReactNode, useEffect, useRef, useState } from 'react'
import { hasOwnPin } from '@/data/appLock'
import { APP_LOCK_CHANGED_EVENT, shouldRelockAfterBackground } from '@/domain/appLockPolicy'
import { AppLockScreen } from '@/ui/AppLockScreen'

// El bloqueo es opcional (petición real: "hazlo opcional, si alguien
// no lo quiere poner que no lo ponga") — por eso siempre se comprueba
// primero si ESTA persona activó un PIN antes de enseñar nada; si
// nunca lo activó, pasa directo sin pedir nada. "Desbloqueado" vive
// solo en memoria (useState), nunca en localStorage: al recargar o
// reabrir la PWA se vuelve a pedir, que es justo el punto de un bloqueo.
//
// Además (cuentas y seguridad): si la app estuvo fuera de la pantalla un minuto o más (segundo plano, otra app, móvil bloqueado) y la persona tiene PIN,
// al volver se pide de nuevo (domain/appLockPolicy.ts). Y cuando en Configuración → Seguridad se activa, cambia o quita el PIN, esta puerta se entera al
// momento (APP_LOCK_CHANGED_EVENT) sin esperar a recargar. Activar un PIN NO bloquea al instante a quien acaba de crearlo.
export function AppLockGate({ profileId, children }: { profileId: string; children: ReactNode }) {
  const [checking, setChecking] = useState(true)
  const [locked, setLocked] = useState(false)
  const [hasPin, setHasPin] = useState(false)
  const hiddenAtRef = useRef<number | null>(null)

  useEffect(() => {
    let active = true
    hasOwnPin()
      .then((has) => {
        if (active) {
          setHasPin(has)
          setLocked(has)
          setChecking(false)
        }
      })
      .catch(() => {
        if (active) {
          setHasPin(false)
          setLocked(false)
          setChecking(false)
        }
      })
    return () => {
      active = false
    }
  }, [profileId])

  // La pantalla de Seguridad avisa de que el PIN cambió (activado, cambiado, quitado o recuperado): se vuelve a preguntar si hay PIN.
  useEffect(() => {
    let active = true
    function onChanged() {
      hasOwnPin()
        .then((has) => {
          if (!active) return
          setHasPin(has)
          if (!has) setLocked(false)
        })
        .catch(() => undefined)
    }
    window.addEventListener(APP_LOCK_CHANGED_EVENT, onChanged)
    return () => {
      active = false
      window.removeEventListener(APP_LOCK_CHANGED_EVENT, onChanged)
    }
  }, [])

  // Volver de segundo plano: con PIN y un minuto o más fuera, se bloquea.
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now()
        return
      }
      const relock = shouldRelockAfterBackground({ hiddenAtMs: hiddenAtRef.current, nowMs: Date.now(), hasPin })
      hiddenAtRef.current = null
      if (relock) setLocked(true)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [hasPin])

  if (checking) return null
  if (locked) return <AppLockScreen onUnlock={() => setLocked(false)} />
  return <>{children}</>
}
