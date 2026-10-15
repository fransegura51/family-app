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

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed'

// Menú nativo (navigator.share) y, si no existe, copiar el enlace. «cancelled» = la persona cerró el menú (no es un error).
export async function shareCommunityPost(id: string, title: string): Promise<ShareResult> {
  const url = getShareUrl(id)
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, url })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      // Cualquier otro fallo del menú nativo: se intenta copiar.
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    return 'copied'
  } catch {
    return 'failed'
  }
}
