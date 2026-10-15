import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { announceNotificationsChanged, markCommunityDigestsRead, markNotificationsRead } from '@/data/notifications'
import { NOTIFICATION_PARAM, notificationIdFromSearch, searchWithoutParams } from '@/domain/notificationDeepLink'

// Ruta de Novedades de Comunidad (communityNav.ts: COMMUNITY_BASE + '/novedades').
const COMMUNITY_NEWS_PATH = '/comunidad/novedades'

// Componente sin pantalla: «abrir un aviso lo marca como leído» también cuando se abre desde la notificación del móvil (INC-06).
//  · Al tocar un aviso del sistema, la dirección de entrada trae «?aviso=<id del aviso de la campana>» (service worker o app nativa, ver pushEntryRoute.ts).
//    Aquí, UNA sola vez y con la sesión ya abierta (este componente solo se monta dentro de la app con sesión), se valida el id como uuid, se marca ese aviso
//    como leído (la base solo deja marcar los avisos propios) y se quita el parámetro de la dirección SIN recargar y sin tocar el resto (evento, fecha, nuevos, c…).
//  · Abrir Novedades de Comunidad desde el menú marca como leídos los avisos agrupados de Comunidad: es lo que la regla «1 hora si abrió / 2 horas si no» llama abrir.
// Coste: ninguna consulta periódica; una escritura por cada aviso abierto desde el sistema y una por cada visita a Novedades.
export function NotificationOpenMarker() {
  const location = useLocation()
  const navigate = useNavigate()
  const handled = useRef<Set<string>>(new Set())

  useEffect(() => {
    const id = notificationIdFromSearch(location.search)
    if (!id || handled.current.has(id)) return
    handled.current.add(id)
    markNotificationsRead([id]).then(
      () => announceNotificationsChanged(),
      () => undefined, // sin red o sin ese aviso (ya borrado): no pasa nada, el aviso del sistema ya cumplió su función
    )
    // Se lee la dirección ACTUAL (no la del render): otra pieza (p. ej. Calendario con ?evento=…) puede haber cambiado la query entre medias.
    navigate({ pathname: location.pathname, search: searchWithoutParams(window.location.search, [NOTIFICATION_PARAM]), hash: location.hash }, { replace: true })
  }, [location.search, location.pathname, location.hash, navigate])

  // Una vez por visita a Novedades (al entrar en la ruta), no en cada render.
  const wasOnNews = useRef(false)
  useEffect(() => {
    const onNews = location.pathname === COMMUNITY_NEWS_PATH
    if (onNews && !wasOnNews.current) {
      markCommunityDigestsRead().then(
        () => announceNotificationsChanged(),
        () => undefined,
      )
    }
    wasOnNews.current = onNews
  }, [location.pathname])

  return null
}
