import { describe, expect, it } from 'vitest'

// Importador del menú (2.ª tanda, auditoría): PDF, cancelar sin datos parciales, original conservado y accesible.
const src = (path: string) => (import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[`/${path}`]
const EVENTS = src('src/data/events.ts')
const IMPORTER = src('src/ui/EventMenuImporter.tsx')
const MENU = src('src/ui/EventMenu.tsx')
const ORIGINALS = src('src/ui/EventMenuOriginals.tsx')
const MIG_0192 = (import.meta.glob('/supabase/migrations/0192_event_food_and_drink.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/supabase/migrations/0192_event_food_and_drink.sql']

// Funciones de nivel superior terminan en "\n}"; las anidadas (dentro del componente), en el siguiente método hermano.
function body(source: string, signature: string): string {
  const start = source.indexOf(signature)
  const top = source.indexOf('\n}', start)
  const lineStart = source.lastIndexOf('\n', start) + 1
  const nested = source.slice(lineStart, start).startsWith('  ')
  if (!nested) return source.slice(start, top + 2)
  const sibling = source.slice(start + 1).search(/\n {2}(async )?function /)
  const end = sibling === -1 ? top : Math.min(top === -1 ? Infinity : top, start + 1 + sibling)
  return source.slice(start, end)
}

describe('importador — PDF', () => {
  it('solo las imágenes se comprimen; un PDF se guarda tal cual con su tipo MIME', () => {
    const fn = body(EVENTS, 'export async function saveEventFoodDocument(')
    expect(fn).toContain("file.type.startsWith('image/') ? await compressImageFile(file) : file")
    expect(fn).toContain("mime_type: prepared.type || file.type || null")
  })

  it('la extensión de un PDF se conserva (o se deduce como pdf)', () => {
    const fn = body(EVENTS, 'export async function saveEventFoodDocument(')
    expect(fn).toContain("prepared.type === 'application/pdf' ? 'pdf' : 'jpg'")
  })

  it('el análisis de un PDF solo propone: no guarda nada', () => {
    const handle = body(IMPORTER, 'async function handleFile(')
    expect(handle).toContain('analyzeEventFoodDocument')
    expect(handle).not.toContain('saveEventFoodDocument')
    expect(handle).not.toContain('importEventMenuItems')
  })
})

describe('importador — cancelar o descartar antes de confirmar no guarda nada', () => {
  it('el botón de cancelar solo llama a onCancel (sin escrituras)', () => {
    expect(IMPORTER).toContain('onClick={onCancel}')
    expect(IMPORTER).toMatch(/onCancel: \(\) => void/)
  })

  it('confirm es el único camino que guarda: primero el documento, después los platos', () => {
    const fn = body(IMPORTER, 'async function confirm()')
    const saveAt = fn.indexOf('await saveEventFoodDocument(')
    const importAt = fn.indexOf('await importEventMenuItems(')
    expect(saveAt).toBeGreaterThan(-1)
    expect(importAt).toBeGreaterThan(saveAt)
  })

  it('si fallan los platos después de subir el original, el documento de ESE intento se descarta', () => {
    const fn = body(IMPORTER, 'async function confirm()')
    expect(fn).toContain('await discardEventFoodDocument(doc).catch(() => undefined)')
    expect(fn).toContain('throw importErr')
  })

  it('descartar el documento borra la fila y el archivo solo de ese intento', () => {
    const fn = body(EVENTS, 'export async function discardEventFoodDocument(')
    expect(fn).toContain("from('event_food_documents').delete().eq('id', doc.id)")
    expect(fn).toContain("storage.from('event_food_documents').remove([doc.storagePath])")
  })
})

describe('original conservado y accesible desde Menú del evento', () => {
  it('el original se guarda en el bucket privado y la fila lo enlaza con los platos (document_id)', () => {
    expect(MIG_0192).toContain('document_id')
    expect(MIG_0192).toMatch(/document_id[^\n]*references event_food_documents[^\n]*on delete set null/)
  })

  it('Menú del evento muestra los documentos originales', () => {
    expect(MENU).toContain('<EventMenuOriginals eventId={event.id} />')
  })

  it('el acceso usa una URL firmada temporal del bucket, no una ruta pública', () => {
    const fn = body(EVENTS, 'export async function getEventFoodDocumentUrl(')
    expect(fn).toContain('createSignedUrl(storagePath, 3600)')
  })

  it('el componente lista y abre; nunca sube ni importa — solo puede descartar un documento pendiente, y solo a petición explícita del usuario (bloque C)', () => {
    expect(ORIGINALS).toContain('listEventFoodDocuments(eventId)')
    expect(ORIGINALS).toContain('getEventFoodDocumentUrl(doc.storagePath)')
    expect(ORIGINALS).not.toMatch(/saveEventFoodDocument|importEventMenuItems/)
    // discardEventFoodDocument solo se llama tras window.confirm, nunca automático ni por tiempo.
    expect(ORIGINALS).toContain('window.confirm(')
    const discardFn = ORIGINALS.slice(ORIGINALS.indexOf('async function discardPending'), ORIGINALS.indexOf('async function discardPending') + 400)
    expect(discardFn).toContain('window.confirm(')
    expect(discardFn).toContain('discardEventFoodDocument(doc)')
  })
})
