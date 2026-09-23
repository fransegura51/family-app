import { describe, expect, it } from 'vitest'

// Fase 1F — Reorganización final de Previsión + mejoras de análisis en Economía/Compras. Mismo patrón
// de test que forecastUiWiring.test.ts/financeUiRefunds.test.ts (sin react-testing-library/jsdom): se
// comprueba leyendo el código fuente real que las reglas pedidas quedan cableadas tal cual.
const APP = import.meta.glob(['/src/**/*.ts', '/src/**/*.tsx', '!/src/**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const FS = APP['/src/ui/FinanceScreen.tsx']
const SS = APP['/src/ui/ShoppingScreen.tsx']
const AYUDA = APP['/src/ui/AyudaScreen.tsx']

function body(src: string, startMarker: string, endMarker: string): string {
  const start = src.indexOf(startMarker)
  expect(start).toBeGreaterThan(-1)
  const end = src.indexOf(endMarker, start + startMarker.length)
  expect(end).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('Fase 1F.A/A2 — "Gestionar pagos previstos" desaparece como listado aparte', () => {
  it('ya no existe ni la función renderManagementRow ni el estado/toggle "managementOpen" (el texto solo sobrevive en comentarios explicativos)', () => {
    expect(FS).not.toContain('function renderManagementRow')
    expect(FS).not.toContain('managementOpen')
    expect(FS).not.toMatch(/&#9656; Gestionar pagos previstos|▸ Gestionar pagos previstos/)
  })

  it('Editar/Desactivar/Reactivar/Eliminar viven ahora dentro del "⋯" de cada tarjeta de "Próximos pagos"', () => {
    const b = body(FS, 'function renderOccurrenceRow', '\n  function ')
    expect(b).toContain('⋯')
    expect(b).toContain('setOccurrenceMenuKey')
    expect(b).toContain('renderPaymentPlanSummary(parent, overridesByPayment.get(parent.id) ?? [])')
    expect(b).toContain('setEditingPayment(parent)')
    expect(b).toContain('setForecastPaymentActive(parent, false).then(reload)')
    expect(b).toContain('setForecastPaymentActive(parent, true).then(reload)')
    expect(b).toContain('deleteForecastPayment(parent.calendarEventId, parent.id).then(reload)')
  })

  it('el resumen de plan/ciclo (N de M restantes, cobros por ciclo, Se renueva) sigue existiendo, solo que reubicado', () => {
    expect(FS).toContain('function renderPaymentPlanSummary')
    const b = body(FS, 'function renderPaymentPlanSummary', 'function renderOccurrenceRow')
    expect(b).toContain('{remaining} de {total} restantes')
    expect(b).toContain('cobros por ciclo')
    expect(b).toContain('Se renueva')
  })

  it('conciliados siguen con "Gestionar"/"Desconciliar" propios, sin depender del "⋯" nuevo', () => {
    expect(FS).toContain('setManaging({ expenseId: o.matchedExpenseId!, forecastCategoryId: o.categoryId })')
    expect(FS).toContain('onClick={() => unmatchOccurrence(o)}')
  })
})

describe('Fase 1F.A — "Visión 12 meses" se mueve antes del selector de horizonte', () => {
  // "Visión 12 meses" aparece 3 veces en el archivo: dos comentarios explicativos (antes en el código,
  // por construcción) y el encabezado JSX real, que es siempre el ÚLTIMO — de ahí lastIndexOf.
  it('en el código fuente, el encabezado real "Visión 12 meses" aparece ANTES del filter-row de horizonte (7d/30d/3m/12m)', () => {
    const tabIdx = FS.indexOf('function PrevisionPagosTab')
    const visionIdx = FS.lastIndexOf('Visión 12 meses')
    const horizonIdx = FS.indexOf('HORIZON_OPTIONS.map((h) =>', tabIdx)
    expect(visionIdx).toBeGreaterThan(tabIdx)
    expect(horizonIdx).toBeGreaterThan(-1)
    expect(visionIdx).toBeLessThan(horizonIdx)
  })

  it('sigue siendo horizontalmente desplazable (mismo estilo overflowX que antes) y usa monthSlots/forecastByMonth tal cual', () => {
    const visionIdx = FS.lastIndexOf('Visión 12 meses')
    const block = FS.slice(visionIdx, visionIdx + 1200)
    expect(block).toContain("overflowX: 'auto'")
    expect(block).toContain('monthSlots.map')
  })
})

describe('Fase 1F.A3 — "Préstamos e hipotecas" nunca duplica la cuota de "Próximos pagos"', () => {
  // Mismo criterio: "🏦 Préstamos e hipotecas" también aparece antes en comentarios — el botón/JSX real
  // es el último.
  it('sigue siendo un bloque complementario (capital pendiente/interés/cuotas/fecha fin), sin repetir la lista de ocurrencias', () => {
    const idx = FS.lastIndexOf('🏦 Préstamos e hipotecas')
    expect(idx).toBeGreaterThan(-1)
    const block = FS.slice(idx, idx + 2600)
    expect(block).toContain('Capital pendiente')
    expect(block).toContain('cuota')
    expect(block).not.toContain('upcomingOccurrences.map')
  })

  it('el botón usa el rótulo pedido "Ver/editar" (datos del préstamo)', () => {
    expect(FS).toContain("'Ver / editar datos del préstamo' : 'Completar datos'")
  })

  it('"Próximos pagos" viene ANTES que "Préstamos e hipotecas" en el orden final', () => {
    const tabIdx = FS.indexOf('function PrevisionPagosTab')
    const proximosIdx = FS.indexOf('Próximos pagos', tabIdx)
    const loansIdx = FS.lastIndexOf('🏦 Préstamos e hipotecas')
    expect(proximosIdx).toBeGreaterThan(-1)
    expect(loansIdx).toBeGreaterThan(proximosIdx)
  })

  it('"Posibles pagos recurrentes" queda al final, después de Préstamos e hipotecas', () => {
    const loansIdx = FS.lastIndexOf('🏦 Préstamos e hipotecas')
    const recurrenceIdx = FS.indexOf('posible{recurrenceCandidates.length', loansIdx)
    expect(recurrenceIdx).toBeGreaterThan(loansIdx)
  })
})

describe('Fase 1F.B/D — "Evolución temporal" tiene su propio selector explícito Mes real / Mes contable', () => {
  it('EvolucionTemporal tiene su propio estado "mode" (independiente del preset general) y fuerza monthStartDay=1 solo en "real"', () => {
    const b = body(FS, 'function EvolucionTemporal', 'function ExpensesTab')
    expect(b).toContain('preset: SpendRangePreset')
    expect(b).toContain("const [mode, setMode] = useState<'real' | 'contable'>(preset === 'mes_real' ? 'real' : 'contable')")
    expect(b).toContain("const effectiveMonthStartDay = mode === 'real' ? 1 : monthStartDay")
    expect(b).toContain('accountingMonthsBack(6, effectiveMonthStartDay)')
  })

  it('el selector [Mes real] [Mes contable] es explícito, con chips propios que cambian "mode" sin depender del selector general', () => {
    const b = body(FS, 'function EvolucionTemporal', 'function ExpensesTab')
    expect(b).toContain("onClick={() => setMode('real')}")
    expect(b).toContain("onClick={() => setMode('contable')}")
    expect(b).toContain('Mes real')
    expect(b).toContain('Mes contable')
  })

  it('en modo Mes contable se enseña el rango exacto de cada periodo (fecha de corte real, no aproximada)', () => {
    const b = body(FS, 'function EvolucionTemporal', 'function ExpensesTab')
    expect(b).toContain("mode === 'contable' && (")
    expect(b).toContain('{formatSpanishDate(r.from)} – {formatSpanishDate(r.to)}')
  })

  it('"Ver" usa siempre r.from/r.to del periodo exacto que se está mostrando (cambia solo con el mode activo)', () => {
    const b = body(FS, 'function EvolucionTemporal', 'function ExpensesTab')
    expect(b).toContain("onClick={() => onViewMovements({ label: `Movimientos — ${r.label}`, from: r.from, to: r.to })}")
  })

  it('reutiliza accountingMonthsBack/dateRanges.ts tal cual — nunca una segunda implementación de mes contable', () => {
    const b = body(FS, 'function EvolucionTemporal', 'function ExpensesTab')
    expect(b).not.toMatch(/setMonth|setDate|getMonth\(\)|getDate\(\)/)
  })

  it('EstadisticasTab le sigue pasando el preset general solo como valor inicial — no rompe el selector "📅 Fecha"', () => {
    const b = body(FS, 'function EstadisticasTab', 'function PeriodComparison')
    expect(b).toContain('<EvolucionTemporal expenses={expenses} categories={categories} monthStartDay={monthStartDay} preset={preset} onViewMovements={onViewMovements} />')
  })
})

describe('Fase 1F.C — "Comparado con el periodo anterior"', () => {
  it('reutiliza comparablePrevious (financePeriod.ts) y groupSpending (financeCompute.ts), nunca reimplementa la aritmética de mes contable', () => {
    const b = body(FS, 'function PeriodComparison', 'function EvolucionTemporal')
    expect(b).toContain('comparablePrevious(currentPeriod, today, effectiveMonthStartDay)')
    expect(b).toContain('groupSpending(previousRows, financeData)')
    expect(b).toContain('groupSpending(currentRows, financeData)')
  })

  it('excluye movimientos internos y solo cuenta gasto real (nunca ingresos)', () => {
    const b = body(FS, 'function PeriodComparison', 'function EvolucionTemporal')
    expect(b).toContain("e.kind === 'real' && !e.isIncome && !isInternalTransferCategory(e.category, categories)")
  })

  it('anterior=0 nunca da un porcentaje infinito: se marca "Nuevo gasto en este periodo"', () => {
    const b = body(FS, 'function PeriodComparison', 'function EvolucionTemporal')
    expect(b).toContain('isNew: before === 0 && after > 0')
    expect(b).toMatch(/d\.isNew\s*\n?\s*\?\s*'Nuevo gasto en este periodo'/)
    expect(b).not.toMatch(/before === 0[^}]*after \/ before/)
  })

  it('composición visual: "antes → después" y "delta (%)" son dos unidades que nunca se parten por dentro (whiteSpace nowrap), nunca separan un número de su €', () => {
    const b = body(FS, 'function PeriodComparison', 'function EvolucionTemporal')
    expect(b).toContain("<span style={{ whiteSpace: 'nowrap' }}>")
    expect(b).toContain("whiteSpace: d.isNew ? 'normal' : 'nowrap'")
    // El nombre de categoría va en su propia línea, no compartiendo fila con los importes (evita que el
    // bloque numérico se quede con poco ancho en pantallas estrechas).
    const rowFnIdx = b.indexOf('function row(d: CategoryDelta)')
    expect(rowFnIdx).toBeGreaterThan(-1)
    const rowFnBody = b.slice(rowFnIdx, rowFnIdx + 900)
    expect(rowFnBody).not.toContain("justifyContent: 'space-between'")
  })

  it('ambos a 0 nunca se enseñan (se filtran antes de construir aumentos/descensos)', () => {
    const b = body(FS, 'function PeriodComparison', 'function EvolucionTemporal')
    expect(b).toContain('.filter((d) => d.before > 0 || d.after > 0)')
  })

  it('aumentos primero, descensos después, con un top curado (no un volcado de 30 filas)', () => {
    const b = body(FS, 'function PeriodComparison', 'function EvolucionTemporal')
    expect(b).toContain('.sort((a, b) => b.delta - a.delta).slice(0, 4)')
    expect(b).toContain('.sort((a, b) => a.delta - b.delta).slice(0, 4)')
    const increasesIdx = b.indexOf('📈 Has gastado más')
    const decreasesIdx = b.indexOf('📉 Has gastado menos')
    expect(increasesIdx).toBeGreaterThan(-1)
    expect(decreasesIdx).toBeGreaterThan(increasesIdx)
  })

  it('nunca usa IA/Gemini para el cálculo — solo aritmética de código', () => {
    const b = body(FS, 'function PeriodComparison', 'function EvolucionTemporal')
    expect(b).not.toMatch(/gemini|generateContent|callAi|askPepa/i)
  })
})

describe('Fase 1F.D — "¿Por qué ha cambiado mi gasto?" se muda de Economía a Compras', () => {
  it('ya no existe en FinanceScreen.tsx (Economía)', () => {
    expect(FS).not.toContain('PorQueHaCambiadoMiGasto')
    expect(FS).not.toContain('¿Por qué ha cambiado mi gasto?')
  })

  it('existe EXACTAMENTE una vez en ShoppingScreen.tsx (Compras), con el mismo cálculo (decomposeSpendChange/compareMonths/averagePricesByMonth)', () => {
    expect(SS.match(/function PorQueHaCambiadoMiCompra/g)?.length).toBe(1)
    expect(SS.match(/<PorQueHaCambiadoMiCompra/g)?.length).toBe(1)
    const b = body(SS, 'function PorQueHaCambiadoMiCompra', 'function ')
    expect(b).toContain('decomposeSpendChange(purchases, currentMonth, previousMonth)')
    expect(b).toContain('compareMonths(averagePricesByMonth(purchases)')
  })

  it('sigue usando solo cesta de tickets de alimentación (isFoodPurchase), nunca movimientos del banco para la cesta', () => {
    const b = body(SS, 'function ComprasInicioTab', 'function PorQueHaCambiadoMiCompra')
    expect(b).toContain('isFoodPurchase(p, foodReceiptIds, nonFoodProductIds, foodProductIds)')
    expect(b).not.toContain('listExpenses')
  })
})

describe('Fase 1F.E — Inicio de Compras: nuevo bloque de análisis bajo los 4 accesos', () => {
  it('mantiene los 4 accesos existentes y añade "🛒 PEPA analiza tus compras" (nunca "Conclusiones de Pepa")', () => {
    const b = body(SS, 'function ComprasInicioTab', 'function PorQueHaCambiadoMiCompra')
    expect(b).toContain("{ tab: 'Lista', body:")
    expect(b).toContain("{ tab: 'Historial', body:")
    expect(b).toContain("{ tab: 'Tickets', body:")
    expect(b).toContain("{ tab: 'Estadística compras', body:")
    expect(b).toContain('🛒 PEPA analiza tus compras')
    expect(b).not.toContain('Conclusiones de Pepa')
  })

  it('"Estadística compras" (BudgetsTab) sigue siendo la pantalla detallada aparte, sin tocar', () => {
    expect(SS).toContain("<BudgetsTab group=\"alimentacion\" seedCategories={[]} onViewMovements={handleViewMovements} />")
  })

  it('la imagen de PEPA en el súper no existe todavía en el repo — se deja documentado, sin inventar ni importar un archivo inexistente', () => {
    const b = body(SS, 'function ComprasInicioTab', 'function PorQueHaCambiadoMiCompra')
    expect(b).toContain('todavía no existe en el repo')
    // Ningún import nuevo de una imagen "pepa" además del ya existente compras-header.
    expect((SS.match(/from '@\/assets\/compras\//g) ?? []).length).toBe(1)
  })
})

describe('Fase 1F.F — "Dinero destinado a cuentas de ahorro" (ahorro destinado)', () => {
  it('reutiliza computeSavingsDestinedByMember (domain/finance.ts) — nunca reimplementa el filtro en el componente', () => {
    expect(FS).toContain('computeSavingsDestinedByMember')
    const b = body(FS, 'Fase 1F.F', 'return (')
    expect(b).toContain('const savingsDestinedByMember = computeSavingsDestinedByMember(')
    expect(b).toContain('inRange,')
    expect(b).toContain('categories,')
  })

  it('Fase 1F.B — prioriza la salida resuelta estructuralmente (IBAN, RPC), la entrada es solo fallback', () => {
    expect(FS).toContain('listResolvedInternalTransferDestinations')
    expect(FS).toContain('resolvedTransferOutInRange')
    // Filtrado por el mismo periodo que inRange, nunca todo el histórico sin acotar.
    expect(FS).toContain('resolvedTransferOut.filter((o) => o.expenseDate >= from && o.expenseDate <= to)')
  })

  it('nunca toca la fórmula de ahorro existente (ahorro/tasaAhorro se calculan antes, sin depender de savingsDestinedByMember)', () => {
    const ahorroIdx = FS.indexOf('computePeriodFinancials(inRange, categories)')
    const savingsIdx = FS.indexOf('const savingsDestinedByMember')
    expect(ahorroIdx).toBeGreaterThan(-1)
    expect(savingsIdx).toBeGreaterThan(ahorroIdx)
    const betweenAhorroFormulaAndSavings = FS.slice(ahorroIdx, savingsIdx)
    expect(betweenAhorroFormulaAndSavings).not.toContain('savingsDestined')
  })

  it('usa una terminología conservadora — nunca afirma que el dinero se generó este periodo', () => {
    expect(FS).toContain('Dinero destinado a cuentas de ahorro')
    expect(FS).not.toContain('De tu ahorro de este mes')
    expect(FS).toContain('Puede incluir ahorro acumulado en periodos anteriores')
  })

  it('es un bloque aparte de la tarjeta de Ahorro, solo se muestra si hay algo que enseñar', () => {
    expect(FS).toContain('{savingsDestinedRows.length > 0 && (')
  })
})

describe('Fase 1F — Ayuda actualizada (mismo commit)', () => {
  it('Previsión de pagos: la Ayuda ya no describe "Gestionar pagos previstos" como listado aparte, describe el "⋯" de cada tarjeta', () => {
    const dineroIdx = AYUDA.indexOf("'/dinero': [")
    const dineroBlock = AYUDA.slice(dineroIdx, AYUDA.indexOf('\n  ],', dineroIdx))
    expect(dineroBlock).toContain('"⋯" con las acciones sobre el pago completo')
    expect(dineroBlock).not.toMatch(/En "Gestionar pagos previstos"/)
  })

  it('Estadísticas: la Ayuda explica "Comparado con el periodo anterior" y el selector propio [Mes real] [Mes contable] de Evolución temporal', () => {
    const dineroIdx = AYUDA.indexOf("'/dinero': [")
    const dineroBlock = AYUDA.slice(dineroIdx, AYUDA.indexOf('\n  ],', dineroIdx))
    expect(dineroBlock).toContain('Comparado con el periodo anterior')
    expect(dineroBlock).toContain('Nuevo gasto en este periodo')
    expect(dineroBlock).toContain('su propio selector [Mes real] [Mes contable]')
  })

  it('Resumen: la Ayuda explica "Dinero destinado a cuentas de ahorro"', () => {
    const dineroIdx = AYUDA.indexOf("'/dinero': [")
    const dineroBlock = AYUDA.slice(dineroIdx, AYUDA.indexOf('\n  ],', dineroIdx))
    expect(dineroBlock).toContain('🏦 Dinero destinado a cuentas de ahorro')
    expect(dineroBlock).toContain('Lo identifica con el IBAN que ya trae el propio banco')
  })

  it('Compras: la Ayuda tiene una entrada propia para "🛒 PEPA analiza tus compras", con "¿Por qué ha cambiado mi compra?" mudado desde Economía', () => {
    const comprasIdx = AYUDA.indexOf("'/compras': [")
    const comprasBlock = AYUDA.slice(comprasIdx, AYUDA.indexOf('\n  ],', comprasIdx))
    expect(comprasBlock).toContain('🛒 PEPA analiza tus compras')
    expect(comprasBlock).toContain('¿Por qué ha cambiado mi compra?')
  })
})

describe('Fase 1F.G — fechas visibles en español donde se tocó', () => {
  it('el periodo de Estadísticas ya no enseña ISO crudo', () => {
    expect(FS).toContain('const periodLabel = `${PRESET_LABELS[preset]} (${formatSpanishDate(from)} a ${formatSpanishDate(to)})`')
  })

  it('"Próximos pagos" enseña la fecha en español, no el ISO de dueDate/expectedPaymentDate', () => {
    expect(FS).toContain(
      '{sameDates ? formatSpanishDate(o.dueDate) : `Pago previsto: ${formatSpanishDate(o.expectedPaymentDate)} · Vence: ${formatSpanishDate(o.dueDate)}`}',
    )
  })

  it('el resumen de un pago sin plan ni ciclo también usa formatSpanishDate para "Vence"', () => {
    expect(FS).toContain('Vence: {formatSpanishDate(p.dueDate)}')
  })
})
