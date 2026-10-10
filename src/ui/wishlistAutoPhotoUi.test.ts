import { describe, expect, it } from 'vitest'

// Lista de deseos, Parte C del prompt — "la recuperación debe iniciarse automáticamente, sin obligar a
// pulsar un botón adicional" y "si la imagen no se puede obtener, el formulario debe seguir funcionando".
const UI = (import.meta.glob('/src/ui/WishlistScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/WishlistScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const MODAL = UI.slice(UI.indexOf('function AddWishlistItemModal('))

describe('AddWishlistItemModal — detección automática al pegar el enlace, sin botón aparte', () => {
  it('se dispara sola con un debounce al cambiar el enlace, no con cada tecla suelta', () => {
    expect(MODAL).toContain('if (!looksLikeProductUrl(trimmed) || trimmed === detectedFor) return')
    expect(MODAL).toContain('setTimeout(() => {')
    expect(MODAL).toContain('}, 700)')
  })
  it('mientras haya una foto subida a mano, nunca se intenta detectar (la manual manda)', () => {
    expect(MODAL).toContain('if (photoFile) return')
  })
  it('subir una foto a mano después de haber detectado una limpia la detectada, nunca se mezclan', () => {
    const fileInputBlock = window_(MODAL, 'Fotografía {detectedPath', '</label>')
    expect(fileInputBlock).toContain('setDetectedPath(null)')
    expect(fileInputBlock).toContain('setDetectedPreviewUrl(null)')
  })
  it('se puede quitar la foto detectada sin reemplazarla por nada (guardar sin foto sigue siendo posible)', () => {
    expect(MODAL).toContain('✕ Quitar')
  })
  it('un fallo o "no encontrada" nunca bloquea el resto del formulario — solo se ve un aviso informativo', () => {
    expect(MODAL).toContain('No se encontró ninguna foto en ese enlace')
  })
})

describe('AddWishlistItemModal — al guardar, usa la foto detectada solo si no hay una manual', () => {
  it('prioridad: manual (saveWishlistItemPhoto) primero, detectada (attachWishlistItemDetectedPhoto) después', () => {
    const submitFn = window_(MODAL, 'async function handleSubmit(', '\n  }\n\n  return (')
    const manualIdx = submitFn.indexOf('saveWishlistItemPhoto(')
    const detectedIdx = submitFn.indexOf('attachWishlistItemDetectedPhoto(')
    expect(manualIdx).toBeGreaterThan(-1)
    expect(detectedIdx).toBeGreaterThan(-1)
    expect(manualIdx).toBeLessThan(detectedIdx)
    expect(submitFn).toContain('} else if (detectedPath) {')
  })
})
