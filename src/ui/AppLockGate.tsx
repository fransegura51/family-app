import { ReactNode, useEffect, useState } from 'react'
import { hasOwnPin } from '@/data/appLock'
import { AppLockScreen } from '@/ui/AppLockScreen'

// El bloqueo es opcional (petición real: "hazlo opcional, si alguien
// no lo quiere poner que no lo ponga") — por eso siempre se comprueba
// primero si ESTA persona activó un PIN antes de enseñar nada; si
// nunca lo activó, pasa directo sin pedir nada. "Desbloqueado" vive
// solo en memoria (useState), nunca en localStorage: al recargar o
// reabrir la PWA se vuelve a pedir, que es justo el punto de un bloqueo.
export function AppLockGate({ profileId, children }: { profileId: string; children: ReactNode }) {
  const [checking, setChecking] = useState(true)
  const [locked, setLocked] = useState(false)

  useEffect(() => {
    let active = true
    hasOwnPin()
      .then((has) => {
        if (active) {
          setLocked(has)
          setChecking(false)
        }
      })
      .catch(() => {
        if (active) {
          setLocked(false)
          setChecking(false)
        }
      })
    return () => {
      active = false
    }
  }, [profileId])

  if (checking) return null
  if (locked) return <AppLockScreen onUnlock={() => setLocked(false)} />
  return <>{children}</>
}
