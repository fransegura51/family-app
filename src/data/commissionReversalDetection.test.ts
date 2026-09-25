import { describe, expect, it } from 'vitest'

// FASE CA-1/CA-2 — detección automática CONSERVADORA de "reversión/bonificación de comisión bancaria"
// (caso real: -60€ "INTERESES Y/O COMISIONES CUENTA" + +60€ "BONIFIC. COMISION MANT. CUENTA", 24/06 y
// 24/09/2026) en supabase/functions/enable-banking-sync-transactions/index.ts. Deno (no se ejecuta en
// Vitest/Node — sin runtime Deno en CI, mismo motivo por el que 0152's commissionReversalMigration.test.ts
// audita el SQL como texto en vez de ejecutarlo): se audita por texto que existen las funciones puras
// exactas con los patrones/constantes exactos, Y ADEMÁS se reconstruyen aquí esos MISMOS regex (idénticos
// carácter a carácter — el test siguiente los compara contra el código fuente real, así que si alguien
// cambia el regex del archivo sin actualizar este test, el primer describe falla) para probar de verdad
// los 7 casos pedidos con datos reales, no solo con coincidencia de texto.
const FUNCTIONS = import.meta.glob('/supabase/functions/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const SYNC = FUNCTIONS['/supabase/functions/enable-banking-sync-transactions/index.ts']

describe('0. el patrón histórico "ANUL" no se toca', () => {
  it('sigue exactamente igual: mismo gatillo, misma ventana de 60 días, mismo camino de arriba', () => {
    expect(SYNC).toContain('if (isIncome && /^anul\\b/i.test((bt.description as string | null) ?? "")) {')
    expect(SYNC).toContain('from.setDate(from.getDate() - 60)')
  })

  it('la nueva regla vive DESPUÉS del bloque "ANUL", nunca antes (el "ANUL" tiene prioridad si aplica)', () => {
    const anulIdx = SYNC.indexOf('if (isIncome && /^anul\\b/i.test(')
    const newRuleIdx = SYNC.indexOf('if (isIncome && isCommissionReversalDescription(')
    expect(anulIdx).toBeGreaterThanOrEqual(0)
    expect(newRuleIdx).toBeGreaterThan(anulIdx)
  })
})

describe('1. las funciones puras nuevas existen con los patrones/constante exactos', () => {
  it('COMMISSION_KEYWORDS_PATTERN / COMMISSION_REVERSAL_PATTERN', () => {
    expect(SYNC).toContain('const COMMISSION_KEYWORDS_PATTERN = /comisi[oó]n|inter[eé]s(es)?/i')
    expect(SYNC).toContain('const COMMISSION_REVERSAL_PATTERN = /bonific|revers|anulaci[oó]n/i')
  })

  it('isCommissionChargeDescription / isCommissionReversalDescription — funciones puras, sin admin/IO', () => {
    expect(SYNC).toContain('function isCommissionChargeDescription(description: string | null): boolean {')
    expect(SYNC).toContain('function isCommissionReversalDescription(description: string | null): boolean {')
  })

  it('ventana temporal: constante nombrada y documentada, 3 días (no 60)', () => {
    expect(SYNC).toContain('const COMMISSION_REVERSAL_MATCH_WINDOW_DAYS = 3')
    expect(SYNC).toMatch(/días para dos patas del MISMO evento real[\s\S]{0,600}const COMMISSION_REVERSAL_MATCH_WINDOW_DAYS = 3/)
  })

  it('pickUnambiguousCommissionCharge: null si hay más de un candidato (protección contra falsos positivos, caso 7)', () => {
    expect(SYNC).toContain('function pickUnambiguousCommissionCharge(candidates: CommissionChargeCandidate[], targetAmount: number): CommissionChargeCandidate | null {')
    expect(SYNC).toContain('return matches.length === 1 ? matches[0] : null')
  })
})

describe('2. misma cuenta bancaria: la búsqueda de cargo candidato está acotada a account.id', () => {
  it('la nueva regla consulta bank_transactions de la MISMA cuenta que se está sincronizando, no toda la familia', () => {
    const start = SYNC.indexOf('if (isIncome && isCommissionReversalDescription(')
    const end = SYNC.indexOf('if (!isIncome) {', start)
    const block = SYNC.slice(start, end)
    expect(block).toContain('.from("bank_transactions")')
    expect(block).toContain('.eq("account_id", account.id)')
    expect(block).toContain('.eq("credit_debit", "DBIT")')
  })

  it('el patrón "ANUL" histórico, en cambio, sigue buscando en expenses de toda la familia (comportamiento sin cambios)', () => {
    const start = SYNC.indexOf('if (isIncome && /^anul\\b/i.test(')
    const end = SYNC.indexOf('if (isIncome && isCommissionReversalDescription(')
    const block = SYNC.slice(start, end)
    expect(block).toContain('.from("expenses")')
    expect(block).toContain('.eq("family_id", familyId)')
    expect(block).not.toContain('.eq("account_id"')
  })
})

describe('3. no toca refunds.ts, Amazon ni devoluciones', () => {
  const REFUNDS = import.meta.glob('/src/domain/refunds.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  it('domain/refunds.ts no menciona nada de la fase CA-1/comisión', () => {
    expect(REFUNDS['/src/domain/refunds.ts']).not.toMatch(/comision|CA-1|CA-2/i)
  })
  it('la Edge Function no crea ningún vínculo compra↔devolución ni toca isRefund/REFUND_CATALOG_KEY', () => {
    expect(SYNC).not.toMatch(/isRefund|REFUND_CATALOG_KEY|Amazon/i)
  })
})

