// ECO-CLASIF: clasificador bancario autónomo (supabase/functions/_shared/bank/classifyMovement.ts). Conceptos reales de comercios españoles; sin datos personales.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildLearningIndex,
  CASH_DEPOSIT,
  CASH_WITHDRAWAL,
  classifyMovement,
  merchantKey,
  normalizeConcept,
  resolveCategoryName,
  RULES,
  type FamilyCategoryRef,
  type HistoryRow,
} from '../../supabase/functions/_shared/bank/classifyMovement.ts'
import { isCashWithdrawalText } from './cashWithdrawals'
import { isCashDepositText } from './bankCash'

const G = 'generales'
const I = 'ingresos'
const cat = (name: string, catalogKey: string | null, budgetGroup = G): FamilyCategoryRef => ({ name, catalogKey, budgetGroup })

// Las categorías de una familia con el catálogo general completo (nombres tal como los ve la familia).
const FAMILY: FamilyCategoryRef[] = [
  cat('Supermercado, carnicería y tiendas de alimentación', 'g.alimentacion.supermercado'),
  cat('Restaurantes, bares y cafeterías', 'g.alimentacion.restaurantes'),
  cat('Combustible', 'g.transporte_vehiculo.combustible'),
  cat('Aparcamiento y peajes', 'g.transporte_vehiculo.aparcamiento_peajes'),
  cat('Mantenimiento y reparaciones', 'g.transporte_vehiculo.mantenimiento_reparaciones'),
  cat('Transporte público / taxi', 'g.transporte_vehiculo.transporte_publico_taxi'),
  cat('Seguro / financiación del vehículo', 'g.transporte_vehiculo.seguro_financiacion_vehiculo'),
  cat('Electricidad', 'g.vivienda_hogar.electricidad'),
  cat('Gas', 'g.vivienda_hogar.gas'),
  cat('Agua', 'g.vivienda_hogar.agua'),
  cat('Comunidad de vecinos', 'g.vivienda_hogar.comunidad'),
  cat('Suministros', 'g.vivienda_hogar.suministros'),
  cat('Alquiler / hipoteca', 'g.vivienda_hogar.alquiler_hipoteca'),
  cat('Mantenimiento y hogar', 'g.vivienda_hogar.mantenimiento_hogar'),
  cat('Seguro de hogar', 'g.vivienda_hogar.seguro_hogar'),
  cat('Teléfono e Internet', 'g.comunicaciones_servicios.telefono_internet'),
  cat('Software y aplicaciones', 'g.comunicaciones_servicios.software_aplicaciones'),
  cat('Suscripciones y entretenimiento', 'g.ocio_viajes.suscripciones_entretenimiento'),
  cat('Ocio y cultura', 'g.ocio_viajes.ocio_cultura'),
  cat('Aficiones', 'g.ocio_viajes.aficiones'),
  cat('Viajes y vacaciones', 'g.ocio_viajes.viajes_vacaciones'),
  cat('Seguros', 'g.finanzas_obligaciones.seguros'),
  cat('Préstamos e intereses', 'g.finanzas_obligaciones.prestamos_intereses'),
  cat('Comisiones y cargos', 'g.finanzas_obligaciones.comisiones_cargos'),
  cat('Impuestos', 'g.finanzas_obligaciones.impuestos'),
  cat('Multas / obligaciones', 'g.finanzas_obligaciones.multas_obligaciones'),
  cat('Asesoría', 'g.finanzas_obligaciones.asesoria'),
  cat('Salud y farmacia', 'g.salud_bienestar.salud_farmacia'),
  cat('Médicos, dentista y óptica', 'g.salud_bienestar.medicos_dentista_optica'),
  cat('Deporte y fitness', 'g.salud_bienestar.deporte_fitness'),
  cat('Belleza y cuidado personal', 'g.salud_bienestar.belleza_cuidado_personal'),
  cat('Ropa y accesorios', 'g.compras_familia.ropa_accesorios'),
  cat('Casa y jardín', 'g.compras_familia.casa_jardin'),
  cat('Mascotas', 'g.compras_familia.mascotas'),
  cat('Niños', 'g.compras_familia.ninos'),
  cat('Tecnología y electrónica', 'g.compras_familia.tecnologia_electronica'),
  cat('Regalos y compras varias', 'g.compras_familia.regalos_compras_varias'),
  cat('Educación', 'g.educacion'),
  cat('Retirada de efectivo', 'g.movimientos_internos.retirada_efectivo'),
  cat('Transferencias entre cuentas propias', 'g.movimientos_internos.transferencias_propias'),
  cat('Donaciones y ONG', 'g.otros.donaciones'),
  cat('Otros', 'g.otros'),
  cat('Ingreso', 'i.ingreso', I),
  cat('Sueldo', 'i.sueldo', I),
  cat('Pensión y prestaciones', 'i.ingreso.pensiones_prestaciones', I),
  cat('Intereses y rentas', 'i.ingreso.intereses_rentas', I),
  cat('Devoluciones', 'i.ingreso.devoluciones', I),
  cat('Movimientos internos', 'i.movimientos_internos', I),
]

