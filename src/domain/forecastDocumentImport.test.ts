import { describe, expect, it } from 'vitest'
import { buildForecastContentFingerprintBasis, buildForecastDocumentPrefillFields, isEmptyForecastDocumentScan, type ForecastDocumentScanResult } from './forecastDocumentImport'

function scan(overrides: Partial<ForecastDocumentScanResult> = {}): ForecastDocumentScanResult {
  return {
    provider: null,
    concept: null,
    totalAmount: null,
    installmentCount: null,
    installmentAmount: null,
    installmentAmounts: null,
    firstDueDate: null,
    periodicity: null,
    lastDueDate: null,
    paidInstallments: null,
    ...overrides,
  }
}

describe('isEmptyForecastDocumentScan', () => {
  it('todo en null → vacío (documento imperfecto, sin nada útil que proponer)', () => {
    expect(isEmptyForecastDocumentScan(scan())).toBe(true)
  })

  it('con un solo campo relleno ya no está vacío — se rellena lo conocido, nunca todo o nada', () => {
    expect(isEmptyForecastDocumentScan(scan({ provider: 'Financiera XYZ' }))).toBe(false)
    expect(isEmptyForecastDocumentScan(scan({ totalAmount: 1200 }))).toBe(false)
    expect(isEmptyForecastDocumentScan(scan({ firstDueDate: '2026-10-05' }))).toBe(false)
  })
})

describe('buildForecastContentFingerprintBasis — CAPA B de duplicados, nunca a partir de un escaneo casi vacío', () => {
  it('sin entidad/concepto → null (no hay etiqueta con la que discriminar)', () => {
    expect(buildForecastContentFingerprintBasis(scan({ totalAmount: 1200, firstDueDate: '2026-10-05' }))).toBeNull()
  })

  it('con entidad pero sin importe ni fecha → null (huella demasiado débil, coincidiría con cualquier otro documento de la misma entidad)', () => {
    expect(buildForecastContentFingerprintBasis(scan({ provider: 'El Corte Inglés' }))).toBeNull()
  })

  it('con entidad + importe (o fecha) → una huella real, estable', () => {
    const basis = buildForecastContentFingerprintBasis(scan({ provider: 'El Corte Inglés', totalAmount: 1200, firstDueDate: '2026-10-05', installmentCount: 12 }))
    expect(basis).toBeTruthy()
    expect(basis).toBe(buildForecastContentFingerprintBasis(scan({ provider: 'El Corte Inglés', totalAmount: 1200, firstDueDate: '2026-10-05', installmentCount: 12 })))
  })

  it('provider y concept distintos con el mismo importe/fecha producen huellas distintas — nunca dos documentos distintos comparten huella solo por coincidir en el importe', () => {
    const a = buildForecastContentFingerprintBasis(scan({ provider: 'El Corte Inglés', totalAmount: 1200, firstDueDate: '2026-10-05' }))
    const b = buildForecastContentFingerprintBasis(scan({ provider: 'MediaMarkt', totalAmount: 1200, firstDueDate: '2026-10-05' }))
    expect(a).not.toBe(b)
  })

  it('usa concept como respaldo si no hay provider', () => {
    expect(buildForecastContentFingerprintBasis(scan({ concept: 'Financiación lavadora', totalAmount: 300 }))).toBeTruthy()
  })
})

describe('buildForecastDocumentPrefillFields — título', () => {
  it('concepto + entidad → los combina', () => {
    expect(buildForecastDocumentPrefillFields(scan({ concept: 'Financiación lavadora', provider: 'El Corte Inglés' })).title).toBe('Financiación lavadora — El Corte Inglés')
  })

  it('solo concepto, o solo entidad → ese solo', () => {
    expect(buildForecastDocumentPrefillFields(scan({ concept: 'Financiación lavadora' })).title).toBe('Financiación lavadora')
    expect(buildForecastDocumentPrefillFields(scan({ provider: 'El Corte Inglés' })).title).toBe('El Corte Inglés')
  })

  it('ninguno de los dos → etiqueta genérica, nunca un título vacío (forecast_payments exige título no vacío)', () => {
    expect(buildForecastDocumentPrefillFields(scan({ totalAmount: 200 })).title).toBe('Pago importado')
  })
})

describe('buildForecastDocumentPrefillFields — importe (nunca inventado, prioridad exacta)', () => {
  it('installmentAmount explícito manda sobre cualquier otro cálculo', () => {
    expect(buildForecastDocumentPrefillFields(scan({ installmentAmount: 100, totalAmount: 5000, installmentCount: 12 })).amount).toBe(100)
  })

  it('sin importe de cuota explícito, reparte el total entre el número de cuotas — ejemplo del enunciado: 1.200€ en 12 cuotas → 100€', () => {
    expect(buildForecastDocumentPrefillFields(scan({ totalAmount: 1200, installmentCount: 12 })).amount).toBe(100)
  })

  it('total sin número de cuotas → el total tal cual (pago único)', () => {
    expect(buildForecastDocumentPrefillFields(scan({ totalAmount: 450 })).amount).toBe(450)
  })

  it('nada de importe → null (Pendiente), nunca un 0 inventado', () => {
    expect(buildForecastDocumentPrefillFields(scan({ provider: 'Alguien' })).amount).toBeNull()
  })
})

