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
    installmentDueDates: null,
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
    // BUG REAL (documento SUMA): cuando SÍ se va a construir un plan de varias fechas, "amount" tiene que
    // ser el TOTAL (1.200€), nunca el importe de una sola cuota (100€) — el propio formulario
    // (proposeFinitePlanLines) reparte ese total entre las cuotas al proponer el plan; si aquí ya viniera
    // dividido, el formulario lo volvería a dividir (100€ → ~8,33€ × 12, el mismo bug real observado con
    // el documento de SUMA: 868,56€ → 144,76€ prefillado como importe → 24,12€ × 6 al abrir el plan).
    expect(fields.amount).toBe(1200)
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

// BUG REAL — documento SUMA (Solicitud de Aplazamiento o fraccionamiento, Diputación de Alicante,
// 2026-09-29): Total deuda 868,56€ en 6 cuotas mensuales (144,09/144,54, 143,58/144,54, 143,12/144,54,
// 142,63/144,53, 142,20/144,54, 143,02/145,87 — deuda/interés/Imp.Cargo), primera cuota 05/11/2026, SEGUNDA
// cuota el 07/12/2026 (irregular: dos días más tarde de lo que tocaría por pura recurrencia mensual).
// PEPA mostró "Importe TOTAL: 144,76€" (= 868,56/6, YA una cuota) y después generó 6 cuotas de ~24,12€ (=
// 144,76/6 otra vez) — doble división. Causa demostrada tras leer el pipeline completo (no una hipótesis):
// buildForecastDocumentPrefillFields dividía el total por el nº de cuotas para "amount", pero
// ForecastPaymentForm (proposeFinitePlanLines, FinanceScreen.tsx) YA trata "amount" como el TOTAL a
// repartir cuando hay un plan de varias fechas — la misma cantidad se dividía dos veces.
describe('buildForecastDocumentPrefillFields — regresión documento SUMA (doble división real, nunca reproducirla)', () => {
  const sumaScan: ForecastDocumentScanResult = scan({
    provider: 'SUMA Gestión Tributaria',
    concept: 'Aplazamiento o fraccionamiento de deuda tributaria',
    totalAmount: 868.56,
    installmentCount: 6,
    installmentAmount: null,
    installmentAmounts: [144.54, 144.54, 144.54, 144.53, 144.54, 145.87],
    firstDueDate: '2026-11-05',
    periodicity: 'mensual',
    installmentDueDates: ['2026-11-05', '2026-12-07', '2027-01-05', '2027-02-05', '2027-03-05', '2027-04-05'],
  })

  it('1) el total nunca se confunde con una cuota: "amount" es el total real (868,56€), no 144,76€', () => {
    expect(buildForecastDocumentPrefillFields(sumaScan).amount).toBe(868.56)
  })

  it('2) ese total no se vuelve a dividir entre las cuotas aquí — sigue siendo el total tal cual, para que el formulario lo reparta UNA sola vez', () => {
    const fields = buildForecastDocumentPrefillFields(sumaScan)
    expect(fields.amount).not.toBeCloseTo(868.56 / 6, 2)
  })

  it('3) se conservan los 6 importes reales de las cuotas, no un reparto uniforme inventado', () => {
    expect(buildForecastDocumentPrefillFields(sumaScan).installmentAmounts).toEqual([144.54, 144.54, 144.54, 144.53, 144.54, 145.87])
  })

  it('4) se conservan las 6 fechas reales de las cuotas', () => {
    expect(buildForecastDocumentPrefillFields(sumaScan).installmentDueDates).toEqual(['2026-11-05', '2026-12-07', '2027-01-05', '2027-02-05', '2027-03-05', '2027-04-05'])
  })

  it('5) la fecha irregular (07/12, no 05/12) no se normaliza a la recurrencia pura — sigue siendo 2026-12-07', () => {
    expect(buildForecastDocumentPrefillFields(sumaScan).installmentDueDates?.[1]).toBe('2026-12-07')
  })

  it('6) la última cuota, distinta de las demás (145,87 vs ~144,54), no se homogeneiza', () => {
    expect(buildForecastDocumentPrefillFields(sumaScan).installmentAmounts?.[5]).toBe(145.87)
  })

  it('7) el total y la suma de las cuotas reales SÍ cuadran aquí — no hay amountReviewNote de aviso', () => {
    // 144.54*4 + 144.53 + 145.87 = 868.56, exactamente el total leído.
    expect(buildForecastDocumentPrefillFields(sumaScan).amountReviewNote).toBeNull()
  })

  it('8) con los 6 importes y las 6 fechas completos, tampoco hay planReviewNote — el plan es lo leído del documento, no un cálculo', () => {
    expect(buildForecastDocumentPrefillFields(sumaScan).planReviewNote).toBeNull()
  })

  it('sin installmentAmounts explícitos (solo total + nº de cuotas, el caso real cuando la IA no lee la tabla cuota a cuota) tampoco se divide el total al construirlo', () => {
    const withoutAmounts = scan({ totalAmount: 868.56, installmentCount: 6, firstDueDate: '2026-11-05', periodicity: 'mensual' })
    expect(buildForecastDocumentPrefillFields(withoutAmounts).amount).toBe(868.56)
  })
})