const gasto = (store: string, extra: Partial<Parameters<typeof classifyMovement>[0]> = {}) => classifyMovement({ store, isIncome: false, categories: FAMILY, ...extra })
const ingreso = (store: string, extra: Partial<Parameters<typeof classifyMovement>[0]> = {}) => classifyMovement({ store, isIncome: true, categories: FAMILY, ...extra })
const keyOf = (r: ReturnType<typeof gasto>) => r.catalogKey

describe('normalización y comercio', () => {
  it('quita acentos, signos y mayúsculas', () => {
    expect(normalizeConcept('ENDESA ENERGÍA, S.A.')).toBe(' endesa energia s a ')
    expect(normalizeConcept(null)).toBe(' ')
  })
  it('la identidad del comercio ignora prefijos del banco, tarjeta, fechas, referencias, forma legal y ciudad', () => {
    expect(merchantKey('MERCADONA-RAFAL')).toBe('mercadona')
    expect(merchantKey('COMPRA TARJ. 5402XXXXXXXX4041 MERCADONA-RAFAL')).toBe('mercadona')
    expect(merchantKey('WWW.AMAZON* 7V62L4X05-LUXEMBOURG')).toBe('amazon')
    expect(merchantKey('27.07 H M-Barcelona')).toBe('h m')
    expect(merchantKey('ENDESA ENERGIA S.A.')).toBe('endesa energia')
    expect(merchantKey('')).toBe('')
  })
})

describe('los ejemplos del encargo', () => {
  it.each([
    ['ENDESA ENERGÍA', 'g.vivienda_hogar.electricidad'],
    ['NETFLIX', 'g.ocio_viajes.suscripciones_entretenimiento'],
    ['REPSOL ESTACIÓN DE SERVICIO', 'g.transporte_vehiculo.combustible'],
    ['SEGURO HOGAR', 'g.vivienda_hogar.seguro_hogar'],
    ['MERCADONA', 'g.alimentacion.supermercado'],
  ])('%s → %s con confianza alta y sin pedir confirmación', (concept, key) => {
    const r = gasto(concept)
    expect(keyOf(r)).toBe(key)
    expect(r.confidence).toBe('alta')
    expect(r.source).toBe('auto')
    expect(r.category).not.toBeNull()
  })
  it('la nómina es un ingreso laboral', () => {
    const r = ingreso('NOMINA EMPRESA SL')
    expect(r.category).toBe('Sueldo')
    expect(r.source).toBe('auto')
  })
})

