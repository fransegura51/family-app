import { describe, expect, it } from 'vitest'
import {
  budgetPeriodRange,
  budgetSpent,
  categoryColors,
  computeSavingsDestinedByMember,
  stableCategoryColors,
  isFoodCategory,
  isInternalTransferCategory,
  resolveCategoryClassification,
  resolveExpenseFixed,
  walletBalance,
  walletCategoryTotal,
} from '@/domain/finance'
import type { Budget, BudgetCategory, Expense, KidWalletTransaction } from '@/domain/types'

function cat(over: Partial<BudgetCategory> & Pick<BudgetCategory, 'id' | 'name'>): BudgetCategory {
  return { familyId: 'f', icon: '', budgetGroup: 'generales', sortOrder: 0, parentId: null, necessity: null, isFixed: null, catalogKey: null, ...over }
}

// Árbol parecido al real de la familia (taxonomía maestra, migración 0076):
// todo en 'generales', Alimentación con subcategorías.
const categories: BudgetCategory[] = [
  cat({ id: 'ali', name: 'Alimentación', necessity: 'necesito', isFixed: false }),
  cat({ id: 'super', name: 'Supermercado', parentId: 'ali' }),
  cat({ id: 'viv', name: 'Vivienda y hogar', necessity: 'debo', isFixed: true }),
  cat({ id: 'hip', name: 'Alquiler / hipoteca', parentId: 'viv' }),
  cat({ id: 'ocio', name: 'Ocio y viajes', necessity: 'quiero', isFixed: false }),
  cat({ id: 'sub', name: 'Suscripciones', parentId: 'ocio', isFixed: true }),
  cat({ id: 'mov', name: 'Movimientos internos' }),
  cat({ id: 'tr', name: 'Transferencias entre cuentas propias', parentId: 'mov' }),
  cat({ id: 'sueldo', name: 'Sueldo', budgetGroup: 'ingresos' }),
]

function exp(over: Partial<Expense> & Pick<Expense, 'expenseDate' | 'amount' | 'category'>): Expense {
  return {
    id: 'e',
    familyId: 'f',
    store: null,
    kind: 'real',
    notes: null,
    isIncome: false,
    budgetGroup: 'generales',
    tagId: null,
    source: 'manual',
    isFixedOverride: null,
    ownerMemberId: null,
    shared: false,
    sharedFromExpenseId: null,
    productClassification: null,
    ...over,
  }
}

describe('isFoodCategory', () => {
  it('la propia Alimentación y sus subcategorías cuentan como comida', () => {
    expect(isFoodCategory('Alimentación', categories)).toBe(true)
    expect(isFoodCategory('Supermercado', categories)).toBe(true)
  })
  it('otras categorías y las desconocidas no', () => {
    expect(isFoodCategory('Vivienda y hogar', categories)).toBe(false)
    expect(isFoodCategory('No existe', categories)).toBe(false)
  })
})

describe('isInternalTransferCategory', () => {
  it('reconoce la categoría y su subcategoría', () => {
    expect(isInternalTransferCategory('Movimientos internos', categories)).toBe(true)
    expect(isInternalTransferCategory('Transferencias entre cuentas propias', categories)).toBe(true)
    expect(isInternalTransferCategory('Sueldo', categories)).toBe(false)
  })
})

describe('resolveCategoryClassification', () => {
  it('una subcategoría sin clasificación propia hereda la de su principal', () => {
    expect(resolveCategoryClassification('Supermercado', categories)).toEqual({ necessity: 'necesito', isFixed: false })
    expect(resolveCategoryClassification('Alquiler / hipoteca', categories)).toEqual({ necessity: 'debo', isFixed: true })
  })
  it('lo propio manda sobre lo heredado, campo a campo', () => {
    // Suscripciones: isFixed propio (true), necessity heredada (quiero).
    expect(resolveCategoryClassification('Suscripciones', categories)).toEqual({ necessity: 'quiero', isFixed: true })
  })
  it('categoría desconocida → sin clasificar, nunca inventa', () => {
    expect(resolveCategoryClassification('No existe', categories)).toEqual({ necessity: null, isFixed: null })
  })
})