describe('buildForecastDocumentPrefillFields — validación aritmética (contradicción entre total y cuotas se avisa, nunca se oculta)', () => {
  it('total ≈ una sola cuota, con varias cuotas del mismo orden → contradicción evidente, amountReviewNote avisa', () => {
    // Exactamente el patrón del bug real: "totalAmount" trae por error el valor de una cuota (144,76€) en
    // vez del total, mientras hay 6 cuotas de ~144€ cada una (total real ~868€) — un factor ×6.
    const fields = buildForecastDocumentPrefillFields(
      scan({ totalAmount: 144.76, installmentCount: 6, installmentAmounts: [144.54, 144.54, 144.54, 144.53, 144.54, 145.87], firstDueDate: '2026-11-05', periodicity: 'mensual' }),
    )
    expect(fields.amountReviewNote).toContain('una sola cuota')
  })

  it('un préstamo real con intereses (el total —capital— es MUCHO menor que la suma de las cuotas —capital+intereses—) nunca genera aviso: esa diferencia es normal, no una contradicción (documento BBVA real: 20.790€ de capital vs 26.848,74€ de suma de 85 cuotas)', () => {
    const installmentAmounts = [0, ...Array(83).fill(319.63), 319.45]
    const fields = buildForecastDocumentPrefillFields(scan({ totalAmount: 20790.0, installmentCount: 85, installmentAmounts, firstDueDate: '2024-05-05', periodicity: 'mensual' }))
    expect(fields.amountReviewNote).toBeNull()
  })

  it('pequeñas diferencias (intereses/comisiones) dentro de tolerancia NO generan aviso', () => {
    const fields = buildForecastDocumentPrefillFields(
      scan({ totalAmount: 1210, installmentCount: 12, installmentAmount: 100, firstDueDate: '2026-01-05', periodicity: 'mensual' }),
    )
    expect(fields.amountReviewNote).toBeNull()
  })

  it('sin una segunda fuente de importe con la que comparar, nunca hay aviso (nada que contradecir)', () => {
    expect(buildForecastDocumentPrefillFields(scan({ totalAmount: 500 })).amountReviewNote).toBeNull()
  })

  it('documento imperfecto: total y nº de cuotas conocidos pero sin fecha/periodicidad → importe medio explícitamente avisado como tal', () => {
    const fields = buildForecastDocumentPrefillFields(scan({ totalAmount: 1200, installmentCount: 12 }))
    expect(fields.amount).toBe(100)
    expect(fields.amountReviewNote).toContain('medio')
  })
})

