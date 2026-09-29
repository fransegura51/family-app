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

// BUG REAL — documento SUMA (2026-09-29): "amount" del prefill llegaba ya dividido por el número de
// cuotas (868,56€ → 144,76€), y el plan de pagos lo volvía a dividir otra vez al proponerlo (144,76€ → 6
// cuotas de ~24€). La causa real estaba en dos sitios: buildForecastDocumentPrefillFields (arreglado,
// domain/forecastDocumentImport.ts) y aquí — el bloque que precargaba planLines desde un documento
// importado construía las cuotas A MANO (un .map directo) en vez de reutilizar proposeFinitePlanLines (el
// mismo motor de reparto en céntimos que usa el resto de Previsión), así que nunca partía del total
// correcto. Estos tests fijan que, tras el arreglo, ese bloque SIEMPRE parte de proposeFinitePlanLines y
// solo sobrescribe línea a línea lo que el documento realmente listaba (importes y/o fechas reales).
describe('planLines (precarga) — "Importar desde foto o documento" reutiliza proposeFinitePlanLines, nunca reparte el total a mano', () => {
  const fn = slice(SRC, 'const hasRealAmounts =', '\n  const planSignatureRef = useRef(')

  it('el bloque de "Importar desde foto o documento" parte de proposeFinitePlanLines — nunca de un .map directo sobre installmentAmounts (el bug real: eso repartía el total dos veces)', () => {
    expect(fn).toContain('proposeFinitePlanLines(dueDate, freq, interval, validated.count, amountStatus, prefill.amount, prefill.amountEstimatedBasis)')
    expect(fn).not.toContain('prefill.installmentAmounts.map(')
  })

  it('las fechas reales del documento (installmentDueDates) sustituyen a las de la recurrencia SOLO cuando su número coincide con el de cuotas', () => {
    expect(fn).toContain('hasRealDates = !payment && !!prefill?.installmentDueDates && prefill.installmentDueDates.length > 1')
    expect(fn).toContain('realDates = hasRealDates && prefill.installmentDueDates!.length === validated.count ? prefill.installmentDueDates! : null')
    expect(fn).toContain('date: realDates ? realDates[i] : line.date')
  })

  it('los importes reales del documento (installmentAmounts) sustituyen al reparto uniforme SOLO cuando su número coincide con el de cuotas, sin tocar la fecha propuesta si no hay fechas reales', () => {
    expect(fn).toContain('realAmounts = hasRealAmounts && prefill.installmentAmounts!.length === validated.count ? prefill.installmentAmounts! : null')
    expect(fn).toContain("amount: realAmounts ? String(realAmounts[i]) : line.amount")
  })

  it('se dispara con solo fechas reales, o solo importes reales, o ambos — nunca exige los dos a la vez', () => {
    expect(fn).toContain('if (prefill && (hasRealAmounts || hasRealDates)) {')
  })
})

// BUG REAL — 3ª prueba real (documento SUMA, tras corregir la doble división): el diagnóstico (Etapa
// C/D) demostró que buildForecastDocumentPrefillFields YA entregaba installmentAmounts/installmentDueDates
// completos y correctos — el "Plan de pagos" seguía mostrando 144,76€ × 6 y 05/12 en vez de 07/12 de
// todos modos. Causa real, demostrada leyendo el código (no otra hipótesis): planSignatureRef solo se
// sembraba para el caso "editar un pago ya guardado" (payment) — para una previsión NUEVA quedaba en '',
// así que el useEffect que reconstruye planLines cuando cambia el total/nº de cuotas SIEMPRE se disparaba
// al montar el formulario (cualquier firma real es distinta de ''), sobreescribiendo en silencio el plan
// recién construido con los importes/fechas reales por un reparto uniforme + recurrencia pura.
describe('planSignatureRef — se siembra también para una previsión NUEVA con cuotas/fechas reales (BUG REAL: si no, el useEffect posterior sobreescribe el plan recién construido nada más montar)', () => {
  const fn = slice(SRC, 'const planSignatureRef = useRef(', '\n  const [reminders, setReminders] = useState<')

  it('cuando hay importes y/o fechas reales del documento, la firma inicial se calcula con los MISMOS valores que usará el plan recién construido (dueDate/amountStatus/amount/amountBasis actuales) — nunca se deja en \'\'', () => {
    expect(fn).toContain('hasRealAmounts || hasRealDates')
    expect(fn).toContain('computeFinitePlanSignature(initialRecurrence.installmentCount, initialRecurrence.freqOption, initialRecurrence.customFreq, initialRecurrence.customInterval, dueDate, amountStatus, amount, amountBasis)')
  })

  it('el caso de editar un pago ya guardado (payment) sigue igual — esta firma nunca lo toca', () => {
    expect(fn.indexOf('payment && initialRecurrence.repeats')).toBeLessThan(fn.indexOf('hasRealAmounts || hasRealDates'))
  })
})