describe('resolveExpenseFixed', () => {
  it('la marca del propio movimiento manda sobre la categoría', () => {
    expect(resolveExpenseFixed({ category: 'Supermercado', isFixedOverride: true }, categories)).toBe(true)
    expect(resolveExpenseFixed({ category: 'Alquiler / hipoteca', isFixedOverride: false }, categories)).toBe(false)
  })
  it('sin marca propia, sale de la categoría', () => {
    expect(resolveExpenseFixed({ category: 'Alquiler / hipoteca', isFixedOverride: null }, categories)).toBe(true)
    expect(resolveExpenseFixed({ category: 'No existe', isFixedOverride: null }, categories)).toBeNull()
  })
})

describe('budgetPeriodRange', () => {
  it('mensual: del día de inicio al mismo día del mes siguiente (excluido)', () => {
    expect(budgetPeriodRange({ periodType: 'mensual', periodStart: '2026-09-01' })).toEqual({ start: '2026-09-01', end: '2026-10-01' })
  })
  it('semanal: 7 días', () => {
    expect(budgetPeriodRange({ periodType: 'semanal', periodStart: '2026-09-01' })).toEqual({ start: '2026-09-01', end: '2026-09-08' })
  })
})

describe('budgetSpent', () => {
  const budgetBase: Budget = { id: 'b', familyId: 'f', periodType: 'mensual', periodStart: '2026-09-01', category: null, amount: 1000, budgetGroup: 'generales', ownerMemberId: null }
  const expenses: Expense[] = [
    exp({ id: '1', expenseDate: '2026-09-05', amount: 20, category: 'Supermercado' }),
    exp({ id: '2', expenseDate: '2026-09-06', amount: 5, category: 'Supermercado', kind: 'estimado' }),
    exp({ id: '3', expenseDate: '2026-09-07', amount: 7, category: 'Supermercado', isIncome: true }),
    exp({ id: '4', expenseDate: '2026-09-10', amount: 500, category: 'Alquiler / hipoteca' }),
    exp({ id: '5', expenseDate: '2026-10-01', amount: 999, category: 'Supermercado' }),
  ]

  it('solo gasto REAL, nunca estimado ni ingresos, y solo dentro del periodo', () => {
    expect(budgetSpent({ ...budgetBase, category: 'Supermercado' }, expenses)).toBe(20)
  })
  it('sin categoría ni contexto: suma todo el gasto real del periodo', () => {
    expect(budgetSpent(budgetBase, expenses)).toBe(520)
  })
  it('el mismo euro no se cuenta dos veces aunque Alimentación esté en el mismo grupo', () => {
    // Tras la migración 0076 todas las categorías (Alimentación incluida)
    // viven en 'generales': el gastado de ese presupuesto tiene que ser
    // 520, no 540 (20 de Supermercado contados como "propio" Y como
    // "alimentación").
    expect(budgetSpent(budgetBase, expenses, { categories })).toBe(520)
  })
  it('un traspaso entre cuentas propias no cuenta como gasto', () => {
    const withTransfer = [...expenses, exp({ id: '6', expenseDate: '2026-09-12', amount: 100, category: 'Movimientos internos' })]
    expect(budgetSpent(budgetBase, withTransfer, { categories })).toBe(520)
    expect(budgetSpent(budgetBase, withTransfer)).toBe(520)
  })
  it('un presupuesto sobre una categoría padre deduce también sus subcategorías', () => {
    // Bug real: "he creado un presupuesto para Alimentación y no se ha
    // deducido nada" — todo el gasto real vive en "Supermercado" (hija
    // de Alimentación), nunca en "Alimentación" a secas.
    expect(budgetSpent({ ...budgetBase, category: 'Alimentación' }, expenses, { categories })).toBe(20)
  })
  it('sin contexto, un presupuesto sobre una categoría padre solo cuenta la igualdad exacta', () => {
    expect(budgetSpent({ ...budgetBase, category: 'Alimentación' }, expenses)).toBe(0)
  })
  it('un presupuesto sobre una subcategoría deduce solo esa, no sus hermanas', () => {
    expect(budgetSpent({ ...budgetBase, category: 'Supermercado' }, expenses, { categories })).toBe(20)
  })
})