describe('conceptos reales de una familia sin historial', () => {
  const alta: [string, string][] = [
    ['FCIA. MARIANO CAYUELAS-RAFAL', 'g.salud_bienestar.salud_farmacia'],
    ['FCIA. MORENO-ALMORADI', 'g.salud_bienestar.salud_farmacia'],
    ['CLINICA DENTAL-ALMORADI', 'g.salud_bienestar.medicos_dentista_optica'],
    ['BAR PARRALA-RAFAL', 'g.alimentacion.restaurantes'],
    ['ASADOR SESE-RAFAL', 'g.alimentacion.restaurantes'],
    ['PIZZERIA BRAVO-ORIHUELA', 'g.alimentacion.restaurantes'],
    ['ANTHROPIC* CLAUDE SUB-DUBLIN', 'g.comunicaciones_servicios.software_aplicaciones'],
    ['GOOGLE*GOOGLE ONE-DUBLIN', 'g.comunicaciones_servicios.software_aplicaciones'],
    ['SUPABASE-SINGAPORE', 'g.comunicaciones_servicios.software_aplicaciones'],
    ['OVHcloud-Madrid', 'g.comunicaciones_servicios.software_aplicaciones'],
    ['SKYSHOWTIME-Amsterdam', 'g.ocio_viajes.suscripciones_entretenimiento'],
    ['COFIDIS', 'g.finanzas_obligaciones.prestamos_intereses'],
    ['COFIDIS AMAZON-CORNELLA DE L', 'g.finanzas_obligaciones.prestamos_intereses'],
    ['PRESTAMOS ADEUDO CUOTA N.8077731039 30/06/26', 'g.finanzas_obligaciones.prestamos_intereses'],
    ['PANADERIA LOS MELLIZOS-RAFAL', 'g.alimentacion.supermercado'],
    ['MAKRO ASIA-ALMORADI', 'g.alimentacion.supermercado'],
    ['SUPERMERCADO COVIRAN-ALMORADI', 'g.alimentacion.supermercado'],
    ['SUPERMERCADO SERMUCO-CIEZA', 'g.alimentacion.supermercado'],
    ['DIA 36136-ALMORADI', 'g.alimentacion.supermercado'],
    ['H M-Barcelona', 'g.compras_familia.ropa_accesorios'],
    ['27.07 H M-Barcelona', 'g.compras_familia.ropa_accesorios'],
    ['INTERESES Y/O COMISIONES CUENTA', 'g.finanzas_obligaciones.comisiones_cargos'],
    ['COMISIÓN DIVISA NO EURO', 'g.finanzas_obligaciones.comisiones_cargos'],
    ['E.S. POLIGONO LAS MAROMAS-ALMORADI', 'g.transporte_vehiculo.combustible'],
    ['E.S. ABANILLA-SANTOMERA', 'g.transporte_vehiculo.combustible'],
    ['E S THADER-MURCIA', 'g.transporte_vehiculo.combustible'],
    ['BANSABADELL VIDA,S.A.', 'g.finanzas_obligaciones.seguros'],
    ['FERRETERIA FERBRICO-RAFAL', 'g.vivienda_hogar.mantenimiento_hogar'],
    ['HIDRAQUA, GESTION INTEGRAL DE AGUAS DE LEVANTE,SAU', 'g.vivienda_hogar.agua'],
    ['HIDRAQUA, S.A.U.', 'g.vivienda_hogar.agua'],
    ['SOCIETAT VALENCIANA ITVS-VALENCIA', 'g.transporte_vehiculo.mantenimiento_reparaciones'],
    ['PC COMPONENTES-ALHAMA DE MUR', 'g.compras_familia.tecnologia_electronica'],
    ['SeQura-PCComponentes-Barcelona', 'g.compras_familia.tecnologia_electronica'],
    ['REINTEGRO CAJERO AUTOMATICO 5402XXXXXXXX4041 30.06', 'g.movimientos_internos.retirada_efectivo'],
  ]
  it.each(alta)('%s → %s', (concept, key) => {
    const r = gasto(concept)
    expect(keyOf(r)).toBe(key)
    expect(r.category).not.toBeNull()
    expect(['auto', 'sugerida']).toContain(r.source)
  })
  it('lo menos seguro se aplica pero queda marcado como «sugerida»', () => {
    for (const concept of ['APA ALUMNOS Y AMIGOS C.P. TRINITARIO', 'ROBOTIKIDS-ALICANTE', 'DNI/PASAPORTE ELCHE-ELCHE/ELX', 'UBER TRIP']) {
      const r = gasto(concept)
      expect(r.confidence, concept).toBe('media')
      expect(r.source, concept).toBe('sugerida')
      expect(r.category, concept).not.toBeNull()
    }
  })
  it('lo que no se puede deducir del nombre queda PENDIENTE (sin inventar categoría), nunca en «Otros»', () => {
    for (const concept of ['WWW.AMAZON-LUXEMBOURG', 'WWW.AMAZON* 7V62L4X05-LUXEMBOURG', 'SumUp *Movileuropa HN-Almoradi', 'PAGO BIZUM FRANCISCO S. H.']) {
      const r = gasto(concept)
      expect(r.category, concept).toBeNull()
      expect(r.confidence, concept).toBe('baja')
      expect(r.source, concept).toBeNull()
    }
  })
  it('un pago a plazos queda pendiente CON una sugerencia razonada', () => {
    const r = gasto('SeQura-BARCELONA')
    expect(r.category).toBeNull()
    expect(r.suggestion).toBe('Préstamos e intereses')
    const bank = gasto('BANCO BILBAO VIZCAYA ARGENTARIA S.A.')
    expect(bank.category).toBeNull()
    expect(bank.suggestion).toBe('Préstamos e intereses')
  })
  it('sin ninguna pista, «Otros» como último recurso (y sin marca)', () => {
    for (const concept of ['Stikets-Igualada', 'JOSE VALERO-RAFAL', 'E. I. LAS CASITAS 2015 S.L.', 'NANONOBLE PTE. LTD.-SINGAPORE', 'MGI MURCIA THADER-MURCIA']) {
      const r = gasto(concept)
      expect(r.category, concept).toBe('Otros')
      expect(r.source, concept).toBeNull()
      expect(r.confidence, concept).toBeNull()
    }
  })
  it('sobre los ~50 comercios reales de esa familia, la mayoría se clasifica y ninguno se equivoca de forma evidente', () => {
    const concepts = [...alta.map((a) => a[0]), 'APA ALUMNOS Y AMIGOS C.P. TRINITARIO', 'ROBOTIKIDS-ALICANTE', 'DNI/PASAPORTE ELCHE-ELCHE/ELX', 'SeQura-BARCELONA', 'BANCO BILBAO VIZCAYA ARGENTARIA S.A.', 'WWW.AMAZON-LUXEMBOURG', 'SumUp *Movileuropa HN-Almoradi', 'PAGO BIZUM FRANCISCO S. H.', 'Stikets-Igualada', 'JOSE VALERO-RAFAL', 'E. I. LAS CASITAS 2015 S.L.', 'NANONOBLE PTE. LTD.-SINGAPORE', 'MGI MURCIA THADER-MURCIA', 'EVERAK SOLUCIONES PROFESI-ALMORADI']
    const results = concepts.map((c) => gasto(c))
    const resolved = results.filter((r) => r.category && r.category !== 'Otros').length
    const otros = results.filter((r) => r.category === 'Otros').length
    const pendientes = results.filter((r) => r.category === null).length
    expect(resolved + otros + pendientes).toBe(concepts.length)
    // Medida real sobre estos comercios: lo no resuelto son comercios que su nombre no permite deducir (Amazon, Bizum, un datáfono SumUp, un banco, nombres
    // propios): el clasificador los deja pendientes o en «Otros» en vez de adivinar.
    expect(otros).toBeLessThanOrEqual(6)
    expect(resolved / concepts.length).toBeGreaterThan(0.75)
  })
})

