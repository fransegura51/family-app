import { describe, expect, it } from 'vitest'

// Cola nocturna, Bloque 1 — adjuntar la imagen (PNG) de la invitación al compartir. exportInvitationImage
// monta un <InvitationCanvasView> real fuera de la pantalla y usa html2canvas-pro para capturarlo — un
// efecto de navegador real (DOM, ResizeObserver, <canvas>), igual que el resto de services/*.ts de este
// proyecto (services/share.ts, services/exportFile.ts tampoco tienen jsdom/happy-dom instalado a propósito).
// Se comprueba aquí, de forma estructural, el mecanismo exacto: CORS-safe vía fetchAsShareableFile (nunca
// contra la URL remota de Storage directamente), montaje fuera de pantalla (nunca display:none), espera de
// imágenes/fuentes antes de capturar, import dinámico de la librería, limpieza, y que cualquier fallo
// devuelve null en vez de romper el flujo de compartir.
const SRC = (import.meta.glob('/src/services/invitationExport.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/src/services/invitationExport.ts'
]

describe('exportInvitationImage — reutiliza InvitationCanvasView (WYSIWYG), nunca un segundo renderer', () => {
  it('importa y monta el mismo componente de solo lectura que ya se usa en el modal de envío', () => {
    expect(SRC).toContain("import { InvitationCanvasView } from '@/ui/InvitationDesigner'")
    expect(SRC).toContain('createElement(InvitationCanvasView,')
  })
})

describe('exportInvitationImage — imágenes remotas resueltas vía fetchAsShareableFile (CORS-safe), nunca contra la URL de Storage directamente', () => {
  it('reutiliza fetchAsShareableFile (services/share.ts) en vez de duplicar la descarga', () => {
    expect(SRC).toContain("import { fetchAsShareableFile } from '@/services/share'")
    expect(SRC).toContain('fetchAsShareableFile(url, filename,')
  })

  it('si la descarga falla, sigue con la URL original en vez de perder la imagen (el fallo real se detecta después, al capturar)', () => {
    const fn = SRC.slice(SRC.indexOf('async function resolveAsBlobUrl'), SRC.indexOf('function waitForImages'))
    expect(fn).toContain('catch {')
    expect(fn).toContain('return url')
  })

  it('limpia los object URL creados (blob:) al terminar, sin tocar las URLs remotas originales que no creó', () => {
    expect(SRC).toContain("url.startsWith('blob:')")
    expect(SRC).toContain('blobUrls.forEach((u) => URL.revokeObjectURL(u))')
  })
})

describe('exportInvitationImage — montaje fuera de pantalla, nunca display:none (así el layout se calcula igual que si se viera)', () => {
  const fn = SRC.slice(SRC.indexOf('export async function exportInvitationImage'), SRC.length)

  it('usa position:fixed + left fuera del viewport, no display:none', () => {
    expect(fn).toContain("host.style.position = 'fixed'")
    expect(fn).toContain("host.style.left = '-99999px'")
    expect(fn).not.toContain("display = 'none'")
  })

  it('el ancho del contenedor es una resolución de exportación fija e independiente del tamaño lógico del editor (EXPORT_WIDTH_PX), no el ancho de ningún modal real', () => {
    expect(SRC).toContain('const EXPORT_WIDTH_PX = 1080')
    expect(fn).toContain('host.style.width = `${EXPORT_WIDTH_PX}px`')
  })
})

describe('exportInvitationImage — espera contenido real antes de capturar', () => {
  const fn = SRC.slice(SRC.indexOf('export async function exportInvitationImage'), SRC.length)

  it('espera a que todas las <img> del montaje hayan cargado (o fallado) antes de capturar', () => {
    expect(fn).toContain('await waitForImages(host)')
  })

  it('espera document.fonts.ready — el texto de la invitación no debe capturarse con la tipografía de sistema por defecto', () => {
    expect(fn).toContain('await document.fonts.ready')
  })
})

describe('exportInvitationImage — captura con html2canvas-pro (import dinámico, fuera del bundle principal) y produce un File PNG', () => {
  const fn = SRC.slice(SRC.indexOf('export async function exportInvitationImage'), SRC.length)

  it("importa html2canvas-pro dinámicamente, no con un import estático de arriba del archivo", () => {
    expect(fn).toContain("await import('html2canvas-pro')")
    expect(SRC.slice(0, SRC.indexOf('export async function exportInvitationImage'))).not.toContain("from 'html2canvas-pro'")
  })

  it('genera un PNG (toBlob) y lo envuelve en un File con nombre invitacion-<slug>.png', () => {
    expect(fn).toContain("rendered.toBlob((b) => resolve(b), 'image/png')")
    expect(fn).toContain("new File([blob], `invitacion-${slugify(eventTitle)}.png`, { type: 'image/png' })")
    expect(SRC).toContain("import { slugify } from '@/domain/guestExport'")
  })
})

describe('exportInvitationImage — cualquier fallo devuelve null (nunca lanza), y siempre limpia (root/host/URLs) pase lo que pase', () => {
  const fn = SRC.slice(SRC.indexOf('export async function exportInvitationImage'), SRC.length)

  it('todo el cuerpo va en un try/catch que devuelve null en el catch', () => {
    expect(fn).toMatch(/try \{[\s\S]*\} catch \{\s*return null\s*\}/)
  })

  it('la limpieza (unmount, remove del host, revoke de los blob URL) vive en un finally — se ejecuta tanto si todo va bien como si falla', () => {
    const finallyBlock = fn.slice(fn.indexOf('} finally {'))
    expect(finallyBlock).toContain('root?.unmount()')
    expect(finallyBlock).toContain('host?.remove()')
    expect(finallyBlock).toContain('blobUrls.forEach((u) => URL.revokeObjectURL(u))')
  })
})