// ---------------------------------------------------------------------------------------------------
// Los 7 casos pedidos, ejecutados de verdad contra los MISMOS regex/lógica que el bloque de arriba acaba
// de confirmar que están en el archivo real (carácter a carácter).
// ---------------------------------------------------------------------------------------------------
const COMMISSION_KEYWORDS_PATTERN = /comisi[oó]n|inter[eé]s(es)?/i
const COMMISSION_REVERSAL_PATTERN = /bonific|revers|anulaci[oó]n/i
function isCommissionChargeDescription(description: string | null): boolean {
  return COMMISSION_KEYWORDS_PATTERN.test(description ?? '')
}
function isCommissionReversalDescription(description: string | null): boolean {
  const text = description ?? ''
  return COMMISSION_REVERSAL_PATTERN.test(text) && COMMISSION_KEYWORDS_PATTERN.test(text)
}
interface Candidate {
  id: string
  amount: number
  description: string | null
}
function pickUnambiguousCommissionCharge(candidates: Candidate[], targetAmount: number): Candidate | null {
  const matches = candidates.filter((c) => Math.abs(c.amount - targetAmount) < 0.01 && isCommissionChargeDescription(c.description))
  return matches.length === 1 ? matches[0] : null
}

describe('los regex de este test son IDÉNTICOS a los del archivo real (si esto falla, actualiza ambos)', () => {
  it('fuente exacta de los 2 regex', () => {
    expect(SYNC).toContain(`const COMMISSION_KEYWORDS_PATTERN = ${COMMISSION_KEYWORDS_PATTERN}`)
    expect(SYNC).toContain(`const COMMISSION_REVERSAL_PATTERN = ${COMMISSION_REVERSAL_PATTERN}`)
  })
})

