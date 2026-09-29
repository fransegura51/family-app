// Cola nocturna, Bloque 1 — adjuntar la imagen (PNG) de la invitación al compartirla, además del texto que
// ya se compartía. Reutiliza la MISMA vista de solo lectura que ya pinta la invitación en pantalla
// (InvitationCanvasView, ui/InvitationDesigner.tsx) montada fuera de la pantalla a una resolución alta — así
// el PNG es, por construcción, exactamente lo mismo que ve la familia en el modal de envío (WYSIWYG), sin un
// segundo "renderer" que pueda desincronizarse del editor con el tiempo.
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { InvitationCanvas } from '@/domain/types'
import { slugify } from '@/domain/guestExport'
import { fetchAsShareableFile } from '@/services/share'
import { InvitationCanvasView } from '@/ui/InvitationDesigner'

// Independiente del tamaño LÓGICO del lienzo (ASSUMED_CANVAS_SIZE_PX=380, ver InvitationDesigner.tsx) — ese
// es solo la unidad en la que se calculan saltos de línea/posiciones; esto es la resolución de salida del
// PNG, para que no se vea pixelado al abrirlo a tamaño real en el móvil de quien lo recibe.
const EXPORT_WIDTH_PX = 1080

// Descarga cada imagen remota (Supabase Storage, URL firmada) como blob ANTES de capturar, en vez de dejar
// que html2canvas-pro cargue la URL remota directamente (useCORS/allowTaint contra Storage no es fiable) —
// mismo patrón ya usado para compartir archivos (fetchAsShareableFile, services/share.ts). Si la descarga
// falla (red), se sigue intentando con la URL original tal cual — mejor un intento con riesgo de "tainted
// canvas" (se captaría como fallo más abajo y cae al texto-solo) que perder la imagen sin más.
async function resolveAsBlobUrl(url: string | null | undefined, filename: string): Promise<string | null> {
  if (!url) return null
  try {
    const file = await fetchAsShareableFile(url, filename, 'image/jpeg')
    return URL.createObjectURL(file)
  } catch {
    return url
  }
}

function waitForImages(container: HTMLElement): Promise<void> {
  const imgs = Array.from(container.querySelectorAll('img'))
  return Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve()
            return
          }
          img.addEventListener('load', () => resolve(), { once: true })
          img.addEventListener('error', () => resolve(), { once: true })
        }),
    ),
  ).then(() => undefined)
}

export interface ExportInvitationImageInput {
  canvas: InvitationCanvas
  templateKey: string | null
  photoUrls: Record<string, string>
  backgroundImageUrl?: string | null
  eventTitle: string
}

// Devuelve null en cualquier fallo (imagen ilocalizable, librería de captura no disponible, canvas
// "tainted"...) — quien llama debe caer entonces al plan de siempre (compartir solo texto), nunca romper el
// flujo de compartir por no poder generar la imagen.
export async function exportInvitationImage({ canvas, templateKey, photoUrls, backgroundImageUrl, eventTitle }: ExportInvitationImageInput): Promise<File | null> {
  const blobUrls: string[] = []
  let host: HTMLDivElement | null = null
  let root: ReturnType<typeof createRoot> | null = null
  try {
    const [resolvedBackground, resolvedPhotoEntries] = await Promise.all([
      resolveAsBlobUrl(backgroundImageUrl, 'fondo.jpg'),
      Promise.all(Object.entries(photoUrls).map(async ([path, url]) => [path, await resolveAsBlobUrl(url, 'foto.jpg')] as const)),
    ])
    if (resolvedBackground?.startsWith('blob:')) blobUrls.push(resolvedBackground)
    const resolvedPhotoUrls: Record<string, string> = {}
    for (const [path, url] of resolvedPhotoEntries) {
      if (!url) continue
      resolvedPhotoUrls[path] = url
      if (url.startsWith('blob:')) blobUrls.push(url)
    }

    host = document.createElement('div')
    // Fuera de la pantalla (nunca display:none — así el layout/medidas se calculan igual que si se viera) y a
    // un ancho fijo en px: por eso InvitationCanvasView escala igual que en cualquier contenedor real, solo
    // que aquí ese contenedor mide EXPORT_WIDTH_PX en vez del ancho del modal.
    host.style.position = 'fixed'
    host.style.top = '0'
    host.style.left = '-99999px'
    host.style.width = `${EXPORT_WIDTH_PX}px`
    document.body.appendChild(host)
    root = createRoot(host)
    root.render(createElement(InvitationCanvasView, { canvas, templateKey, photoUrls: resolvedPhotoUrls, backgroundImageUrl: resolvedBackground }))

    await waitForImages(host)
    if (document.fonts?.ready) await document.fonts.ready

    // Import dinámico — mantiene la librería (y sus dependencias de segmentación de texto) fuera del bundle
    // principal; solo se descarga cuando de verdad se comparte una invitación con imagen.
    const { default: html2canvas } = await import('html2canvas-pro')
    const rendered = await html2canvas(host, { backgroundColor: null, useCORS: true })
    const blob = await new Promise<Blob | null>((resolve) => rendered.toBlob((b) => resolve(b), 'image/png'))
    if (!blob) return null
    return new File([blob], `invitacion-${slugify(eventTitle)}.png`, { type: 'image/png' })
  } catch {
    return null
  } finally {
    root?.unmount()
    host?.remove()
    blobUrls.forEach((u) => URL.revokeObjectURL(u))
  }
}
