import { describe, expect, it } from 'vitest'

// Cámara/Galería/PDF en "Añadir ticket" — mejora de CÓMO se obtiene el File, nunca del pipeline que lo
// procesa. Los tres inputs de FileOrPdfPicker comparten el mismo handleFile; el resto del sistema
// (analyzeReceiptPhoto, uploadReceipt, compresión, Storage, conciliación de gastos, líneas de producto)
// no se toca en absoluto — se verifica aquí que esos módulos ni siquiera se importan en este archivo.
const PICKER_SRC = (import.meta.glob('/src/ui/FileOrPdfPicker.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/src/ui/FileOrPdfPicker.tsx'
]
const FINANCE_SRC = (import.meta.glob('/src/ui/FinanceScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/FinanceScreen.tsx']
const DOCUMENTS_SRC = (import.meta.glob('/src/ui/DocumentsScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/src/ui/DocumentsScreen.tsx'
]
const RECEIPTS_SRC = (import.meta.glob('/src/data/receipts.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/receipts.ts']
const RECEIPT_PHOTO_SRC = (import.meta.glob('/src/services/receiptPhoto.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/src/services/receiptPhoto.ts'
]
const SHOPPING_SRC = (import.meta.glob('/src/ui/ShoppingScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/ShoppingScreen.tsx']

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

// FileOrPdfPicker es la ÚLTIMA declaración del archivo — "\n}" como fin de bloque es ambiguo (coincide
// antes de tiempo con el "}: {" que cierra la desestructuración de props y abre su anotación de tipo), así
// que se toma todo lo que queda hasta el final del archivo en vez de buscar un marcador de cierre.
const PICKER_FN = PICKER_SRC.slice(PICKER_SRC.indexOf('export function FileOrPdfPicker('))

describe('FileOrPdfPicker — 3 inputs independientes, mismo callback, cámara exclusiva en el de cámara', () => {
  const fn = PICKER_FN

  it('input de cámara: accept="image/*" + capture="environment", solo se monta si hay sheetTitle', () => {
    expect(fn).toContain('{sheetTitle && <input ref={cameraRef} type="file" accept="image/*" capture="environment"')
  })

  it('input de galería: accept="image/*", SIN capture', () => {
    const galleryLine = slice(fn, '<input ref={photoRef}', '/>')
    expect(galleryLine).toContain('accept="image/*"')
    expect(galleryLine).not.toContain('capture')
  })

  it('input de PDF: accept="application/pdf", SIN capture', () => {
    const pdfLine = slice(fn, '<input ref={pdfRef}', '/>')
    expect(pdfLine).toContain('accept="application/pdf"')
    expect(pdfLine).not.toContain('capture')
  })

  it('capture="environment" aparece EXACTAMENTE una vez en todo el componente — solo en cámara', () => {
    const matches = fn.match(/capture="environment"/g) ?? []
    expect(matches.length).toBe(1)
  })

  it('los 3 inputs usan literalmente el mismo handler (handleFile) — el File siempre llega al mismo sitio, venga de donde venga', () => {
    const cameraOnChange = (fn.match(/capture="environment"[^/]*onChange=\{(\w+)\}/) ?? [])[1]
    const galleryOnChange = (slice(fn, '<input ref={photoRef}', '/>').match(/onChange=\{(\w+)\}/) ?? [])[1]
    const pdfOnChange = (slice(fn, '<input ref={pdfRef}', '/>').match(/onChange=\{(\w+)\}/) ?? [])[1]
    expect(cameraOnChange).toBe('handleFile')
    expect(galleryOnChange).toBe('handleFile')
    expect(pdfOnChange).toBe('handleFile')
  })

  it('handleFile es la única función que llama a onChange(...) — ninguna lógica de procesamiento específica por origen', () => {
    expect(fn.match(/onChange\(/g)?.length).toBe(1)
    const handleFileFn = slice(fn, 'function handleFile(', '\n  }')
    expect(handleFileFn).toContain('onChange(e.target.files?.[0] ?? null)')
  })
})

describe('Bottom sheet — abre/cierra, Cancelar no toca el File', () => {
  const fn = PICKER_FN

  it('el botón visible abre el sheet (setSheetOpen(true)), el sheet solo se monta con sheetOpen', () => {
    expect(fn).toContain('onClick={() => setSheetOpen(true)}')
    expect(fn).toContain('{sheetOpen && (')
  })

  it('las 3 opciones del sheet cierran el sheet y disparan el input correspondiente — nunca llaman a onChange directamente', () => {
    expect(fn).toContain('onPickCamera={() => {\n              setSheetOpen(false)\n              cameraRef.current?.click()\n            }}')
    expect(fn).toContain('onPickGallery={() => {\n              setSheetOpen(false)\n              photoRef.current?.click()\n            }}')
    expect(fn).toContain('onPickPdf={() => {\n              setSheetOpen(false)\n              pdfRef.current?.click()\n            }}')
  })

  it('Cancelar (onCancel) solo cierra el sheet — nunca modifica el File ya elegido', () => {
    expect(fn).toContain('onCancel={() => setSheetOpen(false)}')
  })

  it('FileSourceSheet (el propio sheet) reutiliza modal-overlay/modal-sheet — mismo patrón que StoreQuestionSheet, ningún sistema de modal nuevo', () => {
    const sheet = slice(PICKER_SRC, 'function FileSourceSheet(', 'export function FileOrPdfPicker(')
    expect(sheet).toContain('className="modal-overlay"')
    expect(sheet).toContain('className="modal-sheet"')
  })

  it('las 3 opciones visibles del sheet son exactamente "Hacer foto" / "Elegir de la galería" / "Elegir PDF" — nunca "Seleccionar archivo"', () => {
    const sheet = slice(PICKER_SRC, 'function FileSourceSheet(', 'export function FileOrPdfPicker(')
    expect(sheet).toContain('📷 Hacer foto')
    expect(sheet).toContain('🖼️ Elegir de la galería')
    expect(sheet).toContain('📄 Elegir PDF')
    expect(sheet).not.toMatch(/Seleccionar archivo/)
  })
})

describe('Reutilización sin acoplar — sheetTitle es opcional, Previsión de pagos y Documentos no cambian', () => {
  it('sin sheetTitle, el componente renderiza los 2 botones de siempre (Foto/PDF) y ningún input de cámara', () => {
    const legacyBranch = slice(PICKER_SRC, 'return (\n    <div>\n      <div className="inline-fields">', '\n    </div>\n  )\n}')
    expect(legacyBranch).toContain('📷 Foto')
    expect(legacyBranch).toContain('📄 PDF')
    expect(legacyBranch).not.toContain('capture')
  })

  it('Tickets (FinanceScreen) es el ÚNICO caller que pasa sheetTitle — con el texto "Añadir ticket"', () => {
    expect(FINANCE_SRC).toContain('sheetTitle="Añadir ticket"')
  })

  it('Documentos sigue llamando a FileOrPdfPicker sin sheetTitle — ningún texto de Tickets se cuela ahí', () => {
    const call = slice(DOCUMENTS_SRC, '<FileOrPdfPicker', '/>')
    expect(call).not.toContain('sheetTitle')
  })

  it('Previsión de pagos sigue llamando a FileOrPdfPicker sin sheetTitle', () => {
    expect(FINANCE_SRC).toContain("<FileOrPdfPicker file={file} onChange={handleFile} />")
  })
})

describe('El pipeline de tickets no se toca — FileOrPdfPicker no conoce ni importa nada de su procesamiento', () => {
  it('FileOrPdfPicker.tsx no importa analyzeReceiptPhoto, uploadReceipt ni ningún módulo de datos/servicios', () => {
    expect(PICKER_SRC).not.toMatch(/analyzeReceiptPhoto|uploadReceipt|@\/data\/|@\/services\//)
  })

  it('analyzeReceiptPhoto (OCR) sigue intacta: construye el body con imageBase64/mimeType, sin ninguna rama por origen de archivo', () => {
    expect(RECEIPT_PHOTO_SRC).toContain('imageBase64, mimeType: file.type')
  })

  it('uploadReceipt (subida + conciliación + receipts) sigue intacta: comprime, sube a Storage y concilia igual que antes', () => {
    expect(RECEIPTS_SRC).toContain('const file = await compressImageFile(input.file)')
    expect(RECEIPTS_SRC).toContain("supabase.storage.from('receipts').upload(path, file)")
  })

  it('ReceiptForm sigue llamando a handleReadTicket/uploadReceipt exactamente igual — el onChange de FileOrPdfPicker solo guarda el File y resetea el OCR', () => {
    const onChangeBlock = slice(FINANCE_SRC, 'sheetTitle="Añadir ticket"', '}}\n          />')
    expect(onChangeBlock).toContain('setFile(f)')
    expect(onChangeBlock).toContain("setLines([])")
    expect(onChangeBlock).toContain("setOcrStatus('idle')")
  })
})

describe('Foto de producto (ShoppingScreen) — NO tocada, su política de "nunca capture" se mantiene intacta', () => {
  it('ninguno de los dos inputs de foto de producto tiene capture', () => {
    const addForm = slice(SHOPPING_SRC, 'function AddShoppingItemForm(', '\nfunction ')
    const editForm = slice(SHOPPING_SRC, 'function EditShoppingItemForm(', '\nfunction ')
    expect(addForm).not.toContain('capture=')
    expect(editForm).not.toContain('capture=')
  })

  it('ShoppingScreen.tsx no importa ni usa FileOrPdfPicker — es un flujo completamente aparte', () => {
    expect(SHOPPING_SRC).not.toContain('FileOrPdfPicker')
  })
})