describe('buildForecastDocumentPrefillFields — recurrencia y plan de cuotas', () => {
  it('ejemplo del enunciado: 12 cuotas mensuales de 100€, primera el 05/10/2026 → plan finito con UNTIL calculado (última cuota real, no inventada)', () => {
    const fields = buildForecastDocumentPrefillFields(scan({ totalAmount: 1200, installmentCount: 12, installmentAmount: 100, firstDueDate: '2026-10-05', periodicity: 'mensual' }))
    expect(fields.dueDate).toBe('2026-10-05')
    expect(fields.amount).toBe(100)
    expect(fields.recurrenceRule).toBe('FREQ=MONTHLY;UNTIL=2027-09-05') // 12ª cuota mensual desde el 05/10/2026
  })

  it('trimestral se traduce a FREQ=MONTHLY;INTERVAL=3 (mismo motor que ya usa el resto de Previsión, no una frecuencia nueva)', () => {
    const fields = buildForecastDocumentPrefillFields(scan({ periodicity: 'trimestral', firstDueDate: '2026-01-10', installmentCount: 4 }))
    expect(fields.recurrenceRule).toBe('FREQ=MONTHLY;INTERVAL=3;UNTIL=2026-10-10')
  })

  it('semanal → FREQ=WEEKLY', () => {
    const fields = buildForecastDocumentPrefillFields(scan({ periodicity: 'semanal', firstDueDate: '2026-01-05', installmentCount: 3 }))
    expect(fields.recurrenceRule).toBe('FREQ=WEEKLY;UNTIL=2026-01-19')
  })

  it('periodicidad conocida SIN número de cuotas → recurrencia abierta (UNTIL null, "No lo sé todavía" en el formulario) — nunca se inventa cuántas veces', () => {
    const fields = buildForecastDocumentPrefillFields(scan({ periodicity: 'mensual', firstDueDate: '2026-10-05' }))
    expect(fields.recurrenceRule).toBe('FREQ=MONTHLY')
  })

  it('sin periodicidad → sin recurrenceRule en absoluto (pago único), aunque haya fecha', () => {
    const fields = buildForecastDocumentPrefillFields(scan({ firstDueDate: '2026-10-05', totalAmount: 200 }))
    expect(fields.recurrenceRule).toBeUndefined()
  })

  it('periodicidad SIN fecha de primera cuota → tampoco construye recurrencia (no hay ancla)', () => {
    const fields = buildForecastDocumentPrefillFields(scan({ periodicity: 'mensual', installmentCount: 6 }))
    expect(fields.recurrenceRule).toBeUndefined()
  })
})

describe('buildForecastDocumentPrefillFields — cuotas de importe DISTINTO (nunca forzadas a un reparto uniforme)', () => {
  it('con tantos importes como cuotas, se propagan tal cual (installmentAmounts)', () => {
    const fields = buildForecastDocumentPrefillFields(
      scan({ periodicity: 'mensual', firstDueDate: '2026-01-05', installmentCount: 3, installmentAmounts: [50, 75, 60] }),
    )
    expect(fields.installmentAmounts).toEqual([50, 75, 60])
  })

  it('si el número de importes NO coincide con el número de cuotas, se descarta por prudencia (mejor reparto uniforme editable que una lista mal alineada)', () => {
    const fields = buildForecastDocumentPrefillFields(
      scan({ periodicity: 'mensual', firstDueDate: '2026-01-05', installmentCount: 3, installmentAmounts: [50, 75] }),
    )
    expect(fields.installmentAmounts).toBeUndefined()
  })

  it('sin plan finito (menos de 2 cuotas, o sin periodicidad/fecha) nunca se propagan installmentAmounts', () => {
    const fields = buildForecastDocumentPrefillFields(scan({ installmentAmounts: [50, 75, 60] }))
    expect(fields.installmentAmounts).toBeUndefined()
  })
})

describe('buildForecastDocumentPrefillFields — categoryName y amountEstimatedBasis', () => {
  it('categoryName siempre null — PEPA nunca adivina una categoría de Economía a partir de un documento (fuera de alcance explícito)', () => {
    expect(buildForecastDocumentPrefillFields(scan({ provider: 'Alguien', totalAmount: 100 })).categoryName).toBeNull()
  })

  it('amountEstimatedBasis siempre explica que viene de un documento importado, para que el usuario sepa por qué está en "Estimado"', () => {
    expect(buildForecastDocumentPrefillFields(scan({ totalAmount: 100 })).amountEstimatedBasis).toContain('documento importado')
  })
})