// BUG REAL — 2ª prueba real (documento SUMA, tras corregir la doble división): el total y el nº de cuotas
// ya salían bien, pero las 6 fechas/importes individuales seguían sin coincidir con el documento — la
// fecha irregular (07/12) seguía apareciendo como 05/12. Petición explícita: "No aceptar fallback
// silencioso" — si se detecta un plan de N pagos pero el documento no permitió leer los importes y/o las
// fechas una a una, el reparto calculado debe avisarse como tal, nunca presentarse como leído.
describe('buildForecastDocumentPrefillFields — planReviewNote ("no aceptar fallback silencioso")', () => {
  it('plan detectado (periodicidad + fecha + ≥2 cuotas) SIN installmentAmounts ni installmentDueDates → avisa de ambos', () => {
    const fields = buildForecastDocumentPrefillFields(scan({ totalAmount: 868.56, installmentCount: 6, firstDueDate: '2026-11-05', periodicity: 'mensual' }))
    expect(fields.planReviewNote).toContain('6 pagos')
    expect(fields.planReviewNote).toContain('los importes')
    expect(fields.planReviewNote).toContain('las fechas')
  })

  it('con installmentAmounts completos pero SIN installmentDueDates → avisa solo de las fechas', () => {
    const fields = buildForecastDocumentPrefillFields(
      scan({ totalAmount: 868.56, installmentCount: 6, installmentAmounts: [144.54, 144.54, 144.54, 144.53, 144.54, 145.87], firstDueDate: '2026-11-05', periodicity: 'mensual' }),
    )
    expect(fields.planReviewNote).toContain('las fechas')
    expect(fields.planReviewNote).not.toContain('los importes')
  })

  it('con installmentDueDates completas pero SIN installmentAmounts → avisa solo de los importes', () => {
    const fields = buildForecastDocumentPrefillFields(
      scan({
        totalAmount: 868.56,
        installmentCount: 6,
        installmentDueDates: ['2026-11-05', '2026-12-07', '2027-01-05', '2027-02-05', '2027-03-05', '2027-04-05'],
        firstDueDate: '2026-11-05',
        periodicity: 'mensual',
      }),
    )
    expect(fields.planReviewNote).toContain('los importes')
    expect(fields.planReviewNote).not.toContain('las fechas')
  })

  it('con installmentAmounts E installmentDueDates completos → sin aviso, el plan es lo leído del documento', () => {
    const fields = buildForecastDocumentPrefillFields(
      scan({
        totalAmount: 868.56,
        installmentCount: 6,
        installmentAmounts: [144.54, 144.54, 144.54, 144.53, 144.54, 145.87],
        installmentDueDates: ['2026-11-05', '2026-12-07', '2027-01-05', '2027-02-05', '2027-03-05', '2027-04-05'],
        firstDueDate: '2026-11-05',
        periodicity: 'mensual',
      }),
    )
    expect(fields.planReviewNote).toBeNull()
  })

  it('sin plan de varias cuotas (pago único, o sin periodicidad/fecha) → nunca hay planReviewNote, aunque falten importes/fechas', () => {
    expect(buildForecastDocumentPrefillFields(scan({ totalAmount: 200 })).planReviewNote).toBeNull()
    expect(buildForecastDocumentPrefillFields(scan({ totalAmount: 1200, installmentCount: 12 })).planReviewNote).toBeNull()
  })
})

describe('buildForecastDocumentPrefillFields — installmentDueDates (fechas explícitas de cada cuota)', () => {
  it('con tantas fechas como cuotas, se propagan tal cual', () => {
    const fields = buildForecastDocumentPrefillFields(
      scan({ periodicity: 'mensual', firstDueDate: '2026-01-05', installmentCount: 3, installmentDueDates: ['2026-01-05', '2026-02-07', '2026-03-05'] }),
    )
    expect(fields.installmentDueDates).toEqual(['2026-01-05', '2026-02-07', '2026-03-05'])
  })

  it('si el número de fechas no coincide con el número de cuotas, se descarta por prudencia', () => {
    const fields = buildForecastDocumentPrefillFields(scan({ periodicity: 'mensual', firstDueDate: '2026-01-05', installmentCount: 3, installmentDueDates: ['2026-01-05', '2026-02-07'] }))
    expect(fields.installmentDueDates).toBeUndefined()
  })

  it('sin plan finito, nunca se propagan installmentDueDates', () => {
    expect(buildForecastDocumentPrefillFields(scan({ installmentDueDates: ['2026-01-05', '2026-02-07', '2026-03-05'] })).installmentDueDates).toBeUndefined()
  })
})