// BUG REAL — mismo documento SUMA: el total leído (868,56€) y lo que sumaban las cuotas reales debían
// cuadrar; cuando no cuadran (p. ej. si la IA confunde el total con el importe de una cuota), PEPA avisa
// en vez de proponer en silencio un reparto que podría estar mal.
describe('amountReviewNote — aviso cuando el total leído no cuadra con las cuotas, nunca oculto en silencio', () => {
  it('se muestra solo al crear (nunca al reabrir un pago ya guardado) y solo si el prefill trae aviso', () => {
    const block = slice(SRC, '{!payment && prefill?.amountReviewNote && (', '\n      )}')
    expect(block).toContain('prefill.amountReviewNote')
  })
})

// BUG REAL — 2ª prueba real (documento SUMA, tras corregir la doble división): "No aceptar fallback
// silencioso" — si se detecta un plan de varias cuotas pero el documento no dejó leer con seguridad todos
// los importes y/o todas las fechas, el plan mostrado es un cálculo, nunca datos leídos del documento.
describe('planReviewNote — aviso junto al Plan de pagos cuando el plan propuesto es un cálculo, no lo leído del documento', () => {
  it('se muestra dentro de la sección "Plan de pagos", solo al crear y solo si el prefill trae aviso', () => {
    const block = slice(SRC, 'Plan de pagos — {planLines.length} pagos', 'renderDistributionBanner(planCheck)')
    expect(block).toContain('!payment && prefill?.planReviewNote')
    expect(block).toContain('prefill.planReviewNote')
  })
})

// BUG REAL — documento BBVA real (85 cuotas): con las 85 líneas reales ya cargadas, cambiar SOLO el
// "Estado del importe TOTAL" (p. ej. Estimado → Conocido, sin tocar nº de cuotas/frecuencia/vencimiento)
// pisaba las 85 líneas reales con un reparto uniforme (20.790€/85 = 244,58€ cada una) — el mismo
// mecanismo de "regenerar el plan al cambiar el total" que hace falta para la entrada manual, aplicado sin
// querer también a un plan ya importado con datos reales.
describe('planLines — un plan importado con datos reales sobrevive a cambios en el TOTAL (estado/importe/basis), solo se regenera ante un cambio estructural real', () => {
  const fn = slice(SRC, 'const importedRealPlanRef = useRef(', '\n  const [reminders, setReminders] = useState<')

  it('importedRealPlanRef se siembra igual que hasRealAmounts/hasRealDates — solo protege un plan realmente importado', () => {
    expect(fn).toContain('const importedRealPlanRef = useRef(hasRealAmounts || hasRealDates)')
  })

  it('la firma estructural (planStructureSignatureRef) se siembra con los mismos valores iniciales que ya construyeron el plan real', () => {
    expect(fn).toContain(
      'computeFinitePlanStructureSignature(initialRecurrence.installmentCount, initialRecurrence.freqOption, initialRecurrence.customFreq, initialRecurrence.customInterval, dueDate)',
    )
  })
})

describe('useEffect de regeneración del plan — comprueba primero si hay que proteger un plan real antes de mirar el total', () => {
  const fn = slice(SRC, "useEffect(() => {\n    if (!isFinitePlanMode) return\n    // BUG REAL", '\n  }, [isFinitePlanMode, paymentCount, freqOption, customFreq, customInterval, dueDate, amountStatus, amount, amountBasis])')

  it('mientras importedRealPlanRef siga activo, un cambio SOLO en el TOTAL (que no altera la firma estructural) sale sin regenerar nada', () => {
    expect(fn).toContain('if (importedRealPlanRef.current) {')
    expect(fn).toContain('const structureSignature = computeFinitePlanStructureSignature(paymentCount, freqOption, customFreq, customInterval, dueDate)')
    expect(fn).toContain('if (structureSignature === planStructureSignatureRef.current) return')
  })

  it('un cambio estructural real (nº de cuotas/frecuencia/vencimiento) desactiva la protección — a partir de ahí el plan vuelve a comportarse como uno manual', () => {
    const block = slice(fn, 'if (importedRealPlanRef.current) {', 'const signature = computeFinitePlanSignature(')
    expect(block).toContain('importedRealPlanRef.current = false')
  })

  it('la comprobación estructural ocurre ANTES de la firma completa (que sí incluye el total) — nunca al revés', () => {
    expect(fn.indexOf('computeFinitePlanStructureSignature(paymentCount')).toBeLessThan(fn.indexOf('computeFinitePlanSignature(paymentCount'))
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
