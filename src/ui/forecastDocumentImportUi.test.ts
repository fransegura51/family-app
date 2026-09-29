import { describe, expect, it } from 'vitest'

// "Importar desde foto o documento" (Previsión de pagos) — mismo espíritu que "Subir ticket" en Compras:
// DOCUMENTO → EXTRACCIÓN (IA) → PROPUESTA → REVISIÓN → CONFIRMACIÓN → PREVISIÓN, reutilizando el mismo
// formulario/revisión que ya usa la detección de patrones bancarios (ForecastPaymentPrefill,
// ForecastPaymentForm) — nunca una pantalla nueva, nunca una segunda definición de "propuesta editable".
// No hay jsdom en este proyecto — se comprueba de forma estructural, leyendo el código fuente real, que
// las reglas pedidas quedan cableadas tal cual (mismo patrón que forecastUiWiring.test.ts).
const SRC = (import.meta.glob('/src/ui/FinanceScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/FinanceScreen.tsx']

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('PrevisionPagosTab — punto de entrada "📄 Importar desde foto o documento"', () => {
  it('el botón existe junto a "+ Añadir pago" (mismo patrón que Tickets: no sustituye la creación manual, la complementa)', () => {
    expect(SRC).toContain('📄 Importar desde foto o documento')
    expect(SRC).toContain('setShowDocumentImport(true)')
  })

  it('la lista vacía también ofrece el atajo, para quien nunca ha añadido un pago previsto', () => {
    expect(SRC).toContain('📄 O importar desde foto o documento')
  })

  it('el modal reutiliza recurrencePrefill/showAddForm (el mismo canal que ya usa "Revisar" de una propuesta bancaria) — nunca un segundo formulario', () => {
    const fn = slice(SRC, 'onPrefillReady={(prefill) => {', '\n          }}')
    expect(fn).toContain('setRecurrencePrefill(prefill)')
    expect(fn).toContain('setShowAddForm(true)')
  })
})

describe('ForecastDocumentImportModal — orden de las comprobaciones (capa A antes de gastar IA, capa B antes de proponer)', () => {
  const fn = slice(SRC, 'async function handleFile(picked: File | null) {', '\n  function reset()')

  it('CAPA A: calcula el hash y comprueba duplicado ANTES de llamar a analyzeForecastDocument (nunca gasta una llamada de IA en un archivo ya subido)', () => {
    expect(fn).toContain('sha256HexOfFile(picked)')
    expect(fn).toContain('findForecastPaymentBySourceHash(sourceFileHash)')
    expect(fn.indexOf('findForecastPaymentBySourceHash')).toBeLessThan(fn.indexOf('analyzeForecastDocument(picked)'))
  })

  it('un duplicado por CAPA A corta aquí — nunca llega a analyzeForecastDocument', () => {
    const capaABlock = slice(fn, 'const existingByHash = await findForecastPaymentBySourceHash(sourceFileHash)', 'setStatus(\'analyzing\')')
    expect(capaABlock).toContain('return')
  })

  it('tras la IA, comprueba isEmptyForecastDocumentScan ANTES de construir ninguna huella/propuesta — un documento sin nada útil ni siquiera intenta CAPA B', () => {
    expect(fn.indexOf('isEmptyForecastDocumentScan(scan)')).toBeLessThan(fn.indexOf('buildForecastContentFingerprintBasis(scan)'))
  })

  it('CAPA B: la huella lógica se comprueba ANTES de onPrefillReady — un duplicado detectado así nunca llega a abrir el formulario de revisión', () => {
    expect(fn.indexOf('findForecastPaymentByContentFingerprint(contentFingerprint)')).toBeLessThan(fn.indexOf('onPrefillReady('))
  })

  it('la propuesta final lleva el archivo original y las dos huellas — para poder subirlo/fijarlas solo al confirmar Guardar (nunca aquí)', () => {
    const prefillCall = slice(fn, 'onPrefillReady({', '})')
    expect(prefillCall).toContain('sourceFile: picked')
    expect(prefillCall).toContain('sourceFileHash')
    expect(prefillCall).toContain('contentFingerprint')
  })
})

describe('ForecastPaymentForm — el documento original solo se sube al confirmar Guardar, nunca durante la revisión', () => {
  const fn = slice(SRC, 'setSaving(true)\n    try {', '\n      let id: string')

  it('la subida está condicionada a: creación (nunca al editar), con archivo pendiente, y solo una vez por formulario', () => {
    expect(fn).toContain('if (!payment && prefill?.sourceFile && !uploadedDocumentPathRef.current)')
    expect(fn).toContain('uploadedDocumentPathRef.current = await uploadForecastDocument(prefill.sourceFile)')
  })

  it('la subida ocurre ANTES de construir el input que se guarda — para poder incluir la ruta ya subida en el mismo insert', () => {
    expect(fn.indexOf('uploadForecastDocument(prefill.sourceFile)')).toBeLessThan(fn.indexOf('const input: ForecastPaymentInput'))
  })

  it('sourceStoragePath/sourceFileHash/contentFingerprint solo se incluyen en el input si de verdad se subió algo — nunca fijados a mano sin archivo real detrás', () => {
    expect(fn).toContain('...(uploadedDocumentPathRef.current')
    expect(fn).toContain('sourceStoragePath: uploadedDocumentPathRef.current')
  })
})

describe('ForecastPaymentPrefill — amount ahora admite null (documento sin importe legible), sin romper la detección bancaria existente', () => {
  it('amount: number | null — la detección bancaria (que siempre trae un importe real) no cambia de comportamiento', () => {
    expect(SRC).toContain('amount: number | null')
  })

  it('handleImportDocument nunca inventa un 0: sin importe, amountStatus cae a \'unknown\' (Pendiente), no a \'estimated\'', () => {
    expect(SRC).toContain("useState<ForecastAmountStatus>(payment?.amountStatus ?? (prefill ? (prefill.amount != null ? 'estimated' : 'unknown') : 'known'))")
  })
})

describe('"Ver documento original" — solo cuando la Previsión tiene uno (sourceStoragePath), y borrado limpio al eliminar', () => {
  it('el enlace solo se monta si sourceStoragePath existe — un pago creado a mano nunca lo muestra', () => {
    const fn = slice(SRC, '{parent.sourceStoragePath && (', '\n                )}')
    expect(fn).toContain('getForecastDocumentUrl(parent.sourceStoragePath')
    expect(fn).toContain("window.open(url, '_blank')")
  })

  it('Eliminar pasa sourceStoragePath a deleteForecastPayment — nunca deja un archivo huérfano en Storage', () => {
    expect(SRC).toContain('deleteForecastPayment(parent.calendarEventId, parent.id, parent.sourceStoragePath)')
  })
})
