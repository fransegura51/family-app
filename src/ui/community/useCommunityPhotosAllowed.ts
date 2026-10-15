import { useCallback, useEffect, useState } from 'react'
import { getCommunityAccess } from '@/data/communityMinors'
import { forbidPhotos, loadPhotosAllowed, peekPhotosAllowed, subscribePhotosAllowed } from '@/ui/community/communityPhotosAllowedStore'
import { useCommunity } from '@/ui/community/CommunityProvider'

// ¿Puede esta persona adjuntar fotos? Las personas menores de edad participan SIN fotos (norma de protección de menores; la aplica el servidor).
//   const { photosAllowed, forbid } = useCommunityPhotosAllowed()
//   {photosAllowed !== false && <selector de fotos />}        // null = aún no se sabe: se enseña y, si no procede, el servidor responde PHOTOS_NOT_ALLOWED
//   catch (e) { if (communityErrorCode(e) === 'PHOTOS_NOT_ALLOWED') forbid() }
// `enabled` = false no consulta nada (p. ej. el campo de comentario aún plegado): solo se pregunta cuando se va a enseñar el selector. Ver la memoria en
// communityPhotosAllowedStore.ts (una consulta por persona y sesión).
export function useCommunityPhotosAllowed(enabled = true): { photosAllowed: boolean | null; forbid: () => void } {
  const { me } = useCommunity()
  // La clave es el id público de la persona (cambia si otra persona entra en el mismo dispositivo o si crea su alias). Sin saber quién es, no se consulta.
  const key = me ? (me.id ?? 'sin-perfil') : null
  const [value, setValue] = useState<boolean | null>(() => (key ? peekPhotosAllowed(key) : null))

  useEffect(() => {
    if (!key) return
    let cancelled = false
    const sync = () => {
      const known = peekPhotosAllowed(key)
      if (known !== null && !cancelled) setValue(known)
    }
    sync()
    const unsubscribe = subscribePhotosAllowed(sync)
    if (enabled) {
      void loadPhotosAllowed(key, getCommunityAccess).then((v) => {
        if (!cancelled) setValue(v)
      })
    }
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [key, enabled])

  const forbid = useCallback(() => {
    if (key) forbidPhotos(key)
  }, [key])

  return { photosAllowed: value, forbid }
}
