import { describe, expect, it } from 'vitest'

// Inciso Compras — Parte B: ojo 👁 discreto en la fila de la lista +
// controles de foto en "Añadir producto"/"Editar producto". La capa de
// datos y la RLS se prueban en src/data/productPhotoMigrationRLS.test.ts;
// aquí se comprueba el cableado de la UI.
const APP = import.meta.glob('/src/ui/ShoppingScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const SRC = APP['/src/ui/ShoppingScreen.tsx']

function window(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const ROW = window(SRC, 'function ShoppingItemRow', '\nfunction AddShoppingItemForm')

describe('ojo en la fila (TEST: producto sin foto → sin ojo, producto con foto → ojo visible)', () => {
  it('el botón 👁 solo se pinta cuando photoPath existe', () => {
    expect(ROW).toContain('{photoPath && (')
    expect(ROW).toContain('👁')
  })

  it('la fila mantiene su altura compacta: el ojo es un icon-button (mismo tamaño que el resto de iconos de fila), no una miniatura de imagen (TEST: fila mantiene altura compacta)', () => {
    const eyeButton = window(ROW, '{photoPath && (', '{/* Marcar/desmarcar comprado')
    expect(eyeButton).toContain('className="icon-button"')
    expect(eyeButton).not.toMatch(/<img/)
  })
})

describe('tap ojo → ver foto (TEST: tap ojo → abre la foto, cerrar)', () => {
  it("window.open(url, '_blank') abre en pestaña nueva — mismo patrón que tickets/documentos (handleViewTicket, DocumentsScreen), sin lightbox propio que mantener; cerrar es simplemente cerrar esa pestaña", () => {
    const body = window(ROW, 'async function handleViewPhoto', 'function handleSwipeStart')
    expect(body).toContain("window.open(url, '_blank')")
  })

  it('un fallo al cargar la foto se ignora en silencio: la fila y la lista siguen funcionando (TEST: error de carga no rompe fila)', () => {
    const body = window(ROW, 'async function handleViewPhoto', 'function handleSwipeStart')
    expect(body).toContain('catch {')
    expect(body).not.toContain('throw')
  })
})

const EDIT_FORM = window(SRC, 'function EditShoppingItemForm', '\n// ---------------------------------------------------------------------\n// Historial')

describe('Editar producto: ver/cambiar/quitar foto (TEST: cambiar foto, quitar foto)', () => {
  it('con foto: ofrece Ver foto, Cambiar foto y Quitar foto (con confirmación, mismo ConfirmButton que el resto de la app)', () => {
    const body = window(EDIT_FORM, 'photoPath ? (', ') : (')
    expect(body).toContain('👁 Ver foto')
    expect(body).toContain('Cambiar foto')
    expect(body).toContain('<ConfirmButton onConfirm={handleRemovePhoto} label="Quitar foto"')
  })

  it('sin foto: un único botón para añadirla, aclarando que puede ser cámara o galería', () => {
    const body = window(EDIT_FORM, ') : (', ')}\n        <input type="file"')
    expect(body).toContain('Añadir foto (hacer foto o elegir de la galería)')
  })

  it('el selector de archivo es un único input accept="image/*" sin el atributo capture (mismo patrón que el resto de la app, para no romper la galería en Android — ver FileOrPdfPicker.tsx)', () => {
    const body = window(EDIT_FORM, ') : (', 'style={{ display: \'none\' }} />')
    expect(body).toContain('accept="image/*"')
    expect(body).not.toContain('capture=')
  })

  it('quitar foto llama a removeProductPhoto con el productId y el photoPath reales, y limpia el estado en memoria (TEST: no quedan referencias inválidas)', () => {
    const body = window(EDIT_FORM, 'async function handleRemovePhoto', 'async function handleSubmit')
    expect(body).toContain('await removeProductPhoto(productId, photoPath)')
    expect(body).toContain('setPhotoPath(null)')
    expect(body).toContain('onPhotoChanged()')
  })

  it('añadir/cambiar foto también avisa a la lista (onPhotoChanged) sin esperar a "Guardar" — si se cierra el modal con ✕, la fila no debe quedarse con un ojo viejo', () => {
    const body = window(EDIT_FORM, 'async function handlePhotoSelected', 'async function handleRemovePhoto')
    expect(body).toContain('onPhotoChanged()')
  })

  it('añadir/cambiar foto usa uploadProductPhotoForName (crea el producto si hace falta, ver getOrCreateProductId) — nunca hace falta que el producto exista de antes (TEST: añadir foto a un producto nunca comprado)', () => {
    const body = window(EDIT_FORM, 'async function handlePhotoSelected', 'async function handleRemovePhoto')
    expect(body).toContain('await uploadProductPhotoForName(name, file)')
  })
})

describe('Añadir producto: foto opcional sin complicar el alta rápida', () => {
  const ADD_FORM = window(SRC, 'function AddShoppingItemForm', '\nfunction EditShoppingItemForm')

  it('un único enlace opcional, deshabilitado sin nombre todavía (no se puede fotografiar "nada")', () => {
    expect(ADD_FORM).toContain("disabled={photoBusy || !name.trim()}")
  })

  it('la mayoría de productos seguirán sin foto: no es un campo obligatorio ni bloquea el envío del formulario', () => {
    expect(ADD_FORM).not.toMatch(/required[^>]*photoInputRef|photoName[^}]*required/)
  })
})

describe('la foto vive en el producto, no en el item de la lista (TEST: familia/producto reutilizable)', () => {
  it('ProductSuggestion (el puente entre products y la lista) lleva productId y photoPath, alimentados desde listProducts()', () => {
    expect(SRC).toContain('productId: string')
    expect(SRC).toContain('photoPath: p.photoPath')
  })
})
