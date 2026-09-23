import { describe, expect, it } from 'vitest'

// Fase 1C — Previsión de pagos (Economía): UI funcional. Este proyecto no tiene
// react-testing-library/jsdom (ver src/ui/financeUiRefunds.test.ts) — la verificación de renderizado e
// interacción real se hizo a mano en el navegador (ver informe de la fase). Aquí se comprueban,
// leyendo el código fuente real, las propiedades mecánicas que sí se pueden probar sin renderizar: el
// menú de Economía queda correctamente cableado, la pantalla reutiliza el motor y la capa de datos ya
// certificados (nunca reimplementa recurrencia/totales ni escribe Supabase directamente) y los textos
// obligatorios (importe pendiente nunca 0 €, empty state, ayuda) existen tal cual.
const APP = import.meta.glob(['/src/**/*.ts', '/src/**/*.tsx', '!/src/**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const FS = APP['/src/ui/FinanceScreen.tsx']
const ECONOMIA_MENU = APP['/src/state/economiaMenu.ts']
const AYUDA = APP['/src/ui/AyudaScreen.tsx']
const FS_DOMAIN_FORECAST = APP['/src/domain/forecast.ts']

describe('entrada en el menú de Economía', () => {
  it('"Previsión de pagos" es una clave fija más, con su icono/nombre y en los pagos por defecto', () => {
    expect(ECONOMIA_MENU).toMatch(/FixedEconomiaMenuItemKey =[\s\S]*'Previsión de pagos'/)
    expect(ECONOMIA_MENU).toContain("'Previsión de pagos': { icon: '🔮', label: 'Previsión de pagos' }")
    expect(ECONOMIA_MENU).toMatch(/DEFAULT_KEYS[\s\S]*'Previsión de pagos'/)
  })

  it('FinanceScreen la trata como una pestaña real (SUB_TABS) con su propio branch de render', () => {
    expect(FS).toMatch(/const SUB_TABS = \[[^\]]*'Previsión de pagos'/)
    expect(FS).toContain("{tab === 'Previsión de pagos' && <PrevisionPagosTab")
  })
})

describe('reutiliza el motor y la capa de datos ya certificados (Fase 1B/1B.1), no los reimplementa', () => {
  it('importa expandForecastOccurrences/forecastTotals/forecastByMonth de domain/forecast en vez de recalcular ocurrencias a mano', () => {
    expect(FS).toContain('expandForecastOccurrences')
    expect(FS).toContain('forecastTotals')
    expect(FS).toContain('forecastByMonth')
    expect(FS).toMatch(/from '@\/domain\/forecast'/)
  })

  it('usa src/data/forecast.ts para leer/escribir — nunca referencia las tablas forecast_* directamente', () => {
    expect(FS).toMatch(/from '@\/data\/forecast'/)
    expect(FS).not.toMatch(/from\(["']forecast_payments["']\)/)
    expect(FS).not.toMatch(/from\(["']forecast_reminders["']\)/)
    expect(FS).not.toMatch(/from\(["']forecast_occurrences["']\)/)
  })

  it('reutiliza CategorySelect existente para elegir categoría — no define un selector de categorías paralelo', () => {
    const forecastFormStart = FS.indexOf('function ForecastPaymentForm')
    const forecastFormBody = FS.slice(forecastFormStart, FS.indexOf('\n}', forecastFormStart + 4000))
    expect(forecastFormBody).toContain('<CategorySelect')
    // Solo existe UNA declaración de CategorySelect en todo el archivo (la ya existente de Presupuestos).
    expect(FS.match(/function CategorySelect\(/g)?.length).toBe(1)
  })
})

describe('known / estimated / unknown', () => {
  it('un importe "Pendiente" nunca se enseña como 0 € — texto explícito "Importe pendiente"', () => {
    expect(FS).toContain('Importe pendiente')
  })

  it('"Estimado" exige la base de la estimación (amountEstimatedBasis obligatorio en el formulario)', () => {
    expect(FS).toContain('¿En qué se basa?')
    expect(FS).toContain("if (amountStatus === 'estimated' && !amountBasis.trim())")
  })

  it('el importe se oculta cuando el estado es "Pendiente" (unknown)', () => {
    expect(FS).toMatch(/amountStatus !== 'unknown' && \(/)
  })

  it('nunca se envía un importe cuando el estado es unknown (amountValue se queda en null)', () => {
    expect(FS).toMatch(/let amountValue: number \| null = null/)
    expect(FS).toMatch(/if \(amountStatus !== 'unknown'\) \{/)
  })
})

describe('vencimiento vs fecha prevista de pago', () => {
  it('due_date es siempre obligatorio; expected_payment_date solo si el usuario dice que sí', () => {
    expect(FS).toContain('¿Esperas que se cobre otro día?')
    expect(FS).toContain('hasExpectedPaymentDate ? expectedPaymentDate || null : null')
  })

  it('la lista de próximos pagos no repite la misma fecha dos veces cuando coinciden', () => {
    expect(FS).toContain('const sameDates = o.dueDate === o.expectedPaymentDate')
  })
})

describe('recurrencia amigable (nunca se pide escribir RRULE)', () => {
  it('usa buildRecurrenceRuleFromFormState/parseRecurrenceRuleToFormState (Fase 1D-b) del dominio, con las opciones pedidas', () => {
    expect(FS).toContain('buildRecurrenceRuleFromFormState')
    expect(FS).toContain('parseRecurrenceRuleToFormState')
    for (const label of ['Mensual', 'Cada 3 meses', 'Cada 6 meses', 'Anual', 'Personalizado', '¿Cómo se paga?', '¿Este pago volverá a repetirse cuando termine?', 'Número de pagos']) {
      expect(FS).toContain(label)
    }
  })

  it('"Personalizado" solo expone frecuencia + intervalo — nada de un editor RRULE, ni siquiera "Fin" (eso ahora es "¿Hasta cuándo se repite?", independiente de la frecuencia)', () => {
    const idx = FS.indexOf("freqOption === 'custom' && (")
    expect(idx).toBeGreaterThan(-1)
    const block = FS.slice(idx, idx + 400)
    expect(block).toContain('Cada cuánto')
    expect(block).toContain('Cada')
    expect(block).not.toContain('Fin (opcional)') // "Fin" ya no vive dentro de "Personalizado": es "¿Hasta cuándo se repite?", para cualquier frecuencia
  })

  it('Ajuste UX — "¿Hasta cuándo se repite?" (Para siempre / Hasta una fecha concreta) solo aparece cuando SÍ vuelve a repetirse — preserva la capacidad de reconstruir/editar un pago antiguo con fecha final, sin formar parte del flujo principal', () => {
    expect(FS).toContain('¿Hasta cuándo se repite?')
    expect(FS).toContain('Para siempre')
    expect(FS).toContain('Hasta una fecha concreta')
    expect(FS).not.toMatch(/>\s*UNTIL\s*</)
    expect(FS).not.toContain('>RRULE<')
    const idx = FS.lastIndexOf('¿Hasta cuándo se repite?')
    const before = FS.slice(FS.lastIndexOf('{recurs && (', idx), idx)
    expect(before).toContain('{recurs && (')
  })
})

describe('recordatorios (value + unit, nunca minutos convertidos)', () => {
  it('opciones rápidas 1 semana / 2 semanas / 1 mes antes, más personalizado, permiten varios a la vez', () => {
    expect(FS).toContain('1 semana antes')
    expect(FS).toContain('2 semanas antes')
    expect(FS).toContain('1 mes antes')
    expect(FS).toContain('useState<{ value: number; unit: ForecastReminderUnit }[]>(')
  })

  it('se guardan con replaceForecastReminders (value/unit), no con minutos pre-convertidos', () => {
    expect(FS).toContain('replaceForecastReminders(id, reminders)')
  })
})

describe('Mostrar en Calendario', () => {
  it('activado por defecto, y nunca menciona Google en esta fase', () => {
    expect(FS).toContain('useState(payment?.showInCalendar ?? true)')
    const idx = FS.indexOf('Mostrar en Calendario')
    expect(idx).toBeGreaterThan(-1)
    const nearby = FS.slice(idx, idx + 300)
    expect(nearby).not.toContain('Google')
  })
})

describe('cuenta bancaria opcional, sin IBAN completo', () => {
  it('el selector de cuenta nunca imprime el IBAN completo, solo los 4 últimos dígitos', () => {
    expect(FS).toMatch(/a\.iban \? `•• \$\{a\.iban\.slice\(-4\)\}` : a\.name \?\? 'Cuenta'/)
  })
})

describe('desactivar / reactivar / eliminar', () => {
  it('Desactivar (con confirmación) es la acción principal para un pago que ya no aplica, no Eliminar', () => {
    expect(FS).toContain('<ConfirmButton label="Desactivar" onConfirm={() => setForecastPaymentActive(p, false).then(reload)} />')
  })

  it('Reactivar existe como acción separada', () => {
    expect(FS).toContain('setForecastPaymentActive(p, true).then(reload)')
  })

  it('Eliminar pide confirmación, como el resto de la app', () => {
    expect(FS).toContain('<ConfirmButton label="Eliminar" onConfirm={() => deleteForecastPayment(p.calendarEventId, p.id).then(reload)} />')
  })
})

describe('empty state', () => {
  it('texto propio de la app, con el CTA pedido — no un genérico de SaaS', () => {
    expect(FS).toContain('Todavía no tienes pagos previstos.')
    expect(FS).toContain('Empieza añadiendo cosas que sabes que llegarán: seguros, IBI, cuotas, impuestos…')
    expect(FS).toContain('+ Añadir primer pago')
  })
})

describe('multidivisa', () => {
  it('el resumen y la visión de 12 meses nunca suman divisas distintas (iteran totals.map, una tarjeta por currency)', () => {
    const idx = FS.indexOf('function PrevisionPagosTab')
    const body = FS.slice(idx, FS.indexOf('function ForecastPaymentForm', idx))
    expect(body).toContain('totals.map((t) => (')
    expect(body).not.toMatch(/knownTotal \+ .*estimatedTotal.*\+.*knownTotal/) // no hay suma cruzada entre entradas de distinta divisa
  })
})

describe('Ayuda actualizada (misma fase, mismo commit)', () => {
  it('existe una entrada de ayuda propia para Previsión de pagos dentro de /dinero', () => {
    const dineroIdx = AYUDA.indexOf("'/dinero': [")
    const dineroBlock = AYUDA.slice(dineroIdx, AYUDA.indexOf("\n  ],", dineroIdx))
    expect(dineroBlock).toContain('Previsión de pagos')
    expect(dineroBlock).toContain('nunca se enseña como 0')
  })

  it('cubre "Número de pagos" (Fase 1D-b, renombrado en el ajuste UX) y los cobros de cada renovación (Fase 1D-c/d) para una obligación que sí vuelve a repetirse', () => {
    const dineroIdx = AYUDA.indexOf("'/dinero': [")
    const dineroBlock = AYUDA.slice(dineroIdx, AYUDA.indexOf("\n  ],", dineroIdx))
    expect(dineroBlock).toContain('Número de pagos')
    expect(dineroBlock).toContain('cobros de CADA renovación')
    expect(dineroBlock).not.toMatch(/RRULE|FREQ=|UNTIL=|INTERVAL=/) // sin jerga técnica, como en el resto de la app
  })

  it('Ajuste UX (fraccionamiento visible desde el principio) — explica que "¿Cómo se paga?" está siempre visible y que "¿Vuelve a repetirse?" es una pregunta aparte, sobre la obligación completa', () => {
    const dineroIdx = AYUDA.indexOf("'/dinero': [")
    const dineroBlock = AYUDA.slice(dineroIdx, AYUDA.indexOf("\n  ],", dineroIdx))
    expect(dineroBlock).toContain('¿Cómo se paga?')
    expect(dineroBlock).toContain('sin tener que activar nada antes')
    expect(dineroBlock).toContain('¿Este pago volverá a repetirse cuando termine?')
  })

  it('Ajuste UX tras certificación móvil — explica el importe TOTAL repartido en "Plan de pagos" y la regla Conocido/Estimado/Pendiente del reparto', () => {
    const dineroIdx = AYUDA.indexOf("'/dinero': [")
    const dineroBlock = AYUDA.slice(dineroIdx, AYUDA.indexOf("\n  ],", dineroIdx))
    expect(dineroBlock).toContain('Plan de pagos')
    expect(dineroBlock).toContain('TOTAL')
    expect(dineroBlock).toContain('Diferencia pendiente')
    expect(dineroBlock).toContain('Próximo pago')
    expect(dineroBlock).toContain('Último pago')
  })
})

describe('Fase 1D-b — planes de cuotas finitos en la UI', () => {
  it('reutiliza el puente de dominio (forecastInstallmentPlanForm.ts) — nunca calcula UNTIL/fechas a mano en el componente', () => {
    expect(FS).toContain("from '@/domain/forecastInstallmentPlanForm'")
    expect(FS).toContain('validateInstallmentCount')
    expect(FS).toContain('INSTALLMENT_COUNT_MAX')
    expect(FS).toContain('formatSpanishDate')
    // Ajuste UX — "Número de pagos" es un único campo compartido entre el Caso A y el Caso B: su límite
    // máximo cambia según recurs (60 para un plan finito, 12 para cargos por ciclo — límite real del
    // propio módulo de dominio del Caso B, no un número inventado en la UI).
    expect(FS).toMatch(/max=\{recurs \? SPLIT_CHARGE_COUNT_MAX : INSTALLMENT_COUNT_MAX\}/)
  })

  it('los límites de validación son 2 y 60 (auditoría previa), no un número inventado en la UI', () => {
    const module = APP['/src/domain/forecastInstallmentPlanForm.ts']
    expect(module).toContain('export const INSTALLMENT_COUNT_MIN = 2')
    expect(module).toContain('export const INSTALLMENT_COUNT_MAX = 60')
  })

  it('el mensaje de validación es humano, nunca jerga técnica (RRULE/UNTIL/FREQ/INTERVAL)', () => {
    const module = APP['/src/domain/forecastInstallmentPlanForm.ts']
    expect(module).toContain('El número de cuotas debe estar entre')
    expect(module).not.toMatch(/RRULE/i)
  })

  it('Ajuste UX tras certificación móvil — el "Plan de pagos" del plan finito reutiliza el puente de dominio (proposeFinitePlanLines/buildFinitePlanSubmission/parseFinitePlanLinesFromSaved), nunca calcula fechas/reparto a mano en el componente', () => {
    expect(FS).toContain('proposeFinitePlanLines(')
    expect(FS).toContain('buildFinitePlanSubmission(')
    expect(FS).toContain('parseFinitePlanLinesFromSaved(')
    const formIdx = FS.indexOf('function ForecastPaymentForm')
    const formBody = FS.slice(formIdx, FS.indexOf('\nfunction ', formIdx + 10))
    expect(formBody).not.toMatch(/setMonth|setDate|getMonth\(\)|getDate\(\)/) // sin aritmética de fechas manual en el componente
  })

  it('Ajuste UX (fraccionamiento visible desde el principio) — "Número de pagos" y el "Plan de pagos" dependen SOLO de "¿Cómo se paga?" (paymentMode), nunca de "¿Vuelve a repetirse?" — así se descubren sin tener que activar la recurrencia antes', () => {
    expect(FS).toContain("const isFinitePlanMode = paymentMode === 'multiple' && !recurs")
    expect(FS).toContain("const isSplitCycleMode = paymentMode === 'multiple' && recurs")
    // El bloque que contiene "Número de pagos" y el "Plan de pagos" se abre con paymentMode==='multiple',
    // NUNCA con recurs/repeats — esa es justamente la puerta de entrada que antes estaba escondida.
    const multipleIdx = FS.indexOf("{paymentMode === 'multiple' && (")
    expect(multipleIdx).toBeGreaterThan(-1)
    const block = FS.slice(multipleIdx, FS.indexOf('¿Este pago volverá a repetirse', multipleIdx))
    expect(block).toContain('Número de pagos')
    expect(block).toContain('isFinitePlanMode && planLines.length > 0 && (')
    expect(block).toContain('isSplitCycleMode && splitCharges.length > 0 && (')
  })

  it('"¿Cómo se paga?" es SIEMPRE visible (no depende de ninguna otra respuesta) — el selector en sí no está envuelto en ningún "{...&&(" condicional', () => {
    const idx = FS.indexOf('<label>\n        ¿Cómo se paga?')
    expect(idx).toBeGreaterThan(-1)
    const before = FS.slice(Math.max(0, idx - 400), idx)
    // Justo antes del <label> real no hay ningún guard "{...&&(" (repeats/recurs/paymentMode) sin cerrar.
    expect(before).not.toMatch(/\{(recurs|repeats|paymentMode)[^}]*&&\s*\($/)
  })

  it('cada línea del plan finito es editable (fecha/estado/importe/basis) — reemplaza el reparto uniforme fijo de antes', () => {
    const idx = FS.indexOf('Plan de pagos — {planLines.length} pagos')
    expect(idx).toBeGreaterThan(-1)
    const block = FS.slice(idx, idx + 2200)
    expect(block).toContain('updatePlanLine(i, { date: e.target.value })')
    expect(block).toContain('updatePlanLine(i, { amountStatus:')
    expect(block).toContain('updatePlanLine(i, { amount: e.target.value })')
    expect(block).toContain('updatePlanLine(i, { amountEstimatedBasis: e.target.value })')
  })

  it('el reparto se comprueba en céntimos (checkCentsDistribution) con el banner "Total distribuido correctamente" / "Diferencia pendiente" — nunca bloquea cuando el TOTAL es Estimado o Pendiente', () => {
    expect(FS).toContain('checkCentsDistribution(totalCents, lineCentsList)')
    expect(FS).toContain('✓ Total distribuido correctamente')
    expect(FS).toContain('Diferencia pendiente:')
    expect(FS).toMatch(/if \(check && !check\.matches && amountStatus === 'known'\)/)
  })

  it('la tarjeta de gestión de un plan finito muestra importe×pagos, frecuencia, próximo pago y último pago en español (DD/MM/YYYY) — nunca "Próxima renovación" (eso es solo de una obligación que se renueva de verdad)', () => {
    const fnIdx = FS.indexOf('function renderManagementRow')
    const block = FS.slice(fnIdx, fnIdx + 3200)
    expect(block).toContain('pagos')
    expect(block).toContain('Próximo pago: ${formatSpanishDate(nextPlanOccurrence.dueDate)}')
    expect(block).toContain('Último pago: ${formatSpanishDate(recurrenceForm.untilDate)}')
    const isPlanBlock = block.slice(block.indexOf('{isPlan ? ('), block.indexOf(') : hasSplit ? ('))
    expect(isPlanBlock).not.toContain('Próxima renovación')
  })

  it('"N de M restantes" usa remainingInstallments/totalInstallments (Fase 1D-a) — nunca dice "pagadas"', () => {
    const fnIdx = FS.indexOf('function renderManagementRow')
    expect(fnIdx).toBeGreaterThan(-1)
    const block = FS.slice(fnIdx, fnIdx + 3200)
    expect(block).toContain('remainingInstallments(p, overrides, today)')
    expect(block).toContain('{remaining} de {total} restantes')
    // El JSX renderizado (no los comentarios del código, que SÍ explican legítimamente por qué nunca se
    // afirma "pagada") no debe mostrar nunca esa palabra al usuario.
    const jsxOnly = block.slice(block.indexOf('return ('))
    expect(jsxOnly).not.toMatch(/\bpagad[ao]s?\b/i)
  })

  it('un pago único (totalInstallments=1) o una serie indefinida (totalInstallments=null) nunca se muestran como "plan"', () => {
    expect(FS).toContain('total != null && total > 1')
  })

  it('el guardado sigue usando UNA fila de forecast_payments — no crea pagos independientes por cuota ni materializa forecast_occurrences en esta fase', () => {
    const formIdx = FS.indexOf('function ForecastPaymentForm')
    const submitIdx = FS.indexOf('async function handleSubmit', formIdx)
    const submitEnd = FS.indexOf('\n  }\n', submitIdx)
    const submitBody = FS.slice(submitIdx, submitEnd)
    expect(submitBody).not.toMatch(/forecast_occurrences|upsertForecastOccurrenceOverride/)
    // Una llamada de creación XOR una de actualización según la rama if/else — nunca ambas a la vez, y
    // ninguna de las dos dentro de un bucle (serían pagos independientes por cuota, justo lo prohibido).
    expect(submitBody.match(/createForecastPayment\(/g)?.length).toBe(1)
    expect(submitBody.match(/updateForecastPayment\(/g)?.length).toBe(1)
    expect(submitBody).not.toMatch(/\.map\([^)]*(createForecastPayment|updateForecastPayment)/)
  })
})

describe('Fase 1D-d — cobro fraccionado por ciclo en la UI', () => {
  it('Ajuste UX (fraccionamiento visible desde el principio) — el Caso B (cargos por ciclo) se activa con "¿Cómo se paga?" = "En varios pagos" + "¿Vuelve a repetirse?" = sí, ya no con un selector "¿Cómo se cobra cada vez?" propio', () => {
    expect(FS).toContain('Un solo pago')
    expect(FS).toContain('En varios pagos')
    expect(FS).not.toContain('¿Cómo se cobra cada vez?')
    expect(FS).not.toContain('En varios cobros')
  })

  it('reutiliza el puente de dominio (forecastInstallmentSplitForm.ts) — nunca calcula offsets/fechas a mano en el componente', () => {
    expect(FS).toContain("from '@/domain/forecastInstallmentSplitForm'")
    expect(FS).toContain('buildInstallmentTemplatesFromForm')
    expect(FS).toContain('parseInstallmentTemplatesToForm')
    expect(FS).toContain('validateSplitChargeCount')
  })

  it('límites 2/12 reales del módulo de dominio, no inventados en la UI', () => {
    const module = APP['/src/domain/forecastInstallmentSplitForm.ts']
    expect(module).toContain('export const SPLIT_CHARGE_COUNT_MIN = 2')
    expect(module).toContain('export const SPLIT_CHARGE_COUNT_MAX = 12')
  })

  it('cada cobro pide una fecha humana ("Fecha prevista"), nunca un "offset" visible en el JSX', () => {
    const idx = FS.indexOf('Cobro {i + 1} de {splitCharges.length}')
    expect(idx).toBeGreaterThan(-1)
    const block = FS.slice(idx, idx + 700)
    expect(block).toContain('Fecha prevista')
    expect(block).not.toMatch(/offset/i) // "offsetDays" es un detalle interno (domain/forecastInstallmentSplitForm.ts), nunca llega al JSX
  })

  it('Ajuste UX tras certificación móvil — el viejo selector "Mismo importe en todos / Importes diferentes" ya no existe: se sustituye por un importe TOTAL del ciclo + propuesta de reparto editable (proposeSplitCharges), igual criterio que el plan finito', () => {
    expect(FS).not.toMatch(/<button[^>]*>\s*Mismo importe en todos/)
    expect(FS).not.toMatch(/<button[^>]*>\s*Importes diferentes/)
    expect(FS).toContain('proposeSplitCharges(')
    const idx = FS.indexOf('Cobros de cada renovación')
    expect(idx).toBeGreaterThan(-1)
    const block = FS.slice(idx, idx + 2200)
    expect(block).toContain('updateSplitCharge(i, { date: e.target.value })')
    expect(block).toContain('updateSplitCharge(i, { amountStatus:')
    expect(block).toContain('updateSplitCharge(i, { amount: e.target.value })')
  })

  it('el Plan de pagos (Caso A) y los Cobros de cada renovación (Caso B) son mutuamente excluyentes por construcción: isFinitePlanMode e isSplitCycleMode nunca pueden ser true a la vez, para la misma paymentMode/recurs', () => {
    expect(FS).toContain("const isFinitePlanMode = paymentMode === 'multiple' && !recurs")
    expect(FS).toContain("const isSplitCycleMode = paymentMode === 'multiple' && recurs")
    // Con los mismos (paymentMode, recurs), como mucho una de las dos puede ser true: !recurs y recurs
    // son mutuamente excluyentes por definición — no hace falta un tercer guard "solo si no es la otra".
  })

  it('Ajuste UX — "Número de pagos" (y por tanto el fraccionamiento) NUNCA depende de "¿Vuelve a repetirse?": ninguna de las dos preguntas necesita activarse primero para descubrir la otra', () => {
    const multipleIdx = FS.indexOf("{paymentMode === 'multiple' && (")
    const recursCheckboxIdx = FS.indexOf('¿Este pago volverá a repetirse')
    expect(multipleIdx).toBeGreaterThan(-1)
    expect(recursCheckboxIdx).toBeGreaterThan(multipleIdx)
    // Entre el guard "paymentMode === 'multiple'" y el checkbox de "¿vuelve a repetirse?" no hay ningún
    // guard adicional de recurs/repeats envolviendo "Número de pagos" — solo paymentMode decide si se ve.
    const between = FS.slice(multipleIdx, recursCheckboxIdx)
    expect(between).not.toMatch(/\{recurs\s*&&/)
    expect(between).not.toMatch(/\{repeats\s*&&/)
  })

  it('la vista previa de cobros usa expandForecastOccurrences (motor real), no un bucle de fechas hecho a mano', () => {
    const idx = FS.indexOf('const splitPreviewOccurrences =')
    expect(idx).toBeGreaterThan(-1)
    const block = FS.slice(idx, idx + 900)
    expect(block).toContain('expandForecastOccurrences(')
  })

  it('"Próxima renovación" se calcula con occurrenceForCycle (motor real), no sumando meses a mano', () => {
    expect(FS).toContain('Próxima renovación')
    expect(FS).toContain('const splitNextRenewal =')
    const idx = FS.indexOf('const splitNextRenewal =')
    const block = FS.slice(idx, idx + 300)
    expect(block).toContain('occurrenceForCycle(')
  })

  it('el guardado sustituye la plantilla completa (replaceForecastPaymentInstallments) — nunca crea pagos independientes por cargo', () => {
    expect(FS).toContain('replaceForecastPaymentInstallments(id, installmentsToSave)')
  })

  it('"un solo pago" guarda una plantilla vacía — vuelve exactamente al comportamiento sin fraccionar, sin hijos fantasma', () => {
    const idx = FS.indexOf('let installmentsToSave')
    expect(idx).toBeGreaterThan(-1)
    const block = FS.slice(idx, idx + 200)
    expect(block).toMatch(/installmentsToSave:.*=\s*\[\]/)
  })

  it('la tarjeta de gestión de una obligación fraccionada muestra "cobros por ciclo" y "Se renueva", sin sobrecargarla con más', () => {
    const idx = FS.indexOf('const hasSplit = p.installments.length > 0')
    expect(idx).toBeGreaterThan(-1)
    const nextFn = FS.indexOf('\n  function ', idx + 10)
    const block = FS.slice(idx, nextFn > -1 ? nextFn : idx + 3000)
    expect(block).toContain('cobros por ciclo')
    expect(block).toContain('Se renueva')
  })

  it('"Próximos pagos" muestra "1/2", "2/2"... para cada cargo, usando el propio installmentSequenceIndex de la ocurrencia', () => {
    expect(FS).toContain('o.installmentSequenceIndex != null && parent')
  })

  it('PrevisionPagosTab pasa p.installments a expandForecastOccurrences — si no, un pago fraccionado no se vería fraccionado en la lista', () => {
    const idx = FS.indexOf('function PrevisionPagosTab')
    const body = FS.slice(idx, FS.indexOf('function ForecastPaymentForm', idx))
    expect(body).toContain('expandForecastOccurrences(p, overridesByPayment.get(p.id) ?? [], today, horizonEnd, p.installments)')
    expect(body).toContain('expandForecastOccurrences(p, overridesByPayment.get(p.id) ?? [], today, twelveMonthEnd, p.installments)')
  })
})

describe('Ajuste UX — las 4 combinaciones de "¿Cómo se paga?" × "¿Vuelve a repetirse?"', () => {
  it('CASO C — pago único + no recurrencia: recurrenceRuleNeeded es false, no se construye ninguna Frecuencia', () => {
    expect(FS).toContain("const recurrenceRuleNeeded = paymentMode === 'multiple' || recurs")
    // single (paymentMode='multiple' es false) + !recurs -> recurrenceRuleNeeded=false -> recurrenceRule null.
  })

  it('CASO D — pago único + recurrencia mensual: "Frecuencia" solo se pide cuando paymentMode es single Y recurs es true (nunca antes de contestar la recurrencia, ya que un pago único no tiene "varios pagos" donde mostrarla antes)', () => {
    const idx = FS.indexOf("{paymentMode === 'single' && recurs && (")
    expect(idx).toBeGreaterThan(-1)
    const block = FS.slice(idx, idx + 700)
    expect(block).toContain('Frecuencia')
    expect(block).toContain('RECURRENCE_OPTION_LABELS')
  })

  it('CASO A — varios pagos + NO recurrencia: isFinitePlanMode activa "Plan de pagos" (forecast_occurrences), nunca forecast_payment_installments', () => {
    expect(FS).toContain('isFinitePlanMode && planLines.length > 0 && (')
    expect(FS).toContain('replaceForecastPlanOverrides(id, finitePlanSubmission ? finitePlanSubmission.overrides : [])')
  })

  it('CASO B — varios pagos + SÍ recurrencia (p. ej. anual): isSplitCycleMode activa "Cobros de cada renovación" (forecast_payment_installments), reutilizando la arquitectura ya implementada en 1D-c/d', () => {
    expect(FS).toContain('isSplitCycleMode && splitCharges.length > 0 && (')
    expect(FS).toContain('replaceForecastPaymentInstallments(id, installmentsToSave)')
  })
})

describe('Ajuste UX — edición: reconstruir el nuevo formulario desde datos ya guardados sin modificarlos por abrir', () => {
  it('paymentMode inicial es "multiple" tanto si es un plan finito (untilMode guardado === count) como si tiene cargos por ciclo (installments.length > 0) — las dos formas antiguas de "varios pagos" convergen en la misma pregunta nueva', () => {
    expect(FS).toContain(
      "const initialPaymentMode: 'single' | 'multiple' = initialRecurrence.untilMode === 'count' || (payment?.installments.length ?? 0) > 0 ? 'multiple' : 'single'",
    )
  })

  it('recurs inicial EXCLUYE explícitamente un plan finito (untilMode==="count"): aunque su recurrence_rule interno no sea null, la obligación NO "vuelve a repetirse" conceptualmente', () => {
    expect(FS).toContain("const initialRecurs = initialRecurrence.repeats && initialRecurrence.untilMode !== 'count'")
  })

  it('paymentCount inicial toma el número de cargos guardados (Caso B) o el número de pagos reconstruido del plan finito (Caso A) — nunca un valor fijo', () => {
    expect(FS).toContain(
      "const [paymentCount, setPaymentCount] = useState(payment && payment.installments.length > 0 ? String(payment.installments.length) : initialRecurrence.installmentCount)",
    )
  })

  it('recursUntilDate inicial reconstruye una fecha final ya guardada (untilMode==="date") — abrir y guardar sin tocar nada no la convierte silenciosamente en "para siempre"', () => {
    expect(FS).toContain("const [recursUntilDate, setRecursUntilDate] = useState(initialRecurrence.untilMode === 'date')")
  })
})

describe('Fase 1D-f — "Gestionar movimiento" reutiliza EXACTAMENTE el mecanismo real de Movimientos', () => {
  it('la categoría se cambia con classifyPurchase (RPC atómica classify_purchase) — NUNCA un UPDATE directo de expenses.category', () => {
    const idx = FS.indexOf('function ManageReconciledExpense')
    expect(idx).toBeGreaterThan(-1)
    const body = FS.slice(idx, FS.indexOf('\nfunction ', idx + 10))
    expect(body).toContain('await classifyPurchase({ expenseId: expense.id, category })')
    expect(body).not.toMatch(/from\(["']expenses["']\)/)
  })

  it('la etiqueta se cambia con updateExpense (el mismo mecanismo de Movimientos) — nunca escribe expenses.tag_id directamente', () => {
    const idx = FS.indexOf('function ManageReconciledExpense')
    const body = FS.slice(idx, FS.indexOf('\nfunction ', idx + 10))
    expect(body).toContain('await updateExpense(expense.id, { tagId: tagId || null })')
  })

  it('reutiliza los MISMOS componentes CategorySelect/TagSelect que ya usa la edición real de un movimiento — nunca un selector paralelo', () => {
    const idx = FS.indexOf('function ManageReconciledExpense')
    const body = FS.slice(idx, FS.indexOf('\nfunction ', idx + 10))
    expect(body).toContain('<CategorySelect')
    expect(body).toContain('<TagSelect')
    // Solo existe UNA declaración de cada uno en todo el archivo — no se duplica el componente.
    expect(FS.match(/function CategorySelect\(/g)?.length).toBe(1)
    expect(FS.match(/function TagSelect\(/g)?.length).toBe(1)
  })

  it('la categoría se precarga desde getExpenseById (fila fresca) — nunca de un listado ya en memoria que podría estar desactualizado', () => {
    expect(FS).toContain('getExpenseById(expenseId)')
  })

  it('nada se guarda hasta pulsar "Guardar y finalizar" — cerrar ("Ahora no") no dispara ninguna escritura', () => {
    const idx = FS.indexOf('function ManageReconciledExpense')
    const body = FS.slice(idx, FS.indexOf('\nfunction ', idx + 10))
    expect(body).toContain('Ahora no')
    expect(body).toContain('onClick={onClose}')
    const onCloseIdx = body.indexOf('onClick={onClose}')
    // Nada de classifyPurchase/updateExpense entre "Ahora no" y el final del componente.
    const afterClose = body.slice(onCloseIdx)
    expect(afterClose).not.toContain('classifyPurchase(')
    expect(afterClose).not.toContain('updateExpense(')
  })

  it('la conciliación (matchForecastOccurrence) y "Gestionar movimiento" son pasos SEPARADOS: confirmCandidate ya guarda la conciliación antes de abrir el paso de gestión', () => {
    const idx = FS.indexOf('async function confirmCandidate')
    const body = FS.slice(idx, FS.indexOf('\n  function ', idx))
    const matchIdx = body.indexOf('await matchForecastOccurrence(')
    const manageIdx = body.indexOf('setManaging(')
    expect(matchIdx).toBeGreaterThan(-1)
    expect(manageIdx).toBeGreaterThan(matchIdx) // la conciliación ya se ha guardado ANTES de abrir "Gestionar movimiento"
  })

  it('precedencia de categoría: resolveManagedExpenseCategory decide el punto de partida, nunca un UPDATE ciego con la categoría de la previsión', () => {
    expect(FS).toContain('resolveManagedExpenseCategory(e.category, forecastCategoryName)')
    expect(FS).not.toMatch(/category:\s*forecastCategoryName/) // nunca se asigna directo sin pasar por la resolución
  })

  it('"✓ Cobrado" en Próximos pagos ofrece Gestionar/Desconciliar como acciones separadas', () => {
    expect(FS).toContain('✓ Cobrado')
    const idx = FS.indexOf('o.matchedExpenseId && (')
    expect(idx).toBeGreaterThan(-1)
    const block = FS.slice(idx, idx + 700)
    expect(block).toContain('Gestionar')
    expect(block).toContain('Desconciliar')
  })
})

describe('Fase 1D-f — los totales pendientes excluyen lo ya conciliado', () => {
  it('forecastTotals excluye ocurrencias con matchedExpenseId — verificado también a nivel de dominio en forecast.test.ts', () => {
    const idx = FS_DOMAIN_FORECAST.indexOf('export function forecastTotals')
    const body = FS_DOMAIN_FORECAST.slice(idx, FS_DOMAIN_FORECAST.indexOf('\n}', idx))
    expect(body).toContain('if (o.matchedExpenseId) continue')
  })

  it('PrevisionPagosTab sigue calculando "Próximos X días"/"Visión 12 meses" con forecastTotals/forecastByMonth — la exclusión llega gratis, sin tener que filtrar aparte en la pantalla', () => {
    expect(FS).toContain('const totals = forecastTotals(upcomingOccurrences)')
    expect(FS).toContain("const monthTotals = forecastByMonth(twelveMonthOccurrences, 'expectedPaymentDate')")
  })
})

describe('no se toca Hablar con PEPA en esta fase', () => {
  it('financeQuery/financeActions/talk no ganan ninguna referencia a forecast', () => {
    const talkFiles = import.meta.glob(
      ['/src/domain/financeQuery.ts', '/src/pepa/talk.ts', '/src/pepa/actions/talkActions.ts'],
      { query: '?raw', import: 'default', eager: true },
    ) as Record<string, string>
    for (const [path, text] of Object.entries(talkFiles)) {
      expect(text.toLowerCase(), `${path} no debería mencionar forecast todavía`).not.toContain('forecast')
    }
  })
})
