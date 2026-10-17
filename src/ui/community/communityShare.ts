// Compartir una publicación de Comunidad: enlace público estable + menú nativo del dispositivo (o copiar el enlace si no hay menú nativo).

// Construye el enlace. Si hay un dominio público configurado (VITE_COMMUNITY_PUBLIC_BASE, por ejemplo «https://pepafamilyapp.es/c», la dirección del Worker de páginas públicas) se comparte `${base}/p/<id>`;
// si no, el de la propia aplicación: `${origin}${BASE_URL}comunidad/p/<id>`. Se separa en una función pura para poder probarla.
export function buildShareUrl(opts: { origin: string; baseUrl: string; publicBase?: string | null; id: string }): string {
  const publicBase = opts.publicBase?.trim()
  if (publicBase) return `${publicBase.replace(/\/+$/, '')}/p/${opts.id}`
  const base = opts.baseUrl.endsWith('/') ? opts.baseUrl : `${opts.baseUrl}/`
  return `${opts.origin}${base}comunidad/p/${opts.id}`
}

// Enlace público estable de una publicación (el que se comparte en WhatsApp y redes).
export function getShareUrl(id: string): string {
  const env = import.meta.env as Record<string, string | undefined>
  return buildShareUrl({ origin: window.location.origin, baseUrl: import.meta.env.BASE_URL, publicBase: env.VITE_COMMUNITY_PUBLIC_BASE, id })
}

export type ShareResult = 'shared' | 'cancelled' | 'failed'

// Texto que se manda: el título y, debajo, el enlace. Se manda TODO como `text` (no `url` aparte): en Android, WhatsApp y otras apps pueden quedarse solo con el texto y perder el
// campo `url`, o el sistema rechazar la petición («NotAllowedError»), que es lo que pasaba. Con el enlace dentro del texto llega siempre.
export function buildShareText(title: string, url: string): string {
  const t = title.trim()
  return t ? `${t}\n${url}` : url
}

// Menú nativo del teléfono (navigator.share). «cancelled» = la persona cerró el menú (no es un error). «failed» = no hay menú nativo o el sistema lo ha denegado (visto
// real en Android: el navegador dice que puede compartir pero al intentarlo lo rechaza): quien llama debe abrir la ventana de respaldo (ShareFallbackModal: copiar,
// WhatsApp, email) con el mismo texto — igual que Contactos y Calendario —, nunca dejar a la persona sin forma de enviarlo.
export async function shareCommunityPost(id: string, title: string): Promise<ShareResult> {
  const text = buildShareText(title, getShareUrl(id))
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      // Cualquier otro fallo del menú nativo (NotAllowedError, etc.): ventana de respaldo.
    }
  }
  return 'failed'
}
