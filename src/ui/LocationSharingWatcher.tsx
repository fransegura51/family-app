import { useEffect } from 'react'
import { listFamilyMembers } from '@/data/family'
import { listConsents } from '@/data/location'
import { resumeFromStorage, startSharing } from '@/services/locationSharing'

// Componente sin UI, montado una sola vez a nivel de la app (fuera de
// las rutas, igual que ReminderWatcher).
//
// Dos formas de retomar el compartir, sin que haga falta tocar nada:
// 1. resumeFromStorage() — este mismo dispositivo ya estaba compartiendo
//    (recargar la página, volver a abrir la PWA).
// 2. Si el perfil que ha iniciado sesión tiene su propio miembro
//    vinculado (su propia cuenta, no la de otra persona) y ya activó el
//    consentimiento alguna vez, se comparte su ubicación sola, sin
//    tener que elegir "¿quién lleva este dispositivo?" cada vez que se
//    abre la app — petición real: "quiero que solo con abrir la
//    aplicación, que comparta donde estoy".
//
// Ojo: esto solo distingue bien a cada persona si cada una tiene SU
// PROPIA cuenta (member.linkedProfileId). Si dos personas comparten el
// mismo inicio de sesión, la app no puede saber cuál de las dos lleva
// el teléfono en la mano — para eso sigue estando el selector manual.
export function LocationSharingWatcher({ profileId }: { profileId: string }) {
  useEffect(() => {
    let cancelled = false

    resumeFromStorage()

    async function autoStartForOwnProfile() {
      try {
        const [members, consents] = await Promise.all([listFamilyMembers(), listConsents()])
        if (cancelled) return
        const myMember = members.find((m) => m.linkedProfileId === profileId)
        if (!myMember) return
        const consent = consents.find((c) => c.memberId === myMember.id)
        if (consent?.enabled) startSharing(myMember.id)
      } catch {
        // Un fallo puntual aquí no debe romper el resto de la app.
      }
    }
    autoStartForOwnProfile()

    return () => {
      cancelled = true
    }
  }, [profileId])

  return null
}