describe('ambigüedad y falsos positivos', () => {
  it('«Movistar Plus» es una suscripción y «Movistar» es telefonía', () => {
    expect(keyOf(gasto('MOVISTAR PLUS'))).toBe('g.ocio_viajes.suscripciones_entretenimiento')
    expect(keyOf(gasto('MOVISTAR'))).toBe('g.comunicaciones_servicios.telefono_internet')
  })
  it('«Uber Eats» es comida y «Uber» es transporte', () => {
    expect(keyOf(gasto('UBER EATS'))).toBe('g.alimentacion.restaurantes')
    expect(keyOf(gasto('UBER *TRIP'))).toBe('g.transporte_vehiculo.transporte_publico_taxi')
  })
  it('una clínica veterinaria es de mascotas, no de médicos', () => {
    expect(keyOf(gasto('CLINICA VETERINARIA EL PARQUE'))).toBe('g.compras_familia.mascotas')
  })
  it('palabras enteras: «consumo» no es Consum y «bar» no está dentro de «Barcelona»', () => {
    expect(gasto('CONSUMO ENERGIA RENOVABLE SL').catalogKey).not.toBe('g.alimentacion.supermercado')
    expect(gasto('TIENDA-BARCELONA').category).toBe('Otros')
  })
  it('el alquiler de un coche no es la hipoteca', () => {
    expect(keyOf(gasto('RENTALCARS ALQUILER COCHE'))).toBe('g.ocio_viajes.viajes_vacaciones')
    expect(keyOf(gasto('ALQUILER VIVIENDA MARZO'))).toBe('g.vivienda_hogar.alquiler_hipoteca')
  })
  it('un mismo comercio puede ser de varias categorías: sin decisión previa se aplica la regla; con decisiones mixtas se baja a sugerencia', () => {
    const mixed = buildLearningIndex([
      { store: 'EL CORTE INGLES', category: 'Ropa y accesorios', source: 'manual' },
      { store: 'EL CORTE INGLES', category: 'Casa y jardín', source: 'manual' },
    ])
    const r = gasto('EL CORTE INGLES', { learning: mixed })
    expect(r.confidence).toBe('media')
    expect(r.source).toBe('sugerida')
  })
})

