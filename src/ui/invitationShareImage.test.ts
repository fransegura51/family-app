import { describe, expect, it } from 'vitest'

// Cola nocturna, Bloque 1 — InvitationModal.handleShare() intenta adjuntar también la imagen (PNG) de la
// invitación cuando existe un diseño propio (customCanvas), sin tocar nada de lo que ya funcionaba: el texto
// (buildShareText, con el enlace RSVP y el mapa) se sigue generando y usando igual, y si no hay diseño propio,
// o exportInvitationImage/canShareFiles/shareFiles fallan por lo que sea, cae exactamente al mismo plan de
// siempre (shareText → portapapeles → ShareFallbackModal manual).
const SRC = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/src/ui/EventosScreen.tsx'
]

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('InvitationModal.handleShare — adjunta la imagen solo cuando hay diseño propio (customCanvas)', () => {
  const fn = slice(SRC, 'async function handleShare() {\n    if (!rsvpUrl) return', '\n  async function handleRegenerate')

  it('reutiliza exportInvitationImage (services/invitationExport.ts) — no un segundo mecanismo de captura', () => {
    expect(SRC).toContain("import { exportInvitationImage } from '@/services/invitationExport'")
    expect(fn).toContain('if (customCanvas) {')
    expect(fn).toContain('exportInvitationImage({')
  })

  it('pasa exactamente el mismo customCanvas/customTemplateKey/photoUrls/customBackgroundUrl que ya usa la vista previa del modal (InvitationCanvasView)', () => {
    expect(fn).toContain('canvas: customCanvas')
    expect(fn).toContain('templateKey: customTemplateKey')
    expect(fn).toContain('photoUrls,')
    expect(fn).toContain('backgroundImageUrl: customBackgroundUrl')
  })

  it('comprueba canShareFiles antes de intentar compartir el archivo, nunca lo intenta a ciegas', () => {
    expect(fn).toContain('if (file && canShareFiles([file])) {')
    expect(fn).toContain('await shareFiles([file], { title: event.title, text })')
  })

  it('el texto compartido junto a la imagen es el mismo buildShareText() de siempre (RSVP + mapa), no un texto distinto para el caso con imagen', () => {
    expect(fn).toContain('const text = buildShareText()')
    expect(fn).toContain('await shareFiles([file], { title: event.title, text })')
  })
})

describe('InvitationModal.handleShare — sin diseño propio, o si la imagen falla, cae al plan de siempre (solo texto)', () => {
  const fn = slice(SRC, 'async function handleShare() {\n    if (!rsvpUrl) return', '\n  async function handleRegenerate')

  it('shareText(solo texto) sigue siendo el camino final si no hubo diseño, o si no se pudo compartir el archivo', () => {
    expect(fn).toContain('const shown = await shareText({ title: event.title, text })')
    expect(fn).toContain("setNotice(shown ? null : 'Copiado al portapapeles.')")
  })

  it('un fallo generando o compartiendo la imagen no impide seguir con shareText — no hay ningún throw entre exportInvitationImage y el shareText final', () => {
    // exportInvitationImage ya devuelve null en cualquier fallo interno (ver invitationExport.test.ts) — aquí
    // solo hace falta que, si no se entra al "return" de éxito con archivo, el código siga hacia shareText.
    const successReturn = fn.indexOf('return\n          }\n        }\n      }')
    expect(successReturn).toBeGreaterThan(-1)
    const afterSuccessReturn = fn.slice(successReturn)
    expect(afterSuccessReturn).toContain('const shown = await shareText(')
  })

  it('el catch exterior (fallo real de red/permiso, no de generación de imagen) sigue cayendo al ShareFallbackModal manual, sin cambios', () => {
    expect(fn).toContain('setManualShare({ title: event.title, text: buildShareText() })')
  })
})
