import { describe, expect, it } from 'vitest'

// FASE 6D.3 — UI / Economía / consistencia visual del Modelo C de Devoluciones. El componente no se renderiza (este proyecto no
// tiene react-testing-library/jsdom: el resto de guardas de FinanceScreen.tsx también se auditan por texto, ver refundsGuards.test.ts);
// aquí se comprueba que cada sitio que representa "Ingresos"/"Devoluciones"/"Gasto neto"/"Balance" usa los helpers de dominio
// centrales (isRealIncome, isRefund, domain/financeCompute.ts y domain/refunds.ts) en vez de reimplementar la identidad de una
// devolución — la verificación visual con datos reales se hizo a mano en el navegador (ver informe de la fase).
const FILES = import.meta.glob(['/src/ui/FinanceScreen.tsx', '/src/ui/EventosScreen.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
// .replace: un checkout en Windows puede guardar el archivo con CRLF; los \n literales de abajo
// deben seguir encontrándolo igual.
const FS = FILES['/src/ui/FinanceScreen.tsx'].replace(/\r\n/g, '\n')
const EVENTOS = FILES['/src/ui/EventosScreen.tsx']
const APP_DOMAIN = import.meta.glob('/src/domain/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const FUNCTIONS = import.meta.glob('/supabase/functions/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

function body(text: string, startMarker: string, endMarker: string): string {
  const start = text.indexOf(startMarker)
  const end = text.indexOf(endMarker, start)
  expect(start, `no encuentro "${startMarker}"`).toBeGreaterThanOrEqual(0)
  expect(end, `no encuentro "${endMarker}" después de "${startMarker}"`).toBeGreaterThan(start)
  return text.slice(start, end)
}

describe('2. no se duplica la identidad de dominio: FinanceScreen usa isRealIncome/isRefund, nunca las reimplementa', () => {
  it('importa los helpers centrales, no una copia propia', () => {
    // Corrección — ahora import junto a computePeriodFinancials (misma función compartida de
    // Resumen/Evolución temporal), pero isRealIncome se sigue importando de financeCompute, no
    // reimplementado.
    expect(FS).toMatch(/import\s*\{\s*computePeriodFinancials,\s*isRealIncome,\s*isRealSpending\s*\}\s*from\s*'@\/domain\/financeCompute'/)
    expect(FS).toMatch(/import\s*\{\s*isRefund\s*\}\s*from\s*'@\/domain\/refunds'/)
  })
})

describe('A/D. Movimientos y Banco: "Ingresos" excluye devoluciones; "Devoluciones" es su propio filtro', () => {
  it('BankTab: el filtro "ingresos" usa isRealIncome; "devoluciones" usa isRefund', () => {
    const b = body(FS, 'function BankTab(', 'function DateFilterTab(')
    expect(b).toContain("if (typeFilter === 'ingresos') return isRealIncome(e, categories)")
    expect(b).toContain("if (typeFilter === 'devoluciones') return isRefund(e, categories)")
    expect(b).toMatch(/'todos' \| 'fijos' \| 'variables' \| 'ingresos' \| 'devoluciones' \| 'categoria' \| 'busqueda' \| 'pendientes'/)
  })

  it('ExpensesTab (Movimientos): el filtro "ingresos" usa isRealIncome; "devoluciones" usa isRefund', () => {
    const b = body(FS, 'function ExpensesTab(', 'function movementRowColor(')
    expect(b).toContain("if (typeFilter === 'ingresos') return isRealIncome(e, categories)")
    expect(b).toContain("if (typeFilter === 'devoluciones') return isRefund(e, categories)")
    // La cabecera "X € gastados · +Y € ingresados" (monthIncome) tampoco cuenta una devolución.
    expect(b).toContain('accountFilteredExpenses.filter((e) => isRealIncome(e, categories))')
  })

  it('TYPE_FILTER_OPTIONS incluye Devoluciones, junto a Ingresos y Pendientes', () => {
    const idx = { ingresos: FS.indexOf("{ key: 'ingresos'"), devoluciones: FS.indexOf("{ key: 'devoluciones'"), pendientes: FS.indexOf("{ key: 'pendientes'") }
    expect(idx.ingresos).toBeGreaterThan(0)
    expect(idx.devoluciones).toBeGreaterThan(idx.ingresos)
    expect(idx.pendientes).toBeGreaterThan(idx.devoluciones)
  })

  it('"Ver registros →" de Ingresos (el filtro isIncome:true que llega a Movimientos) tampoco cuenta una devolución', () => {
    const b = body(FS, 'function ExpensesTab(', 'function movementRowColor(')
    expect(b).toContain('if (filter.isIncome === true && isRefund(e, categories)) return false')
  })
})

describe('B. una devolución sigue visible en "Todos" (nunca se oculta del historial)', () => {
  it("el filtro 'todos' sigue devolviendo true sin condiciones, en Banco y Movimientos", () => {
    const matches = [...FS.matchAll(/if \(typeFilter === 'todos'\) return true/g)]
    expect(matches.length).toBe(2) // BankTab + ExpensesTab
  })
  it('refundsOnly (como pendingOnly) es un filtro lógico aparte, no una exclusión del listado general', () => {
    expect(FS).toContain('refundsOnly?: boolean')
    expect(FS).toContain('if (filter.refundsOnly && !isRefund(e, categories)) return false')
  })
})

describe('C. una devolución nunca cuenta como gasto (is_income=true, fuera de !e.isIncome)', () => {
  it('ResumenTab: totalSpent/refundsTotal/netSpent salen de computePeriodFinancials (misma función que Evolución temporal), no de una fórmula propia', () => {
    const b = body(FS, 'function ResumenTab(', 'function PepaConclusionsWidget(')
    expect(b).toContain(
      'const { income: totalIncome, spent: totalSpent, refunds: refundsTotal, netSpent, ahorro } = computePeriodFinancials(inRange, categories)',
    )
    // La propia función compartida (financeCompute.ts) es la que de verdad define totalSpent como gasto
    // BRUTO (isRealSpending: !e.isIncome, nunca resta la devolución) y netSpent como spent - refunds.
    const financeCompute = APP_DOMAIN['/src/domain/financeCompute.ts']
    const fnBody = body(financeCompute, 'export function computePeriodFinancials', '\n}')
    expect(fnBody).toContain('rows.filter((e) => isRealSpending(e, categories))')
    expect(fnBody).toContain('rows.filter((e) => isRefund(e, categories))')
    expect(fnBody).toContain('const netSpent = spent - refunds')
  })
})

describe('E-I. Resumen: ingresos reales, gasto bruto, devoluciones, gasto neto y balance (Modelo C)', () => {
  it('totalIncome usa isRealIncome (ingreso real, sin devoluciones); ahorro = totalIncome - netSpent (misma invariante que PEPA), vía computePeriodFinancials', () => {
    const b = body(FS, 'function ResumenTab(', 'function PepaConclusionsWidget(')
    expect(b).toContain('computePeriodFinancials(inRange, categories)')
    const financeCompute = APP_DOMAIN['/src/domain/financeCompute.ts']
    const fnBody = body(financeCompute, 'export function computePeriodFinancials', '\n}')
    expect(fnBody).toContain('rows.filter((e) => isRealIncome(e, categories))')
    expect(fnBody).toContain('ahorro: income - netSpent')
  })

  it('la tarjeta SOLO añade Devoluciones/Gasto neto cuando refundsTotal > 0 (si refunds = 0, la tarjeta no cambia)', () => {
    const b = body(FS, 'function ResumenTab(', 'function PepaConclusionsWidget(')
    expect(b).toContain('{refundsTotal > 0 && (')
    expect(b).toContain('Devoluciones: +{refundsTotal.toFixed(2)} €')
    expect(b).toContain('Gasto neto: <strong>{netSpent.toFixed(2)} €</strong>')
    // Ingresos/Gastos (bruto) se muestran SIEMPRE, tal cual, fuera del condicional de devoluciones.
    expect(b.indexOf('Ingresos: +{totalIncome.toFixed(2)}')).toBeLessThan(b.indexOf('{refundsTotal > 0 && ('))
    expect(b.indexOf('Gastos: -{totalSpent.toFixed(2)}')).toBeLessThan(b.indexOf('{refundsTotal > 0 && ('))
  })

  it('el enlace de Devoluciones lleva a Movimientos con refundsOnly (nunca a un filtro de Ingresos)', () => {
    const b = body(FS, 'function ResumenTab(', 'function PepaConclusionsWidget(')
    expect(b).toContain("onViewMovements({ label: `Devoluciones — ${PRESET_LABELS[preset]}`, from, to, refundsOnly: true })")
  })
})

describe('9. Ahorro/Balance: solo cambia la etiqueta cuando es negativo, nunca la fórmula', () => {
  it('Resumen y Evolución temporal dicen "Balance" en vez de "Ahorro" cuando el importe es negativo', () => {
    expect(FS).toContain("<strong>{ahorro >= 0 ? 'Ahorro' : 'Balance'}: {ahorro.toFixed(2)} €</strong>")
    expect(FS).toContain("{r.ahorro >= 0 ? 'Ahorro' : 'Balance'}: {r.ahorro.toFixed(2)} €")
  })
  it('la fórmula del ahorro no cambia: Evolución temporal usa la misma computePeriodFinancials que Resumen (ingresos - gasto neto)', () => {
    // Fase 1F.D — "¿Por qué ha cambiado mi gasto?" se mudó a Compras (PorQueHaCambiadoMiCompra, ShoppingScreen.tsx);
    // el siguiente componente en FinanceScreen.tsx es ahora ExpensesTab.
    const b = body(FS, 'function EvolucionTemporal(', 'function ExpensesTab(')
    expect(b).toContain('computePeriodFinancials(inMonth, categories)')
    const financeCompute = APP_DOMAIN['/src/domain/financeCompute.ts']
    const fnBody = body(financeCompute, 'export function computePeriodFinancials', '\n}')
    expect(fnBody).toContain('ahorro: income - netSpent')
  })
})

describe('12/13/N. Gráficos y ranking de categorías: siguen en gasto BRUTO, sin atribuir devoluciones', () => {
  it('EstadisticasTab (dónuts, D/N/Q, fijo/variable) sigue construyéndose solo con !e.isIncome (una devolución nunca entra)', () => {
    const b = body(FS, 'function EstadisticasTab(', 'function EvolucionTemporal(')
    // Una sola definición de gasto real (isRealSpending: real, no ingreso, no movimiento interno) para TODAS las estadísticas.
    expect(b).toContain('const real = expenses.filter(\n    (e) => isRealSpending(e, categories) && e.expenseDate >= from && e.expenseDate <= to,\n  )')
    expect(b).not.toMatch(/isRefund|refundsTotal|netSpent/)
  })
})

describe('14/O. Presupuesto General: sigue consumiéndose con gasto BRUTO (decisión 6D.3, sin cambios)', () => {
  it('totalSpent/byCategoryFlat de BudgetsOverview no descuentan devoluciones (siguen en !e.isIncome, sin isRefund)', () => {
    const b = body(FS, 'function BudgetsOverview(', 'async function handleDeleteIncome')
    expect(b).toContain("const totalSpent = inRange\n    .filter((e) => !e.isIncome && e.kind === 'real' && !isInternalTransferCategory(e.category, allCategories))")
    expect(b).not.toMatch(/totalSpent.*isRefund|isRefund.*totalSpent/)
  })

  it('pero "Ingresos" (totalIncome, manual y bancario) sí excluye una devolución — no es gasto de presupuesto, es la cifra de Ingresos', () => {
    const b = body(FS, 'function BudgetsOverview(', 'async function handleDeleteIncome')
    expect(b).toContain("e.source === 'manual' && !isRefund(e, allCategories)")
    expect(b).toContain('!isInternalTransferCategory(e.category, allCategories) && !isRefund(e, allCategories)')
  })
})

describe('S. EventosScreen: auditado — sus 4 apariciones son el GASTO de un evento, nunca "ingreso real"', () => {
  it('las 4 siguen siendo !e.isIncome (gasto), documentadas, sin isRealIncome (no aplica: no es ingreso)', () => {
    const matches = [...EVENTOS.matchAll(/\.filter\(\(e\) => e\.tagId === event\.tagId && !e\.isIncome && !isInternalTransferCategory\(e\.category, categories\)\)/g)]
    expect(matches.length).toBe(4)
    expect(EVENTOS).toContain('FASE 6D.3 — auditoría')
    // No se USA isRealIncome (no aplica: esto es gasto, no ingreso) — solo se menciona en el comentario de auditoría.
    expect(EVENTOS).not.toMatch(/isRealIncome\(/)
  })
})

describe('monthSharedDeposits (piso compartido): semántica distinta documentada, intencionalmente sin tocar', () => {
  it('sigue sin pasar por isRealIncome/isRefund, con la razón explicada in situ', () => {
    const b = body(FS, 'const monthSharedDeposits = scopedExpenses.filter(', 'function periodLabelForTitle(')
    expect(FS).toContain('esto NO es "ingreso real familiar" (isRealIncome)')
    expect(b).not.toMatch(/isRealIncome\(/)
  })
})

describe('24/M. Cobro anulado: nunca aparece en Ingresos, Gastos, Devoluciones ni Gasto neto', () => {
  it('isInternalTransferCategory (que excluye Cobro anulado, hijo de Movimientos internos) sigue delante de cada total tocado', () => {
    expect(FS).toContain('const real = inRange.filter((e) => e.kind === \'real\' && !isInternalTransferCategory(e.category, categories))')
  })
})

describe('28. no se reescribe PEPA 6D.2: solo se comparten los mismos helpers de dominio', () => {
  it('domain/financeCompute.ts y domain/refunds.ts no se han tocado en esta fase (mismo contrato que consume PEPA)', () => {
    expect(FS).not.toMatch(/export function answerRefunds|export function totalRefunds/)
  })
})

describe('29/30. no banco, no migración, no cambios de datos', () => {
  it('sin migración de datos nueva de la Fase 6D.2/6D.3 en sí: las posteriores son de otras fases, ya auditadas cada una en su sitio', () => {
    // 0153-0166: ver detalle en el historial de este archivo. 0167 (reclassify_commission_reversal_pair_202609,
    // FASE CA-4) es la corrección puntual del par comisión+bonificación de septiembre — un UPDATE de 2 filas
    // por id exacto, no de 6D.2/6D.3, auditada y con su propio test (commissionReversalMigration202609.test.ts).
    // 0168 (receipt_dedup_fingerprint) añade columnas de huella a `receipts` para evitar tickets duplicados —
    // tampoco toca devoluciones, auditada en mercadonaTicketDedup.test.ts.
    // 0169 (event_budget_item_amount_optional, cola nocturna Bloque 11) solo relaja una restricción NOT NULL
    // en event_budget_items.planned_amount — tabla de Eventos, nada que ver con devoluciones/refunds.
    // 0170 (date_filter_user_preferences, Configuración → Filtros temporales) añade 2 columnas nuevas a
    // `profiles` (favorito/desactivados de fecha) — tampoco toca devoluciones.
    // 0171 (forecast_payment_document_import, "Importar desde foto o documento" en Previsión de pagos)
    // añade 3 columnas a `forecast_payments` y un bucket de Storage nuevo — tampoco toca devoluciones.
    // 0172 (event_planning_context, Fase 1 del "inicio inteligente" de Eventos) añade
    // `events.included_services` — tabla de Eventos, nada que ver con devoluciones/refunds.
    // 0173 (forecast_reconciliation_category_inherit) redefine match_forecast_occurrence para heredar la
    // categoría de la previsión al confirmar — toca conciliación, nunca la identidad/cálculo de una
    // devolución. 0174 (forecast_reconciliation_dismissals) añade una tabla nueva para persistir "No es
    // este" — tampoco toca devoluciones. 0175 (location_places_category, Ubicación: categoría libre por
    // lugar guardado) añade `location_places.category` — tabla de Ubicación, tampoco toca devoluciones.
    // 0176 (event_decisions_and_moments, Fase 1 del motor de decisiones + momentos de Eventos) añade
    // tablas y columnas nuevas en Eventos — tampoco toca devoluciones.
    // 0177 (event_moment_location_details, cierre de Fase 2 — Google Maps) añade dirección/place_id a
    // event_moments — tampoco toca devoluciones.
    // 0178 (location_places_notify_arrivals, Ubicación: avisar al llegar/irse de un lugar) añade
    // location_places.notify_arrivals — tabla de Ubicación, tampoco toca devoluciones.
    // 0179 (event_decision_providers, Fase 3 "La pareja" de Eventos) añade la relación muchos-a-muchos
    // decisión↔proveedor — tabla de Eventos, tampoco toca devoluciones.
    // 0180 (alexa_account_linking, integración con Alexa) añade alexa_links/alexa_auth_codes —
    // tampoco toca devoluciones. 0181 (alexa_account_linking_drop) la deshace por completo —
    // tampoco toca devoluciones. 0182 (store_chains_logo_and_shopping_link, catálogo global de cadenas
    // para Compras) añade store_chains.logo_asset y shopping_stores.chain_key — tampoco toca devoluciones.
    // 0183 (store_chains_catalog_expansion) añade más cadenas al mismo catálogo — tampoco devoluciones.
    // 0184 (calendar_tasks_categories, FASE CALENDARIO) añade kind/categorías/preferencias al
    // Calendario — tampoco devoluciones. 0185 (calendar_color_mode_three_modes) solo cambia el CHECK y
    // el default de profiles.calendar_color_mode — tampoco. 0186 (server_side_automations) añade
    // tablas de estado de automatizaciones y un trigger en member_locations — tampoco devoluciones.
    // 0187 (calendar_task_completion_prefs_and_privacy_fixes, RETOQUE Calendario) añade preferencias de
    // Tareas completadas a profiles y corrige privacidad de recordatorios/adjuntos — tampoco devoluciones.
    // 0188 (send_test_push) añade push_test_log y una función de aviso de prueba — tampoco devoluciones.
    // 0189 (event_guest_menu_choice, Parte B de Eventos) añade event_menu_options y columnas de elección de
    // menú a event_guest_members — tabla de Eventos, tampoco toca devoluciones. 0190
    // (event_guest_questions, "Preguntas a los invitados") añade event_guest_questions/_options/_answers
    // — tablas de Eventos, tampoco toca devoluciones. 0191 (venue_address/venue_place_id) añade dos
    // columnas a `events` — tabla de Eventos, tampoco toca devoluciones. 0192 (event_food_and_drink, Comida y bebida) añade tablas y columnas de Eventos — tampoco toca devoluciones. 0193 (event_moment_date_status) añade una columna a event_moments — tampoco devoluciones.
    const numbers = Object.keys(MIGRATIONS)
      .map((f) => Number(f.match(/(\d{4})_/)?.[1]))
      .filter((n) => !Number.isNaN(n))
    // 0197 (recordatorios de Calendario: claim_due_reminders y reminder_deliveries) no toca esta funcionalidad.
    // 0213/0214 (puente con OwnTracks y su retirada), 0215 (Encargos: resolución con proveedor/precio) y
    // 0216 (Personas especiales/Familiares) no tocan esta funcionalidad. 0217 (pista de familia duplicada
    // al unirse con código), 0218/0219 (vínculo rol↔persona en detalles especiales/tareas de Eventos), 0220
    // (historial de resolución de encargos), 0221 (provider_name en event_payments, snapshot del nombre
    // del proveedor en el pago) y 0222 (ficha ampliada de event_providers: contacto/teléfono/email/web/
    // dirección/archivado) y 0223 (ofertas de proveedores por encargo, event_task_group_offers — tabla
    // nueva, no toca event_payments ni event_budget_items) y 0224 (registro global de proveedores —
    // providers_global/event_provider_links, tablas nuevas; event_providers solo gana una columna
    // global_provider_id, sus FK existentes no cambian) tampoco tocan esta funcionalidad.
    // 0226 (registro de uso por cuenta para el panel de propietaria), 0227 (servicios estructurados y
    // versionado de ofertas de proveedores, event_task_group_offer_items — tabla nueva) y 0228 (trazabilidad
    // oferta→encargo, offer_id en event_task_groups/event_task_group_resolutions) tampoco tocan esta funcionalidad.
    expect(Math.max(...numbers)).toBe(353) // 0349-0353: Gestión de grupos y botes compartidos (grupos, participantes, botes, copias entre espacios, enlaces de consulta, función de IA). 0348: clases Muebles y organización y Manualidades y creatividad y categoría Vivienda y hogar → Muebles y organización (COR-06; aditiva, con reversión). 0347: reaprobar un menú conserva su semana prevista; 0346: señal en vivo del Centro Editorial; 0345: reprogramar encuestas; 0344: alcances de rectificación. 0343: preferencias de la familia (family_prefs; modo y orden del Comparador, mismo motor que user_prefs). 0342: lo que la familia quita del catalogo general no se le vuelve a poner (tabla pequena con RLS, dos disparadores de borrado y funcion para recuperarlo; aditiva, con reversion); 0341: cambiar nombre o icono de una categoria sin perder datos (funcion con permisos de quien la llama; aditiva); 0340: origen de la categoria de cada movimiento (dos columnas opcionales en expenses y un disparador que marca como manual lo que cambia una persona; aditiva, con reversion); 0339: ampliacion del catalogo de Economia (ocho categorias nuevas; aditiva, con reversion); 0338: el catalogo general llega solo a todas las familias (funciones y disparadores de sincronizacion; consolida duplicados equivalentes guardando el estado anterior; aditiva); 0337: preferencias del Comparador (amplia la lista cerrada de claves de preferencias); 0336: identidad del producto confirmada por la familia (una columna opcional en products; aditiva, no toca datos existentes); 0335: Centro de Control de IA (aditiva, con reversión); 0334: catálogo maestro de productos (tres clases nuevas en catalog_food_types y en las clases de las familias; aditiva, no toca datos existentes); 0333: agrupación automática del comparador (una columna con valor por defecto, un valor más permitido en source y una tabla nueva con RLS; no toca datos existentes); 0332: reparto de un gasto entre varias clasificaciones de Compras (tabla nueva con RLS, función con permisos y disparadores aditivos; no toca datos existentes); 0331: productos comunes del comparador (tablas nuevas con RLS por familia y columna ean; no toca datos existentes); 0330: formato del envase en product_prices (cuatro columnas opcionales; no cambia ningún precio); 0324: sincronización entre dispositivos (publica tablas en Realtime; no cambia datos ni políticas); 0323: orden propio de los platos del menú (una columna con valor por defecto, aditiva); 0322: varias etiquetas por movimiento con reparto (tabla nueva, función y tres disparadores sobre expenses; vincular compra y cargo del banco conserva el reparto; no cambia ningún dato existente); 0321: Mis listas (tablas, funciones y disparador nuevos; solo un disparador sobre shopping_items que actualiza elementos de las listas; aditiva); 0318: retiradas de efectivo (categoría «Retirada de efectivo», reparto entre carteras, vincular compra y cargo del banco sin perder la etiqueta; funciones nuevas o sustituidas, no toca políticas ni datos existentes); 0317: quién puede ver cada documento (dos columnas nuevas y políticas de member_documents y de los archivos de documentos reemplazadas; probada en la base real); 0316: aviso a adultos de solicitudes de recompensa (función y disparador nuevos, aditiva); 0315: avisos de cumpleaños (funciones nuevas y tarea programada, aditiva); 0314: peso objetivo para quien no es administradora (función nueva, aditiva); 0313: confirmar llegadas pendientes estando parado (trabajo cada minuto); 0310-0312: compras manuales, equivalencias de producto y efectivo/pagos mixtos/devoluciones (tablas y funciones nuevas; 0312b recorta permisos de las tablas nuevas; no tocan políticas de tablas existentes ni datos de las familias); 0312: confirmar llegadas pendientes parado (trabajo cada minuto, funciones de solo lectura + reclamo atómico); 0309: corregir o anular puntos concedidos por error (columna kind en point_grants, política de insert más estricta y función adjust_point_grant; aditiva, aplicada el 23/10/2026; la 0308 de aprendizaje compartido está aplicada en producción y pendiente de commit en otra sesión); 0307: «Actividad reciente»: un update que no cambia nada ya no se anota (solo reemplaza la función del disparador log_activity, aditiva; la 0306 sigue PENDIENTE en supabase/pending-migrations); 0305: preferencias por persona, una fila por preferencia (CONFIG-01; tabla y funciones nuevas, no toca tablas ni políticas existentes); 0304: cada persona adulta edita su ficha y la de sus hijos/as (dos funciones nuevas, no toca políticas); 0303: endurecimiento de las cuentas y el PIN (retira el reinicio por administradora y el «quitar PIN» sin comprobar; solo revoca permisos y endurece set_own_pin); 0302: primero la invitación, después la cuenta (comprobación pública, gancho de alta, limpieza de huérfanos; aditiva); 0301: dar acceso a PEPA, rol/secciones de la ficha, bloqueo y reserva, blindaje de columnas de invitación; 0300: vínculo parental «Es mi hijo/a» (tablas nuevas); 0299: cuentas y seguridad (solo funciones nuevas, aditiva: cambiar/quitar el PIN con el PIN, recuperarlo con identidad reciente, correos de las fichas); 0291: aviso a la dueña de valoraciones de 1-2 estrellas (disparador, aditiva); 0290: reseñas y opiniones de la app (tabla app_reviews, aditiva); 0289: «Propón un tema» con agradecimiento opcional, vínculo editorial y aviso al publicarse; 0288: escalado de cantidades al importar menús con las unidades de Compras; 0287: Leído / Actualizada, No leídas primero y varios temas; 0286: fecha de nacimiento obligatoria al dar de alta una cuenta; 0285: can_interact del perfil sin alias; 0284: solo adultas, seguir a Pepa, importar sin etiquetas automáticas y propuestas de temas; 0283: avisos de tareas por persona (hoy / atrasadas); 0281: Comunidad abierta sin páginas públicas ni IA; 0282: recetas estructuradas en publicaciones; 0280: el resumen diario de tareas guarda el listado completo en el aviso (antes, 0279: alergias e intolerancias de la ficha privada); la numeración la sube quien añada la siguiente · (de master, aplicadas antes de las de Cuentas: 0298 zonas fantasma de ubicación, 0297 confirmación de llegadas y salidas, 0295 preferencias entre dispositivos, 0294 lácteos y huevos, 0293 descuento de tickets, 0292 PIN para el administrador; por eso Cuentas pasó a 0299-0302)
  })
  it('el sync bancario sigue con /^anul\\b/i intacta; solo referencia REFUND_CATALOG_KEY donde corresponde (FASE DEV-1)', () => {
    // Ver el mismo razonamiento en src/data/refundsGuards.test.ts — DEV-1 (posterior, auditada aparte)
    // reutiliza deliberadamente el mismo valor de REFUND_CATALOG_KEY, sin llamar a isRefund() ni tocar refunds.ts.
    const bank = FUNCTIONS['/supabase/functions/enable-banking-sync-transactions/index.ts']
    expect(bank).toContain('/^anul\\b/i')
    expect(bank).toContain(`const REFUND_CATALOG_KEY = "i.ingreso.devoluciones"`)
    expect(bank).not.toMatch(/isRefund\(/)
  })
})
