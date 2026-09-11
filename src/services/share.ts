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

// true = se abrió el menú de compartir del teléfono. false = no se ha
// podido compartir el ARCHIVO aquí — sin soporte, o el navegador dice
// que sí puede (canShare) pero share() falla al intentarlo de verdad —
// en cualquier caso, quien llama debe ofrecer su propia alternativa
// (texto simple, o abrir el archivo en una pestaña).
//
// Bug real reportado ("en Android no se puede compartir"): canShare()
// decía que sí podía compartir el .vcf/.ics, pero share() fallaba con
// "NotAllowedError: Permission denied" — probablemente porque el
// teléfono no tenía ninguna app capaz de abrir ese tipo de archivo
// concreto. Antes esto se relanzaba tal cual y rompía TODO el intento
// de compartir; ahora se trata igual que "no se puede" y cae al plan B
// de texto simple (que si funciona, ya no hace falta el archivo).
export async function shareFiles(files: File[], meta: { title?: string; text?: string } = {}): Promise<boolean> {
  if (!canShareFiles(files)) return false
  try {
    await navigator.share({ ...meta, files })
    return true
  } catch (err) {
    if (isUserCancelled(err)) return true
    return false
  }
}

// true = se abrió el menú de compartir. false = no hay Web Share API
// (típico en ordenador), o la hay pero share() también ha fallado al
// intentarlo — en ese caso se ha copiado el texto al portapapeles en
// su lugar (quien llama debe avisar "Copiado" cuando esto da false).
//
// Bug real reportado ("Contacto/Calendario sigue sin poderse
// compartir", en Android Y en ordenador): dos fallos distintos, cada
// uno rompía TODO el intento en vez de caer al siguiente plan B:
// 1) navigator.share(solo texto) puede fallar igual que con archivos
//    (visto real: "NotAllowedError: Permission denied" en Android) —
//    antes se relanzaba tal cual; ahora, si falla, se sigue probando
//    el portapapeles en su lugar, en vez de rendirse ahí mismo.
// 2) navigator.clipboard.writeText puede fallar de verdad también
//    ("Write permission denied" — pestaña sin foco/interacción
//    reciente, entre otros motivos) — antes eso dejaba reventar la
//    función con ese error técnico del navegador tal cual, en vez de
//    avisar algo que la familia pueda entender.
export async function shareText(meta: { title?: string; text: string }): Promise<boolean> {
  if (isShareSupported()) {
    try {
      await navigator.share(meta)
      return true
    } catch (err) {
      if (isUserCancelled(err)) return true
      // No relanza — sigue abajo e intenta el portapapeles en su lugar,
      // en vez de rendirse aquí.
    }
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(meta.text)
      return false
    }
  } catch {
    // Sigue al aviso de abajo — ni menú nativo ni portapapeles han
    // podido usarse aquí.
  }
  throw new Error('Este navegador no deja compartir ni copiar automáticamente aquí — pruébalo desde el móvil.')
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
