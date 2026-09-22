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
  it('usa buildForecastRecurrenceRule/parseForecastRecurrenceOption del dominio, con las 6 opciones pedidas', () => {
    expect(FS).toContain('buildForecastRecurrenceRule')
    expect(FS).toContain('parseForecastRecurrenceOption')
    for (const label of ['No se repite', 'Mensual', 'Cada 3 meses', 'Cada 6 meses', 'Anual', 'Personalizado']) {
      expect(FS).toContain(label)
    }
  })

  it('"Personalizado" solo expone frecuencia + intervalo + fin — nada de un editor RRULE', () => {
    const idx = FS.indexOf("recurrenceOption === 'custom' && (")
    expect(idx).toBeGreaterThan(-1)
    const block = FS.slice(idx, idx + 900)
    expect(block).toContain('Frecuencia')
    expect(block).toContain('Cada')
    expect(block).toContain('Fin (opcional)')
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