describe('aprendizaje: la familia manda', () => {
  const manual = (store: string, category: string): HistoryRow => ({ store, category, source: 'manual' })
  it('lo que la familia decidió a mano para un comercio gana a la regla y es de confianza alta', () => {
    const learning = buildLearningIndex([manual('MERCADONA-RAFAL', 'Casa y jardín')])
    const r = gasto('MERCADONA-ALMORADI', { learning })
    expect(r.category).toBe('Casa y jardín')
    expect(r.confidence).toBe('alta')
    expect(r.reason).toBe('aprendizaje')
  })
  it('lo que PEPA clasificó sola no se usa para reforzarse a sí misma', () => {
    const learning = buildLearningIndex([
      { store: 'STIKETS-Igualada', category: 'Aficiones', source: 'auto' },
      { store: 'STIKETS-Igualada', category: 'Aficiones', source: 'sugerida' },
      { store: 'STIKETS-Igualada', category: 'Aficiones', source: 'auto' },
    ])
    expect(gasto('STIKETS-Igualada', { learning }).category).toBe('Otros')
  })
  it('movimientos antiguos sin marca: con ≥2 iguales se propone como sugerencia, con uno solo no', () => {
    const two = buildLearningIndex([
      { store: 'TALLER PEPE', category: 'Mantenimiento y reparaciones', source: null },
      { store: 'TALLER PEPE', category: 'Mantenimiento y reparaciones', source: null },
    ])
    const r = gasto('TALLER LOLA-MURCIA', { learning: two })
    expect(r.category).toBe('Mantenimiento y reparaciones') // por regla «taller»
    const unknown = buildLearningIndex([
      { store: 'LA FRAGUA SL', category: 'Aficiones', source: null },
      { store: 'LA FRAGUA SL', category: 'Aficiones', source: null },
    ])
    const s = gasto('LA FRAGUA SL', { learning: unknown })
    expect(s.confidence).toBe('media')
    expect(s.source).toBe('sugerida')
    const one = buildLearningIndex([{ store: 'LA FRAGUA SL', category: 'Aficiones', source: null }])
    expect(gasto('LA FRAGUA SL', { learning: one }).category).toBe('Otros')
  })
  it('la costumbre de la familia (≥3 movimientos antiguos, siempre lo mismo) gana a las reglas: Endesa en «Suministros» no pasa a «Electricidad»', () => {
    const learning = buildLearningIndex(Array.from({ length: 5 }, () => ({ store: 'ENDESA ENERGIA S.A.', category: 'Suministros', source: null }) as HistoryRow))
    const r = gasto('ENDESA ENERGIA S.A.', { learning })
    expect(r.category).toBe('Suministros')
    expect(r.confidence).toBe('alta')
    expect(r.reason).toBe('historial')
  })
  it('si la familia no es constante con un comercio (menos del 80 %), manda la regla y no la costumbre', () => {
    const rows: HistoryRow[] = [
      ...Array.from({ length: 5 }, () => ({ store: 'FARMACIA SUR', category: 'Salud y farmacia', source: null }) as HistoryRow),
      { store: 'FARMACIA SUR', category: 'Belleza y cuidado personal', source: null },
      { store: 'FARMACIA SUR', category: 'Supermercado, carnicería y tiendas de alimentación', source: null },
    ]
    const r = gasto('FARMACIA SUR', { learning: buildLearningIndex(rows) })
    expect(r.category).toBe('Salud y farmacia')
    expect(r.reason).toBe('regla')
  })
  it('«Repsol» a secas es una sugerencia (gasolina, luz o gas); con «estación de servicio» es seguro', () => {
    expect(gasto('REPSOL').source).toBe('sugerida')
    expect(gasto('REPSOL LUZ Y GAS').catalogKey).toBe('g.vivienda_hogar.electricidad')
    expect(gasto('REPSOL ESTACION DE SERVICIO').source).toBe('auto')
  })
  it('una categoría que la familia ya no tiene no se usa', () => {
    const learning = buildLearningIndex([manual('MERCADONA', 'Categoría borrada')])
    expect(gasto('MERCADONA', { learning }).catalogKey).toBe('g.alimentacion.supermercado')
  })
})

