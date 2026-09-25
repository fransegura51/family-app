import { describe, expect, it } from 'vitest'
import { REFUND_CATALOG_KEY } from '@/domain/refunds'

// FASE DEV-1 — detección automática de devoluciones bancarias EXPLÍCITAS (la descripción empieza
// literalmente por "DEVOLUCION") en supabase/functions/enable-banking-sync-transactions/index.ts. Deno
// (no se ejecuta en Vitest/Node, mismo motivo que commissionReversalDetection.test.ts): se audita por
// texto que existe la función/constante exacta, Y ADEMÁS se reconstruye aquí el MISMO regex (idéntico
// carácter a carácter — el primer describe lo compara contra el código fuente real) para probar de
// verdad los 14 casos pedidos con datos reales, no solo con coincidencia de texto.
const FUNCTIONS = import.meta.glob('/supabase/functions/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const SYNC = FUNCTIONS['/supabase/functions/enable-banking-sync-transactions/index.ts']

describe('0. no rompe ANUL ni CA-1 (Cobro anulado): siguen exactamente igual', () => {
  it('ANUL: mismo gatillo, misma ventana de 60 días', () => {
    expect(SYNC).toContain('if (isIncome && /^anul\\b/i.test((bt.description as string | null) ?? "")) {')
    expect(SYNC).toContain('from.setDate(from.getDate() - 60)')
  })
  it('CA-1 (reversión de comisión): mismo gatillo, misma ventana de 3 días', () => {
    expect(SYNC).toContain('if (isIncome && isCommissionReversalDescription((bt.description as string | null) ?? null)) {')
    expect(SYNC).toContain('const COMMISSION_REVERSAL_MATCH_WINDOW_DAYS = 3')
  })
})

describe('1. precedencia: ANUL → CA-1 → DEV-1 → resto (Ingreso), en ese orden, antes del insert final', () => {
  it('DEV-1 vive DESPUÉS de los bloques ANUL y CA-1 (Cobro anulado tiene prioridad si aplica)', () => {
    const anulIdx = SYNC.indexOf('if (isIncome && /^anul\\b/i.test(')
    const ca1Idx = SYNC.indexOf('if (isIncome && isCommissionReversalDescription(')
    const dev1Idx = SYNC.indexOf('const incomeCategory = isIncome && refundCategoryName')
    expect(anulIdx).toBeGreaterThanOrEqual(0)
    expect(ca1Idx).toBeGreaterThan(anulIdx)
    expect(dev1Idx).toBeGreaterThan(ca1Idx)
  })

  it('DEV-1 vive ANTES del emparejamiento de tickets (!isIncome) y antes del insert final', () => {
    const dev1Idx = SYNC.indexOf('const incomeCategory = isIncome && refundCategoryName')
    const ticketMatchIdx = SYNC.indexOf('if (!isIncome) {')
    const insertIdx = SYNC.indexOf('category: isIncome ? incomeCategory : category,')
    expect(dev1Idx).toBeGreaterThan(0)
    expect(ticketMatchIdx).toBeGreaterThan(dev1Idx)
    expect(insertIdx).toBeGreaterThan(ticketMatchIdx)
  })

  it('el insert final YA NO usa el literal "Ingreso" a secas — usa incomeCategory (prueba de que no es una función huérfana)', () => {
    expect(SYNC).toContain('category: isIncome ? incomeCategory : category,')
    expect(SYNC).not.toContain('category: isIncome ? "Ingreso" : category,')
  })

  it('DEV-1 no hace ninguna consulta a bank_transactions/expenses (a diferencia de ANUL/CA-1) — no enlaza ninguna compra', () => {
    const start = SYNC.indexOf('// FASE DEV-1 — devolución bancaria explícita (ver isExplicitBankRefundDescription')
    const end = SYNC.indexOf('if (!isIncome) {', start)
    const block = SYNC.slice(start, end)
    expect(block).not.toMatch(/\.from\(/)
    expect(block).not.toMatch(/purchase_id|refund_of|matched_purchase/i)
  })
})

describe('2. función pura y constante exactas', () => {
  it('EXPLICIT_BANK_REFUND_PATTERN = /^devolucion\\b/i', () => {
    expect(SYNC).toContain('const EXPLICIT_BANK_REFUND_PATTERN = /^devolucion\\b/i')
  })
  it('isExplicitBankRefundDescription: función pura, sin admin/IO', () => {
    expect(SYNC).toContain('function isExplicitBankRefundDescription(description: string | null): boolean {')
    expect(SYNC).toContain('return EXPLICIT_BANK_REFUND_PATTERN.test(description ?? "")')
  })
  it('no amplía el regex a otras palabras — el patrón en sí es solo /^devolucion\\b/i, nada más', () => {
    // El propio comentario ENUMERA a propósito "abono/reembolso/..." como lo que se excluye (documentación),
    // así que lo que hay que comprobar es el literal del regex, no la prosa que lo explica.
    const patternLine = SYNC.split('\n').find((l) => l.includes('const EXPLICIT_BANK_REFUND_PATTERN ='))
    expect(patternLine?.trim()).toBe('const EXPLICIT_BANK_REFUND_PATTERN = /^devolucion\\b/i')
  })
})

describe('3. identidad estable: catalog_key, no el nombre visible — reutiliza refunds.ts, no lo duplica de más', () => {
  it('el valor local coincide EXACTAMENTE con REFUND_CATALOG_KEY de domain/refunds.ts (guarda anti-deriva)', () => {
    expect(SYNC).toContain(`const REFUND_CATALOG_KEY = "${REFUND_CATALOG_KEY}"`)
  })
  it('resuelve el NOMBRE real de la categoría por catalog_key, nunca un texto "Devoluciones" fijo', () => {
    expect(SYNC).toContain('const refundCategoryName = (categories ?? []).find((c) => c.catalog_key === REFUND_CATALOG_KEY)?.name as string | undefined')
    expect(SYNC).not.toMatch(/incomeCategory\s*=[^;]*['"]Devoluciones['"]/i)
  })
  it('si la familia no tiene esa categoría, la regla no se aplica (cae a "Ingreso"), nunca se inventa una categoría', () => {
    expect(SYNC).toContain('const incomeCategory = isIncome && refundCategoryName && isExplicitBankRefundDescription((bt.description as string | null) ?? null) ? refundCategoryName : "Ingreso"')
  })
  it('no crea categoría nueva ni cambia catalog_key/parent de ninguna categoría', () => {
    const start = SYNC.indexOf('const incomeCategory = isIncome && refundCategoryName')
    const end = SYNC.indexOf('if (!isIncome) {', start)
    const block = SYNC.slice(start, end)
    expect(block).not.toMatch(/\.from\("budget_categories"\)|insert|update/i)
  })
})

describe('4. no toca refunds.ts, isRealIncome/isRealSpending/netSpending ni ningún cálculo financiero', () => {
  const APP_DOMAIN = import.meta.glob('/src/domain/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  it('domain/refunds.ts sin cambios relacionados con DEV-1', () => {
    expect(APP_DOMAIN['/src/domain/refunds.ts']).not.toMatch(/DEV-1|EXPLICIT_BANK_REFUND/i)
  })
  it('domain/financeCompute.ts sin cambios relacionados con DEV-1', () => {
    expect(APP_DOMAIN['/src/domain/financeCompute.ts']).not.toMatch(/DEV-1|EXPLICIT_BANK_REFUND/i)
  })
})

describe('5. no hay lógica específica de Amazon: la regla es puramente bancaria/genérica', () => {
  // Amazon SÍ puede aparecer citado como ejemplo real de la auditoría en los COMENTARIOS explicativos
  // (igual que CA-1 cita "H&M"/"BONIFIC." como casos reales) — lo que no debe existir es código real
  // (regex/función/condición) que dependa de la palabra "Amazon". Se filtran las líneas de comentario
  // antes de comprobar.
  function codeOnly(block: string): string {
    return block
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n')
  }
  it('el código (sin comentarios) de la declaración DEV-1 no menciona Amazon', () => {
    const start = SYNC.indexOf('// FASE DEV-1 — devolución bancaria EXPLÍCITA')
    const end = SYNC.indexOf('interface BankAccountRow')
    expect(codeOnly(SYNC.slice(start, end)).toLowerCase()).not.toContain('amazon')
  })
  it('el uso real (dentro del bucle de sincronización) no menciona Amazon', () => {
    const start2 = SYNC.indexOf('const incomeCategory = isIncome && refundCategoryName')
    const end2 = SYNC.indexOf('if (!isIncome) {', start2)
    expect(codeOnly(SYNC.slice(start2, end2)).toLowerCase()).not.toContain('amazon')
  })
})

// ---------------------------------------------------------------------------------------------------
// Los 14 casos pedidos, ejecutados de verdad contra el MISMO regex que el bloque "2" de arriba acaba de
// confirmar que está en el archivo real (carácter a carácter).
// ---------------------------------------------------------------------------------------------------
const EXPLICIT_BANK_REFUND_PATTERN = /^devolucion\b/i
function isExplicitBankRefundDescription(description: string | null): boolean {
  return EXPLICIT_BANK_REFUND_PATTERN.test(description ?? '')
}
// Decisión completa simulada, igual que hace el sync real: isIncome && patrón && categoría resuelta.
// Sin valor por defecto a propósito: `undefined` explícito debe significar "la familia no tiene la
// categoría" en los tests, y un parámetro con default lo confundiría con "omitido" (JS los trata igual).
function classifyIncomingCredit(isIncome: boolean, description: string, refundCategoryName: string | undefined): string {
  return isIncome && refundCategoryName && isExplicitBankRefundDescription(description) ? refundCategoryName : 'Ingreso'
}

describe('Caso 1 — +14,85€ "DEVOLUCION AMAZON..." → Devoluciones', () => {
  it('detecta y clasifica', () => {
    expect(isExplicitBankRefundDescription('DEVOLUCION AMAZON PEDIDO 402-0642845')).toBe(true)
    expect(classifyIncomingCredit(true, 'DEVOLUCION AMAZON PEDIDO 402-0642845', 'Devoluciones')).toBe('Devoluciones')
  })
})

describe('Caso 2 — +10,95€ "DEVOLUCION FARMACIA..." → Devoluciones', () => {
  it('detecta y clasifica', () => {
    expect(isExplicitBankRefundDescription('DEVOLUCION TAR.5402XXXXXXXX4041 15.06 FARMACIA VIEITEZ COM-VIGO')).toBe(true)
    expect(classifyIncomingCredit(true, 'DEVOLUCION TAR.5402XXXXXXXX4041 15.06 FARMACIA VIEITEZ COM-VIGO', 'Devoluciones')).toBe('Devoluciones')
  })
})

describe('Caso 3 — +24,99€ "DEVOLUCION LEROY MERLIN..." → Devoluciones', () => {
  it('detecta y clasifica (incluida la anotación libre "cable" entre medias)', () => {
    expect(isExplicitBankRefundDescription('DEVOLUCION cable TAR.5402XXXXXXXX4041 16.07 ADEO LEROY MERLIN SPAIN-ALCOBENDAS')).toBe(true)
  })
})

describe('Caso 4 — +7,33€ "DEVOLUCION GOOGLE..." → Devoluciones', () => {
  it('detecta y clasifica', () => {
    expect(isExplicitBankRefundDescription('DEVOLUCION 5402XXXXXXXX4041 14.09 GOOGLE*GOOGLE ONE-DUBLIN')).toBe(true)
  })
})

describe('Caso 5 — "devolucion comercio..." (minúsculas) → Devoluciones', () => {
  it('insensible a mayúsculas/minúsculas', () => {
    expect(isExplicitBankRefundDescription('devolucion comercio cualquiera')).toBe(true)
    expect(isExplicitBankRefundDescription('Devolucion Comercio Cualquiera')).toBe(true)
    expect(isExplicitBankRefundDescription('DeVoLuCiOn mixto')).toBe(true)
  })
})

describe('Caso 6 — movimiento NEGATIVO "DEVOLUCION AMAZON..." → NO se aplica la regla', () => {
  it('exige isIncome=true; un cargo (DBIT) nunca se convierte en devolución', () => {
    expect(classifyIncomingCredit(false, 'DEVOLUCION AMAZON...', 'Devoluciones')).toBe('Ingreso')
  })
})

describe('Caso 7 — +14,85€ "AMAZON..." (sin la palabra DEVOLUCION) → NO devolución automática', () => {
  it('no detecta', () => {
    expect(isExplicitBankRefundDescription('AMAZON PEDIDO 402-1234567')).toBe(false)
    expect(classifyIncomingCredit(true, 'AMAZON PEDIDO 402-1234567', 'Devoluciones')).toBe('Ingreso')
  })
})

describe('Caso 8 — +14,85€ "ABONO AMAZON..." → NO devolución automática', () => {
  it('"abono" queda fuera a propósito en esta fase', () => {
    expect(isExplicitBankRefundDescription('ABONO AMAZON...')).toBe(false)
  })
})

describe('Caso 9 — +14,85€ "REEMBOLSO AMAZON..." → NO devolución automática en esta fase', () => {
  it('"reembolso" queda fuera a propósito en esta fase', () => {
    expect(isExplicitBankRefundDescription('REEMBOLSO AMAZON...')).toBe(false)
  })
})

describe('Caso 10 — "BONIFIC. COMISION MANT. CUENTA" +60€ → sigue la regla de Cobro anulado (CA-1), no DEV-1', () => {
  it('no es una devolución explícita (no empieza por "devolucion")', () => {
    expect(isExplicitBankRefundDescription('BONIFIC. COMISION MANT. CUENTA')).toBe(false)
  })
  it('el orden real del sync (comprobado en el describe "1") prueba que CA-1 se intenta primero de todas formas', () => {
    expect(SYNC.indexOf('isCommissionReversalDescription(')).toBeLessThan(SYNC.indexOf('const incomeCategory = isIncome && refundCategoryName'))
  })
})

describe('Caso 11 — "ANUL COMPRA TARJ..." → sigue usando la lógica existente de Cobro anulado', () => {
  it('no es una devolución explícita', () => {
    expect(isExplicitBankRefundDescription('ANUL COMPRA TARJ. 5402XXXXXXXX4041 WWW.AMAZON-LUXEMBOURG')).toBe(false)
  })
})

describe('Caso 12 — movimiento positivo normal "NOMINA..." → sigue entrando como Ingreso', () => {
  it('no detecta, cae al valor por defecto', () => {
    expect(classifyIncomingCredit(true, 'NOMINA EMPRESA SL', 'Devoluciones')).toBe('Ingreso')
  })
})

describe('Caso 13 — "PAGO DEVOLUCION AMAZON" (DEVOLUCION en mitad, no al principio) → NO aplica', () => {
  it('el anclaje ^ exige que sea el principio literal de la descripción', () => {
    expect(isExplicitBankRefundDescription('PAGO DEVOLUCION AMAZON')).toBe(false)
  })
})

describe('Caso 14 — "DEVOLUCIONES..." / "DEVOLUCIONXYZ..." → NO debe convertirse por accidente (límite de palabra)', () => {
  it('\\b evita que un prefijo parcial cuente como coincidencia', () => {
    expect(isExplicitBankRefundDescription('DEVOLUCIONES MULTIPLES ESTE MES')).toBe(false)
    expect(isExplicitBankRefundDescription('DEVOLUCIONXYZ ALGO')).toBe(false)
  })
})

describe('extra — refundCategoryName ausente (familia sin esa categoría): nunca inventa una categoría', () => {
  it('cae a "Ingreso" aunque el texto sí sea una devolución explícita', () => {
    expect(classifyIncomingCredit(true, 'DEVOLUCION AMAZON...', undefined)).toBe('Ingreso')
  })
})
