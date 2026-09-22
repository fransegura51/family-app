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
    for (const label of ['Mensual', 'Cada 3 meses', 'Cada 6 meses', 'Anual', 'Personalizado', '¿Se repite?', '¿Hasta cuándo?', 'Número de cuotas']) {
      expect(FS).toContain(label)
    }
  })

  it('"Personalizado" solo expone frecuencia + intervalo — nada de un editor RRULE, ni siquiera "Fin" (eso ahora es "¿Hasta cuándo?", independiente de la frecuencia)', () => {
    const idx = FS.indexOf("freqOption === 'custom' && (")
    expect(idx).toBeGreaterThan(-1)
    const block = FS.slice(idx, idx + 400)
    expect(block).toContain('Cada cuánto')
    expect(block).toContain('Cada')
    expect(block).not.toContain('Fin (opcional)') // "Fin" ya no vive dentro de "Personalizado": es "¿Hasta cuándo?", para cualquier frecuencia
  })

  it('"¿Hasta cuándo?" es una pregunta aparte, con "Número de cuotas" calculando UNTIL solo (nunca se pide al usuario)', () => {
    expect(FS).toContain('¿Hasta cuándo?')
    expect(FS).toContain('Hasta que lo desactive')
    expect(FS).toContain('Fecha concreta')
    expect(FS).not.toMatch(/>\s*UNTIL\s*</)
    expect(FS).not.toContain('>RRULE<')
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

  it('cubre "Número de cuotas" (Fase 1D-b) y "¿Cómo se cobra cada vez?" / varios cobros (Fase 1D-c/d)', () => {
    const dineroIdx = AYUDA.indexOf("'/dinero': [")
    const dineroBlock = AYUDA.slice(dineroIdx, AYUDA.indexOf("\n  ],", dineroIdx))
    expect(dineroBlock).toContain('Número de cuotas')
    expect(dineroBlock).toContain('¿Cómo se cobra cada vez?')
    expect(dineroBlock).toContain('En varios cobros')
    expect(dineroBlock).not.toMatch(/RRULE|FREQ=|UNTIL=|INTERVAL=/) // sin jerga técnica, como en el resto de la app
  })
})

describe('Fase 1D-b — planes de cuotas finitos en la UI', () => {
  it('reutiliza el puente de dominio (forecastInstallmentPlanForm.ts) — nunca calcula UNTIL/fechas a mano en el componente', () => {
    expect(FS).toContain("from '@/domain/forecastInstallmentPlanForm'")
    expect(FS).toContain('validateInstallmentCount')
    expect(FS).toContain('INSTALLMENT_COUNT_MIN')
    expect(FS).toContain('INSTALLMENT_COUNT_MAX')
    expect(FS).toContain('formatSpanishDate')
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

  it('la vista previa del plan usa expandForecastOccurrences (motor real), no un bucle de fechas hecho a mano', () => {
    const idx = FS.indexOf('Vista previa del plan (Fase 1D-b)')
    expect(idx).toBeGreaterThan(-1)
    const block = FS.slice(idx, FS.indexOf('return (', idx))
    expect(block).toContain('expandForecastOccurrences(')
    expect(block).not.toMatch(/setMonth|setDate|getMonth\(\)|getDate\(\)/) // sin aritmética de fechas manual en el componente
  })

  it('el total previsto se calcula con forecastTotals, no multiplicando importe × cuotas a mano en el JSX', () => {
    expect(FS).toContain('forecastTotals(installmentPlanOccurrences)')
  })

  it('la previa NO se muestra para "Fecha concreta" — solo para "Número de cuotas" (alcance acotado a propósito)', () => {
    const idx = FS.indexOf('installmentPlanPreviewCount != null && installmentPlanOccurrences.length > 0')
    expect(idx).toBeGreaterThan(-1)
    // installmentPlanRecurrenceRule solo se construye cuando untilMode === 'count'.
    const ruleIdx = FS.indexOf('const installmentPlanRecurrenceRule =')
    const ruleBlock = FS.slice(ruleIdx, ruleIdx + 300)
    expect(ruleBlock).toContain("untilMode === 'count'")
  })

  it('la tarjeta de gestión de un plan finito muestra importe×cuotas, frecuencia y última cuota en español (DD/MM/YYYY)', () => {
    expect(FS).toContain('cuotas')
    expect(FS).toContain('Última cuota: ${formatSpanishDate(recurrenceForm.untilDate)}')
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
  it('"¿Cómo se cobra cada vez?" es una pregunta aparte de "¿Se repite?" — no un tercer valor mezclado en la misma', () => {
    expect(FS).toContain('¿Cómo se cobra cada vez?')
    expect(FS).toContain('En un solo pago')
    expect(FS).toContain('En varios cobros')
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

  it('"Mismo importe en todos" / "Importes diferentes" — el toggle pedido, implementado sin más alcance', () => {
    expect(FS).toContain('Mismo importe en todos')
    expect(FS).toContain('Importes diferentes')
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