describe('operaciones especiales', () => {
  it('retirada de efectivo y traspasos propios no son gasto: van a Movimientos internos', () => {
    expect(gasto('REINTEGRO CAJERO AUTOMATICO').category).toBe('Retirada de efectivo')
    expect(gasto('TRASPASO A CUENTA AHORRO').category).toBe('Transferencias entre cuentas propias')
    expect(ingreso('TRASPASO DESDE CUENTA CORRIENTE').category).toBe('Movimientos internos')
    expect(ingreso('INGRESO EFECTIVO CAJERO AUTOMATICO').category).toBe('Movimientos internos')
  })
  it('los patrones de efectivo coinciden con los de la app (retiradas e ingresos)', () => {
    for (const t of ['REINTEGRO CAJERO AUTOMÁTICO', 'DISPOSICION EFECTIVO CAJERO', 'RETIRADA DE EFECTIVO', 'COMPRA EN MERCADONA', 'ATM 4455']) {
      expect(CASH_WITHDRAWAL.test(normalizeConcept(t).trim()), t).toBe(isCashWithdrawalText(t))
    }
    for (const t of ['INGRESO EFECTIVO CAJERO AUTOMATICO', 'INGRESO EN EFECTIVO', 'INGRESO DE EFECTIVO', 'NOMINA']) {
      expect(CASH_DEPOSIT.test(normalizeConcept(t).trim()), t).toBe(isCashDepositText(t))
    }
  })
  it('los ingresos: sueldo, pensión, intereses y devoluciones', () => {
    expect(ingreso('TRANSFERENCIA NOMINA OCTUBRE').category).toBe('Sueldo')
    expect(ingreso('INSS PENSION JUBILACION').category).toBe('Pensión y prestaciones')
    expect(ingreso('LIQUIDACION INTERESES CUENTA').category).toBe('Intereses y rentas')
    expect(ingreso('DEVOLUCION COMPRA ZARA').category).toBe('Devoluciones')
  })
  it('una transferencia recibida NO se da por ingreso real: queda como «Ingreso» sin marca y sin inventar nada', () => {
    const r = ingreso('TRANSFERENCIA DE JUAN PEREZ')
    expect(r.category).toBe('Ingreso')
    expect(r.source).toBeNull()
    expect(r.confidence).toBe('baja')
  })
  it('un movimiento hacia o desde una persona de la familia se sugiere como traspaso, sin decidirlo', () => {
    const out = gasto('Marta Lopez Ruiz', { memberNames: ['Marta Lopez Ruiz', 'Pablo'] })
    expect(out.category).toBeNull()
    expect(out.suggestion).toBe('Transferencias entre cuentas propias')
    const inn = ingreso('TRANSFERENCIA DE PABLO', { memberNames: ['Marta Lopez Ruiz', 'Pablo'] })
    expect(inn.category).toBe('Ingreso')
    expect(inn.suggestion).toBe('Movimientos internos')
    // sin ser de la familia, una persona cualquiera no se interpreta
    expect(gasto('Marta Lopez Ruiz').category).toBe('Otros')
  })
})