describe('categoryColors', () => {
  const colored: BudgetCategory[] = [
    cat({ id: 'ali', name: 'Alimentación' }),
    cat({ id: 'super', name: 'Supermercado', parentId: 'ali' }),
    cat({ id: 'restaurantes', name: 'Restaurantes', parentId: 'ali' }),
    cat({ id: 'viv', name: 'Vivienda y hogar' }),
    cat({ id: 'ocio', name: 'Ocio y viajes' }),
    cat({ id: 'mov', name: 'Movimientos internos' }),
  ]

  it('cada categoría principal tiene un color propio, distinto de las demás', () => {
    const colors = categoryColors(colored)
    const topLevelColors = [colors.get('ali'), colors.get('viv'), colors.get('ocio'), colors.get('mov')]
    expect(new Set(topLevelColors).size).toBe(topLevelColors.length)
  })
  it('una subcategoría queda CERCA del tono de su categoría principal (misma familia), pero no es el color entero', () => {
    const colors = categoryColors(colored)
    const parentHue = Number(colors.get('ali')?.match(/hsl\((\d+)/)?.[1])
    const childHue = Number(colors.get('super')?.match(/hsl\((\d+)/)?.[1])
    // El desplazamiento entre hermanas es de como mucho ±14° — se nota
    // el parentesco sin ser el hue exacto del padre.
    expect(Math.abs(childHue - parentHue)).toBeLessThanOrEqual(14)
    expect(colors.get('super')).not.toBe(colors.get('ali'))
    expect(colors.get('super')).not.toBe(colors.get('restaurantes'))
  })
  it('el color no depende del ORDEN de la lista, solo del conjunto de nombres (no por posición)', () => {
    const full = categoryColors(colored)
    const reordered = categoryColors([...colored].reverse())
    expect(reordered.get('ali')).toBe(full.get('ali'))
    expect(reordered.get('viv')).toBe(full.get('viv'))
    expect(reordered.get('mov')).toBe(full.get('mov'))
  })
  it('varias categorías con el mismo sortOrder (bug real de sembrado duplicado) no colapsan en el mismo color', () => {
    // Caso real destapado al verificar en producción: una familia tenía
    // el árbol de categorías sembrado por triplicado, y dos de esas tres
    // copias completas compartían EXACTAMENTE el mismo sortOrder entre
    // sí — con el color basado en sortOrder, las ~10 categorías
    // principales de esas copias salían todas del mismo tono. El color
    // por nombre no depende de sortOrder, así que no le afecta.
    const duplicatedSortOrder: BudgetCategory[] = [
      cat({ id: 'a', name: 'Alimentación', sortOrder: 1000 }),
      cat({ id: 'b', name: 'Vivienda y hogar', sortOrder: 1000 }),
      cat({ id: 'c', name: 'Transporte y vehículo', sortOrder: 1000 }),
      cat({ id: 'd', name: 'Compras y familia', sortOrder: 1000 }),
    ]
    const colors = categoryColors(duplicatedSortOrder)
    const hues = [colors.get('a'), colors.get('b'), colors.get('c'), colors.get('d')]
    expect(new Set(hues).size).toBe(hues.length)
  })
  it('dos categorías duplicadas con el mismo nombre (mismo caso real) comparten color, no compiten por dos tonos', () => {
    const dup: BudgetCategory[] = [
      cat({ id: 'mov1', name: 'Movimientos internos', sortOrder: 500 }),
      cat({ id: 'mov2', name: 'Movimientos internos', sortOrder: 900000 }),
    ]
    const colors = categoryColors(dup)
    expect(colors.get('mov1')).toBe(colors.get('mov2'))
  })
})

describe('hucha de los niños', () => {
  const tx: KidWalletTransaction[] = [
    { id: '1', familyId: 'f', memberId: 'eric', type: 'ingreso', amount: 10, description: '', createdAt: '' },
    { id: '2', familyId: 'f', memberId: 'eric', type: 'ahorro', amount: 3, description: '', createdAt: '' },
    { id: '3', familyId: 'f', memberId: 'eric', type: 'gasto', amount: 2, description: '', createdAt: '' },
    { id: '4', familyId: 'f', memberId: 'eric', type: 'impuesto', amount: 1, description: '', createdAt: '' },
    { id: '5', familyId: 'f', memberId: 'fernando', type: 'ingreso', amount: 50, description: '', createdAt: '' },
  ]
  it('el disponible descuenta ahorro, gasto e impuestos, y no mezcla niños', () => {
    expect(walletBalance('eric', tx)).toBe(4)
    expect(walletBalance('fernando', tx)).toBe(50)
    expect(walletCategoryTotal('eric', 'ahorro', tx)).toBe(3)
  })
})

describe('stableCategoryColors', () => {
  it('gives a category the same color whether it gets every group or only its own', () => {
    const generales = categories.filter((c) => c.budgetGroup === 'generales')
    const all = stableCategoryColors(categories)
    const own = stableCategoryColors(generales)
    for (const c of generales) expect(all.get(c.id)).toBe(own.get(c.id))
  })
})

// Fase 1F.F — "Dinero destinado a cuentas de ahorro" (Resumen). Escenarios modelados directamente sobre
// datos reales auditados en producción (Familia Hepburn, 31/08/2026): un traspaso completo son SIEMPRE
// dos filas — salida ('Transferencias entre cuentas propias', is_income=false, ownerMemberId null) y
// entrada ('Movimientos internos', is_income=true, ownerMemberId = quien la recibe) — y esta función
// SOLO cuenta la de entrada. El llamador (ResumenTab) es quien filtra por periodo (inRange); esta
// función es agnóstica de fechas, así que "respeta el periodo"/"respeta Mes contable" se prueba pasando
// solo las filas que ya estarían dentro de ese periodo (igual que hace inRange en el componente).
describe('computeSavingsDestinedByMember', () => {
  it('una transferencia a la cuenta de un hijo: solo cuenta la pata de entrada', () => {
    const rows: Expense[] = [
      exp({ expenseDate: '2026-08-31', amount: 100, category: 'Transferencias entre cuentas propias', isIncome: false, ownerMemberId: null }),
      exp({ expenseDate: '2026-08-31', amount: 100, category: 'Movimientos internos', isIncome: true, ownerMemberId: 'eric' }),
    ]
    const result = computeSavingsDestinedByMember(rows, categories)
    expect(result.get('eric')).toBe(100)
    expect(result.size).toBe(1)
  })

  it('dos transferencias a dos miembros distintos en el mismo periodo: cada uno con su importe, sin mezclarse', () => {
    const rows: Expense[] = [
      exp({ expenseDate: '2026-08-31', amount: 100, category: 'Transferencias entre cuentas propias', isIncome: false, ownerMemberId: null }),
      exp({ expenseDate: '2026-08-31', amount: 100, category: 'Movimientos internos', isIncome: true, ownerMemberId: 'fernando' }),
      exp({ expenseDate: '2026-09-05', amount: 250, category: 'Transferencias entre cuentas propias', isIncome: false, ownerMemberId: null }),
      exp({ expenseDate: '2026-09-05', amount: 250, category: 'Movimientos internos', isIncome: true, ownerMemberId: 'eric' }),
    ]
    const result = computeSavingsDestinedByMember(rows, categories)
    expect(result.get('fernando')).toBe(100)
    expect(result.get('eric')).toBe(250)
    expect(result.size).toBe(2)
  })

  it('nunca cuenta las dos patas: el total nunca duplica el importe real traspasado', () => {
    const rows: Expense[] = [
      exp({ expenseDate: '2026-08-31', amount: 100, category: 'Transferencias entre cuentas propias', isIncome: false, ownerMemberId: null }),
      exp({ expenseDate: '2026-08-31', amount: 100, category: 'Movimientos internos', isIncome: true, ownerMemberId: 'eric' }),
    ]
    const result = computeSavingsDestinedByMember(rows, categories)
    const total = [...result.values()].reduce((s, v) => s + v, 0)
    expect(total).toBe(100) // nunca 200
  })

  it('la pata de salida nunca cuenta aunque, por error de datos, llevara un ownerMemberId', () => {
    const rows: Expense[] = [
      exp({ expenseDate: '2026-08-31', amount: 100, category: 'Transferencias entre cuentas propias', isIncome: false, ownerMemberId: 'eric' }),
    ]
    expect(computeSavingsDestinedByMember(rows, categories).size).toBe(0)
  })

  it('un movimiento fuera del periodo (no incluido en `rows`, igual que ya filtra inRange) nunca aparece', () => {
    // Caso real auditado: traspaso a Eric de 100 € con fecha 14/08/2026, fuera del mes contable en curso
    // (31/08/2026 → 29/09/2026) — el llamador ya lo deja fuera de `inRange`, así que ni siquiera llega aquí.
    const rowsInPeriod: Expense[] = [
      exp({ expenseDate: '2026-08-31', amount: 100, category: 'Movimientos internos', isIncome: true, ownerMemberId: 'fernando' }),
    ]
    const result = computeSavingsDestinedByMember(rowsInPeriod, categories)
    expect(result.has('eric')).toBe(false)
  })

  it('un movimiento clasificado como "Ingreso" (no "Movimientos internos") no cuenta, aunque tenga ownerMemberId y parezca un traspaso', () => {
    // Caso real auditado: un traspaso a la cuenta de un hijo puede quedar categorizado "Ingreso" en vez de
    // "Movimientos internos" por el motor de sincronización bancaria — una inconsistencia de datos previa
    // a esta función, que no se "corrige" adivinando: solo se cuenta lo que la familia ya tiene clasificado
    // como traspaso interno, igual que en el resto de la app (ahorro, Presupuesto...).
    const rows: Expense[] = [
      exp({ expenseDate: '2026-08-31', amount: 100, category: 'Ingreso', isIncome: true, ownerMemberId: 'eric' }),
    ]
    expect(computeSavingsDestinedByMember(rows, categories).size).toBe(0)
  })

  it('un movimiento sin ownerMemberId (cuenta Común) no cuenta ni bajo una clave falsa', () => {
    const rows: Expense[] = [exp({ expenseDate: '2026-08-31', amount: 100, category: 'Movimientos internos', isIncome: true, ownerMemberId: null })]
    expect(computeSavingsDestinedByMember(rows, categories).size).toBe(0)
  })

  it('un movimiento no real (previsto/estimado) nunca cuenta, aunque coincida en categoría/owner', () => {
    const rows: Expense[] = [
      exp({ expenseDate: '2026-08-31', amount: 100, category: 'Movimientos internos', isIncome: true, ownerMemberId: 'eric', kind: 'previsto' }),
    ]
    expect(computeSavingsDestinedByMember(rows, categories).size).toBe(0)
  })
})

// Fase 1F.B — corrección estructural: resolve_internal_transfer_destinations (migración 0161) resuelve
// la pata de SALIDA por IBAN del banco (nunca texto/tienda/etiqueta/IA). Escenarios modelados sobre los
// tres traspasos reales auditados (Familia Hepburn, 31/08→29/09/2026): Fernando 31/08 (ambas patas),
// Eric 11/09 (solo salida) y Fernando 18/09 (solo salida) — resultado esperado del periodo real:
// Eric 100 €, Fernando 200 €, total 300 €.
// exp() por defecto pone id: 'e' siempre igual — aquí hacen falta ids distintos de verdad, porque
// computeSavingsDestinedByMember cruza cada resolvedOut.expenseId contra `rows` por id.
let outLegCounter = 0
function outLeg(expenseDate: string, amount: number, category = 'Transferencias entre cuentas propias'): Expense {
  outLegCounter++
  return exp({ id: `out-${outLegCounter}`, expenseDate, amount, category, isIncome: false, ownerMemberId: null })
}
function resolvedOut(expenseId: string, destinationMemberId: string, amount: number, date: string) {
  return { expenseId, destinationMemberId, amount, date }
}

describe('computeSavingsDestinedByMember — resolución estructural por IBAN (resolvedOut)', () => {
  it('1. solo OUT resoluble (sin entrada sincronizada): cuenta igual, vía la salida', () => {
    const out = outLeg('2026-09-11', 100)
    const rows = [out]
    const result = computeSavingsDestinedByMember(rows, categories, [resolvedOut(out.id, 'eric', 100, '2026-09-11')])
    expect(result.get('eric')).toBe(100)
    expect(result.size).toBe(1)
  })

  it('2. solo IN (sin resolución de salida disponible): sigue funcionando el fallback de siempre', () => {
    const rows = [exp({ expenseDate: '2026-08-31', amount: 100, category: 'Movimientos internos', isIncome: true, ownerMemberId: 'fernando' })]
    const result = computeSavingsDestinedByMember(rows, categories, [])
    expect(result.get('fernando')).toBe(100)
  })

  it('3. OUT + IN de la misma transferencia: se cuenta UNA sola vez (prioridad OUT, IN se descarta)', () => {
    const out = outLeg('2026-08-31', 100)
    const inLeg = exp({ expenseDate: '2026-08-31', amount: 100, category: 'Movimientos internos', isIncome: true, ownerMemberId: 'fernando' })
    const rows = [out, inLeg]
    const result = computeSavingsDestinedByMember(rows, categories, [resolvedOut(out.id, 'fernando', 100, '2026-08-31')])
    expect(result.get('fernando')).toBe(100) // nunca 200
    expect(result.size).toBe(1)
  })

  it('4. sincronización tardía: la IN aparece más tarde y el total NO cambia (nunca pasa de 100 a 200)', () => {
    const out = outLeg('2026-09-11', 100)
    const rowsDia1 = [out]
    const resultDia1 = computeSavingsDestinedByMember(rowsDia1, categories, [resolvedOut(out.id, 'eric', 100, '2026-09-11')])
    expect(resultDia1.get('eric')).toBe(100)

    // Día posterior: aparece la pata de entrada (misma transferencia, sincronizada tarde).
    const inLeg = exp({ expenseDate: '2026-09-11', amount: 100, category: 'Movimientos internos', isIncome: true, ownerMemberId: 'eric' })
    const rowsDia2 = [out, inLeg]
    const resultDia2 = computeSavingsDestinedByMember(rowsDia2, categories, [resolvedOut(out.id, 'eric', 100, '2026-09-11')])
    expect(resultDia2.get('eric')).toBe(100) // sigue siendo 100, nunca 200
  })

  it('5/6/7. cuenta destino sin owner / IBAN desconocido / raw sin creditor_account: se resuelven en la RPC (0161), aquí simplemente no llegan en resolvedOut y no se cuentan', () => {
    // La RPC exige dst.owner_member_id is not null y creditor_account->>iban is not null — un traspaso
    // así nunca aparece en resolvedOut. Desde esta función, es indistinguible de "no hay resolución
    // disponible": cae al fallback de entrada si existe, o no cuenta a nadie si tampoco hay entrada.
    const out = outLeg('2026-09-11', 100)
    const result = computeSavingsDestinedByMember([out], categories, [])
    expect(result.size).toBe(0)
  })

  it('8. cuenta destino de otra familia: la RPC (RLS + filtro explícito de family_id) nunca la devuelve — aquí, simplemente no está en resolvedOut', () => {
    const out = outLeg('2026-09-11', 100)
    // Ningún resolvedOut para esta fila simula exactamente lo que hace la RPC cuando el único IBAN que
    // coincide pertenece a otra familia: no la resuelve.
    const result = computeSavingsDestinedByMember([out], categories, [])
    expect(result.has('eric')).toBe(false)
    expect(result.size).toBe(0)
  })

  it('9. tolerancia ±0,01€: una IN con 0,01€ de diferencia por redondeo bancario SÍ empareja con su OUT', () => {
    const out = outLeg('2026-08-31', 100)
    const inLeg = exp({ expenseDate: '2026-08-31', amount: 100.01, category: 'Movimientos internos', isIncome: true, ownerMemberId: 'fernando' })
    const result = computeSavingsDestinedByMember([out, inLeg], categories, [resolvedOut(out.id, 'fernando', 100, '2026-08-31')])
    expect(result.get('fernando')).toBe(100) // solo la OUT, la IN quedó emparejada y descartada
  })

  it('10. fuera de tolerancia (>0,01€) no empareja: comportamiento conservador documentado — se cuentan ambas por separado', () => {
    const out = outLeg('2026-08-31', 100)
    const inLeg = exp({ expenseDate: '2026-08-31', amount: 100.5, category: 'Movimientos internos', isIncome: true, ownerMemberId: 'fernando' })
    const result = computeSavingsDestinedByMember([out, inLeg], categories, [resolvedOut(out.id, 'fernando', 100, '2026-08-31')])
    // Documentado: sin coincidencia exacta (±0,01€) se tratan como dos eventos reales distintos, nunca
    // se fuerza un emparejamiento dudoso — 100 (OUT) + 100,50 (IN sin pareja) = 200,50.
    expect(result.get('fernando')).toBe(200.5)
  })

  it('11. fuera de la ventana temporal (>3 días) no empareja: mismo comportamiento conservador', () => {
    const out = outLeg('2026-08-31', 100)
    const inLeg = exp({ expenseDate: '2026-09-10', amount: 100, category: 'Movimientos internos', isIncome: true, ownerMemberId: 'fernando' })
    const result = computeSavingsDestinedByMember([out, inLeg], categories, [resolvedOut(out.id, 'fernando', 100, '2026-08-31')])
    expect(result.get('fernando')).toBe(200) // 100 (OUT) + 100 (IN, tratada como transferencia distinta)
  })

  it('12/13. matching 1:1 — dos OUT y dos IN del mismo importe/miembro: cada IN reclama su OUT más cercana en fecha, nunca las dos la misma', () => {
    const out1 = outLeg('2026-08-31', 100)
    const out2 = outLeg('2026-09-18', 100)
    const in1 = exp({ id: 'in1', expenseDate: '2026-08-31', amount: 100, category: 'Movimientos internos', isIncome: true, ownerMemberId: 'fernando' })
    const in2 = exp({ id: 'in2', expenseDate: '2026-09-18', amount: 100, category: 'Movimientos internos', isIncome: true, ownerMemberId: 'fernando' })
    const rows = [out1, out2, in1, in2]
    const result = computeSavingsDestinedByMember(
      rows,
      categories,
      [resolvedOut(out1.id, 'fernando', 100, '2026-08-31'), resolvedOut(out2.id, 'fernando', 100, '2026-09-18')],
    )
    // Dos transferencias reales de 100€ cada una a Fernando: total 200€, nunca 400€ (si las dos IN
    // colapsaran sobre la misma OUT) ni 100€ (si una OUT se usara dos veces).
    expect(result.get('fernando')).toBe(200)
  })

  it('14. varias transferencias a miembros diferentes, mezclando OUT resuelto y fallback de entrada', () => {
    const outEric = outLeg('2026-09-11', 100)
    const outFernando = outLeg('2026-09-18', 100)
    const inFernandoAntiguo = exp({ expenseDate: '2026-08-31', amount: 100, category: 'Movimientos internos', isIncome: true, ownerMemberId: 'fernando' })
    const rows = [outEric, outFernando, inFernandoAntiguo]
    const result = computeSavingsDestinedByMember(
      rows,
      categories,
      [resolvedOut(outEric.id, 'eric', 100, '2026-09-11'), resolvedOut(outFernando.id, 'fernando', 100, '2026-09-18')],
    )
    expect(result.get('eric')).toBe(100)
    expect(result.get('fernando')).toBe(200) // 100 (OUT 18/09) + 100 (IN 31/08, sin OUT que la empareje)
  })

  it('15. una salida resuelta cuyo expense YA NO está categorizado como traspaso interno no se cuenta', () => {
    // p. ej. alguien recategorizó a mano esa fila después de que se sincronizara — la RPC no sabe de
    // categorías (resuelve por IBAN), así que el cruce final lo hace esta función contra `rows`.
    const notInternal = outLeg('2026-09-11', 100, 'Supermercado, carnicería y tiendas de alimentación')
    const result = computeSavingsDestinedByMember([notInternal], categories, [resolvedOut(notInternal.id, 'eric', 100, '2026-09-11')])
    expect(result.size).toBe(0)
  })

  it('16. subcategoría "Transferencias entre cuentas propias" bajo "Movimientos internos" funciona igual que la categoría padre', () => {
    const out = outLeg('2026-09-11', 100, 'Transferencias entre cuentas propias')
    const result = computeSavingsDestinedByMember([out], categories, [resolvedOut(out.id, 'eric', 100, '2026-09-11')])
    expect(result.get('eric')).toBe(100)
  })

  it('17. sincronización tardía con varios periodos: el total del periodo se mantiene exacto pase lo que pase después', () => {
    const out = outLeg('2026-09-18', 100)
    const before = computeSavingsDestinedByMember([out], categories, [resolvedOut(out.id, 'fernando', 100, '2026-09-18')])
    const inLegLater = exp({ expenseDate: '2026-09-19', amount: 100, category: 'Movimientos internos', isIncome: true, ownerMemberId: 'fernando' })
    const after = computeSavingsDestinedByMember([out, inLegLater], categories, [resolvedOut(out.id, 'fernando', 100, '2026-09-18')])
    expect(before.get('fernando')).toBe(after.get('fernando'))
    expect(after.get('fernando')).toBe(100)
  })

  it('18. no hace falta ninguna etiqueta (tag) para identificar al miembro — resolvedOut no lleva tag_id en ningún sitio', () => {
    const out = outLeg('2026-09-11', 100)
    expect((out as unknown as { tagId: unknown }).tagId).toBeNull() // ninguna etiqueta puesta, y aun así se resuelve
    const result = computeSavingsDestinedByMember([out], categories, [resolvedOut(out.id, 'eric', 100, '2026-09-11')])
    expect(result.get('eric')).toBe(100)
  })

  it('19. no hace falta store/description — outLeg no lleva store y se resuelve igual', () => {
    const out = outLeg('2026-09-11', 100)
    expect(out.store).toBeNull()
    const result = computeSavingsDestinedByMember([out], categories, [resolvedOut(out.id, 'eric', 100, '2026-09-11')])
    expect(result.get('eric')).toBe(100)
  })

  it('20. aislamiento multi-familia: se prueba en la RPC (RLS + family_id explícito, migración 0161) — aquí solo se confirma que resolvedOut es la única fuente de verdad, nunca se recalcula ni se "adivina" una familia desde los datos locales', () => {
    const out = outLeg('2026-09-11', 100)
    // Sin ninguna resolución (como si la RPC hubiera descartado el IBAN por pertenecer a otra familia),
    // el traspaso no se atribuye a nadie — nunca se intenta reconstruir el destino desde amount/date/tag.
    const result = computeSavingsDestinedByMember([out], categories, [])
    expect(result.size).toBe(0)
  })

  it('regresión con forma real: Fernando OUT+IN (100), Eric solo OUT (100), Fernando solo OUT (100) → Eric 100, Fernando 200 — NUNCA 300 para Fernando ni duplicados', () => {
    const fernandoOut1 = outLeg('2026-08-31', 100) // tiene ambas patas
    const fernandoIn1 = exp({ expenseDate: '2026-08-31', amount: 100, category: 'Movimientos internos', isIncome: true, ownerMemberId: 'fernando' })
    const ericOut = outLeg('2026-09-11', 100) // solo salida
    const fernandoOut2 = outLeg('2026-09-18', 100) // solo salida
    const rows = [fernandoOut1, fernandoIn1, ericOut, fernandoOut2]
    const result = computeSavingsDestinedByMember(
      rows,
      categories,
      [
        resolvedOut(fernandoOut1.id, 'fernando', 100, '2026-08-31'),
        resolvedOut(ericOut.id, 'eric', 100, '2026-09-11'),
        resolvedOut(fernandoOut2.id, 'fernando', 100, '2026-09-18'),
      ],
    )
    expect(result.get('eric')).toBe(100)
    expect(result.get('fernando')).toBe(200) // nunca 300 (fernandoIn1 quedó emparejada y descartada)
    const total = [...result.values()].reduce((s, v) => s + v, 0)
    expect(total).toBe(300)
  })
})