// BUG REAL — documento BBVA real (contrato de financiación de vehículo, PDF de 58 páginas, cuadro de
// amortización en las páginas 7-9): "No se ha podido leer nada útil de este documento", con un documento
// que sí tenía toda la información. Causa real, confirmada con los logs reales del servidor (rawText de
// Gemini, 920 caracteres, "termina en }: false"): con 85 cuotas, installmentAmounts + installmentDueDates
// (un array por cuota) ya no cabían en maxOutputTokens=768 — el JSON quedaba cortado a mitad de camino
// (justo tras terminar de listar las 85 cuotas, a mitad de escribir "periodicity"), parseJsonLoose lo
// descartaba ENTERO por inválido, y todo el resultado se convertía en "vacío" — aunque Gemini había leído
// el documento perfectamente (input verificado: proveedor, concepto, importe total y las 85 cuotas con sus
// importes reales, incluida la 1ª cuota de 0€ y la última distinta, todo correcto en los logs). Arreglado
// subiendo maxOutputTokens a 16.384 (edge function, no cubierto por estos tests de dominio — ver más
// abajo la comprobación estructural). Estos tests fijan que la capa de DOMINIO (donde si viviera un límite
// de tamaño de array sería aquí) nunca tuvo ni tiene ningún tope oculto — funciona igual con 6 cuotas que
// con 85, así que el arreglo real vive exclusivamente en el presupuesto de salida de la IA.
describe('buildForecastDocumentPrefillFields — regresión documento BBVA real (85 cuotas, sin ningún tope oculto de tamaño de array)', () => {
  // Datos reales del cuadro de amortización (páginas 7-9 del PDF): cuota 1 con importe 0€ (periodo de
  // ajuste inicial), cuotas 2-84 de 319,63€ mensuales, última cuota (85) de 319,45€ — mismo patrón que el
  // documento SUMA (última cuota distinta), pero a una escala mucho mayor.
  const installmentAmounts = [0, ...Array(83).fill(319.63), 319.45]
  const installmentDueDates = Array.from({ length: 85 }, (_, i) => {
    const d = new Date(Date.UTC(2024, 4 + i, 5)) // 2024-05-05 en adelante, mensual
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  })
  const bbvaScan: ForecastDocumentScanResult = scan({
    provider: 'BANCO BILBAO VIZCAYA ARGENTARIA, S.A.',
    concept: 'Financiación vehículo HYUNDAI TUCSON',
    totalAmount: 20790.0,
    installmentCount: 85,
    installmentAmounts,
    firstDueDate: '2024-05-05',
    periodicity: 'mensual',
    installmentDueDates,
  })

  it('85 importes reales se propagan completos, sin recortarse ni redondearse a un número menor', () => {
    const fields = buildForecastDocumentPrefillFields(bbvaScan)
    expect(fields.installmentAmounts).toHaveLength(85)
    expect(fields.installmentAmounts).toEqual(installmentAmounts)
  })

  it('85 fechas reales se propagan completas', () => {
    const fields = buildForecastDocumentPrefillFields(bbvaScan)
    expect(fields.installmentDueDates).toHaveLength(85)
    expect(fields.installmentDueDates?.[0]).toBe('2024-05-05')
    expect(fields.installmentDueDates?.[84]).toBe('2031-05-05') // coincide con el contrato real: "con fecha 05-05-2031 deberá quedar [amortizado]"
  })

  it('la 1ª cuota (0€, periodo de ajuste) no se descarta ni se confunde con "sin importe" — es un dato real del documento', () => {
    expect(buildForecastDocumentPrefillFields(bbvaScan).installmentAmounts?.[0]).toBe(0)
  })

  it('la última cuota (319,45€, distinta de las demás) no se homogeneiza', () => {
    expect(buildForecastDocumentPrefillFields(bbvaScan).installmentAmounts?.[84]).toBe(319.45)
  })

  it('el importe total sigue siendo el total real del préstamo (20.790€), nunca dividido ni recalculado a partir de las 85 cuotas', () => {
    expect(buildForecastDocumentPrefillFields(bbvaScan).amount).toBe(20790.0)
  })

  it('el total (20.790€) y lo que suman las 85 cuotas reales no cuadran exactamente (hay intereses/comisión de apertura financiada) pero están dentro de tolerancia — sin aviso', () => {
    // 0 + 83×319,63 + 319,45 = 26.848,68 — muy por encima del total porque el total es el CAPITAL
    // financiado, no la suma de las cuotas (que incluyen intereses). No es el caso de prueba de la
    // contradicción "un total que en realidad era una cuota" (esa combinación sí debe avisar, ver el
    // describe de "validación aritmética" más arriba) — aquí simplemente no hay aviso porque no hay una
    // segunda fuente independiente del MISMO dato (total financiado vs. importe de una cuota concreta).
    expect(buildForecastDocumentPrefillFields(bbvaScan).amountReviewNote).toBeNull()
  })

  it('con las 85 cuotas y fechas completas, no hay planReviewNote — el plan es lo leído del documento, no un cálculo', () => {
    expect(buildForecastDocumentPrefillFields(bbvaScan).planReviewNote).toBeNull()
  })
})

describe('buildForecastDocumentPrefillFields — documento sin información suficiente (imperfecto de verdad, no truncado por la IA) sigue degradando limpiamente', () => {
  it('scan completamente vacío → isEmptyForecastDocumentScan true, el llamador nunca intenta construir un prefill (vuelve a "Continuar a mano")', () => {
    expect(isEmptyForecastDocumentScan(scan())).toBe(true)
  })

  it('con algún campo suelto pero sin datos de cuotas → prefill mínimo, sin plan ni avisos inventados', () => {
    const fields = buildForecastDocumentPrefillFields(scan({ provider: 'Entidad desconocida' }))
    expect(fields.amount).toBeNull()
    expect(fields.recurrenceRule).toBeUndefined()
    expect(fields.planReviewNote).toBeNull()
    expect(fields.amountReviewNote).toBeNull()
  })
})