describe('categorías de cada familia', () => {
  it('la identidad es la clave del catálogo: una familia que renombró «Combustible» sigue funcionando', () => {
    const renamed = FAMILY.map((c) => (c.catalogKey === 'g.transporte_vehiculo.combustible' ? { ...c, name: 'Gasolina del coche' } : c))
    expect(classifyMovement({ store: 'REPSOL', isIncome: false, categories: renamed }).category).toBe('Gasolina del coche')
  })
  it('si la familia no tiene la categoría concreta se usa la más general que sí tiene', () => {
    const noElec = FAMILY.filter((c) => c.catalogKey !== 'g.vivienda_hogar.electricidad')
    expect(classifyMovement({ store: 'ENDESA', isIncome: false, categories: noElec }).category).toBe('Suministros')
    expect(resolveCategoryName('g.vivienda_hogar.electricidad', 'gasto', noElec)?.key).toBe('g.vivienda_hogar.suministros')
  })
  it('si no tiene ninguna adecuada, no inventa: «Otros»', () => {
    const few = [cat('Otros', 'g.otros'), cat('Ingreso', 'i.ingreso', I)]
    const r = classifyMovement({ store: 'ENDESA', isIncome: false, categories: few })
    expect(r.category).toBe('Otros')
    expect(r.source).toBeNull()
  })
  it('una categoría personal sin catalog_key no se ve afectada ni se usa por nombre parecido', () => {
    const custom = [...FAMILY, cat('Combustible del tractor', null)]
    expect(classifyMovement({ store: 'REPSOL', isIncome: false, categories: custom }).category).toBe('Combustible')
  })
})

describe('las reglas solo usan claves reales del catálogo', () => {
  const dir = join(process.cwd(), 'supabase/migrations')
  const sql = readdirSync(dir).filter((f) => f.endsWith('.sql')).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n')
  it('cada clave de regla existe en las migraciones del catálogo', () => {
    for (const rule of RULES) {
      if (rule.key === null) continue
      expect(sql, `${rule.id} → ${rule.key}`).toContain(`'${rule.key}'`)
    }
  })
  it('no hay dos reglas con el mismo identificador', () => {
    const ids = RULES.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
