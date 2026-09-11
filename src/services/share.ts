// Botón nativo de "Compartir" (Web Share API) — abre el menú del propio
// teléfono (WhatsApp, Telegram, Mail, AirDrop, Bluetooth, guardar…) en
// vez de construir un chat propio dentro de la app. Petición real
// explícita: "no a WhatsApp en particular sino el típico botón de
// compartir que se le abra el menú del teléfono para compartir por
// donde quiera". Solo Chrome/Edge/Safari en móvil (y cada vez más
// escritorios) lo soportan — donde no exista se hace algo razonable en
// su lugar en cada pantalla que lo usa, nunca un botón que no hace nada.

export function isShareSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

export function canShareFiles(files: File[]): boolean {
  return (
    isShareSupported() &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files })
  )
}

// AbortError: la persona ha cerrado el menú de compartir sin elegir
// nada — no es un fallo de la app, no hay que enseñar ningún error por
// eso (bug real esperable si no se distingue).
function isUserCancelled(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

// true = se abrió el menú de compartir del teléfono. false = el
// navegador no soporta compartir archivos (quien llama debe ofrecer su
// propia alternativa: abrir el archivo en una pestaña, por ejemplo).
export async function shareFiles(files: File[], meta: { title?: string; text?: string } = {}): Promise<boolean> {
  if (!canShareFiles(files)) return false
  try {
    await navigator.share({ ...meta, files })
    return true
  } catch (err) {
    if (isUserCancelled(err)) return true
    throw err
  }
}

// true = se abrió el menú de compartir. false = no hay Web Share API
// (típico en ordenador) y en su lugar se ha copiado el texto al
// portapapeles — quien llama debe avisar "Copiado" en ese caso.
export async function shareText(meta: { title?: string; text: string }): Promise<boolean> {
  if (isShareSupported()) {
    try {
      await navigator.share(meta)
      return true
    } catch (err) {
      if (isUserCancelled(err)) return true
      throw err
    }
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(meta.text)
  }
  return false
}

// Descarga una foto/documento/ticket ya guardado (URL firmada de
// Storage) como File, para poder pasarlo a shareFiles — el navegador no
// puede compartir una URL privada de Supabase directamente (caducaría y
// exige la sesión), así que se manda el archivo en sí.
export async function fetchAsShareableFile(url: string, filename: string, fallbackType: string): Promise<File> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('No se pudo descargar el archivo para compartirlo')
  const blob = await res.blob()
  return new File([blob], filename, { type: blob.type || fallbackType })
}