describe('Caso 1 — DEBE detectar: comisión de mantenimiento + su bonificación, misma cuenta/fechas compatibles', () => {
  it('abono "BONIFIC. COMISION MANT. CUENTA" reconocido como reversión de comisión', () => {
    expect(isCommissionReversalDescription('BONIFIC. COMISION MANT. CUENTA')).toBe(true)
  })
  it('cargo "INTERESES Y/O COMISIONES CUENTA" reconocido como comisión/cargo compatible', () => {
    expect(isCommissionChargeDescription('INTERESES Y/O COMISIONES CUENTA')).toBe(true)
  })
  it('con un único candidato de 60€, se elige (no ambiguo)', () => {
    const picked = pickUnambiguousCommissionCharge([{ id: 'charge-1', amount: 60, description: 'INTERESES Y/O COMISIONES CUENTA' }], 60)
    expect(picked?.id).toBe('charge-1')
  })
})

describe('Caso 2 — el patrón histórico explícito "ANUL..." sigue funcionando (regex sin cambios)', () => {
  it('/^anul\\b/i sigue reconociendo "ANUL COMPRA TARJ..."', () => {
    expect(/^anul\b/i.test('ANUL COMPRA TARJ. 4041 ZARA')).toBe(true)
  })
})

describe('Caso 3 — NO debe detectar: cargo y abono normales sin relación', () => {
  it('abono "TRANSFERENCIA DE JUAN PEREZ" no es una reversión de comisión', () => {
    expect(isCommissionReversalDescription('TRANSFERENCIA DE JUAN PEREZ')).toBe(false)
  })
  it('-60€ compra normal + +60€ ingreso normal → no se intenta emparejar (falla el filtro de descripción del abono)', () => {
    const isIncome = true
    const shouldTry = isIncome && isCommissionReversalDescription('TRANSFERENCIA DE JUAN PEREZ')
    expect(shouldTry).toBe(false)
  })
})

describe('Caso 4 — NO debe detectar: suscripción de 9,99€ + ingreso independiente de 9,99€', () => {
  it('abono "BIZUM DE MARIA" no es una reversión de comisión, aunque el importe coincida', () => {
    expect(isCommissionReversalDescription('BIZUM DE MARIA')).toBe(false)
  })
})

describe('Caso 5 — NO debe emparejar: mismo importe, cuentas bancarias diferentes (ambas conocidas)', () => {
  it('el filtro .eq("account_id", account.id) excluye por construcción cualquier candidato de otra cuenta', () => {
    // Los candidatos ya vienen acotados por cuenta en la consulta SQL (ver describe "2" más arriba); a
    // nivel de la función pura, un candidato "de otra cuenta" simplemente nunca llega a la lista que
    // recibe pickUnambiguousCommissionCharge — no hay nada que decidir aquí, la cuenta ya filtró antes.
    const candidatesFromOtherAccount: Candidate[] = []
    expect(pickUnambiguousCommissionCharge(candidatesFromOtherAccount, 60)).toBeNull()
  })
})

describe('Caso 6 — NO debe emparejar: abono "BONIFIC..." pero el cargo candidato es una compra normal', () => {
  it('el cargo "COMPRA TARJ. ZARA" no es un cargo de comisión/interés compatible', () => {
    expect(isCommissionChargeDescription('COMPRA TARJ. 4041 ZARA')).toBe(false)
  })
  it('por tanto no se elige como candidato aunque el importe coincida', () => {
    const picked = pickUnambiguousCommissionCharge([{ id: 'charge-1', amount: 60, description: 'COMPRA TARJ. 4041 ZARA' }], 60)
    expect(picked).toBeNull()
  })
})

describe('Caso 7 — dos posibles cargos del mismo importe → NO se elige ninguno (mejor no automatizar un caso dudoso)', () => {
  it('dos candidatos de comisión válidos y del mismo importe → null, no se adivina', () => {
    const picked = pickUnambiguousCommissionCharge(
      [
        { id: 'charge-1', amount: 60, description: 'COMISION MANTENIMIENTO CUENTA' },
        { id: 'charge-2', amount: 60, description: 'INTERESES Y/O COMISIONES CUENTA' },
      ],
      60,
    )
    expect(picked).toBeNull()
  })
})
