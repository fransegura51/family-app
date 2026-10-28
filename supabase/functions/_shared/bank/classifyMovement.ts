// ECO-CLASIF — clasificación automática de movimientos bancarios. Lógica PURA (sin red ni base de datos): la usan la función de sincronización
// del banco (Deno) y la app (para ofrecer revisar lo que quedó en «Otros»). Se amplía el clasificador que ya existía (una lista corta de palabras
// dentro de enable-banking-sync-transactions); no hay otro clasificador ni otro catálogo.
//
// Cómo decide (de más a menos fiable):
//   1. APRENDIZAJE: lo que la familia ya decidió a mano para ese comercio manda siempre (confianza alta). Si en el pasado puso categorías
//      distintas al mismo comercio, no se fía: el comercio es «mixto» y todo lo que se deduzca baja a sugerencia.
//   2. REGLAS por clave del catálogo (Electricidad, Combustible, Suscripciones…): la identidad es catalog_key, nunca el nombre visible, así que una
//      familia que renombró «Combustible» sigue funcionando. Cada regla trae su confianza.
//   3. HISTORIAL no confirmado: si el comercio ya tenía ≥2 movimientos con la misma categoría (que nadie corrigió), se propone como sugerencia.
//   4. Nada de lo anterior: «Otros» (gasto) o «Ingreso» (abono) como último recurso.
//
// Confianza → qué se guarda (expenses.category / category_source / category_suggestion, ver migración 0340):
//   alta  → category = la elegida, source = 'auto'      (no se pide confirmar nada)
//   media → category = la elegida, source = 'sugerida'  (se enseña discretamente «sugerida» y se corrige con un toque)
//   baja  → gasto: category = NULL (Pendiente de clasificar) y la sugerencia razonada, si la hay; abono: «Ingreso» + sugerencia
//   ninguna → «Otros» / «Ingreso», sin marca
// No se inventan porcentajes. Una decisión manual nunca se sobrescribe: este módulo solo se usa para movimientos NUEVOS o por petición expresa.

export type Confidence = 'alta' | 'media' | 'baja'
export type MovementFlow = 'gasto' | 'ingreso'

export interface FamilyCategoryRef {
  name: string
  catalogKey: string | null
  /** 'generales' (gastos) o 'ingresos'; los de alimentación se tratan como gastos. */
  budgetGroup: string
}

export interface HistoryRow {
  store: string | null
  category: string | null
  source: 'auto' | 'sugerida' | 'manual' | null
}

export type ClassificationReason = 'aprendizaje' | 'regla' | 'historial' | 'persona' | 'ninguna'

export interface BankClassification {
  /** Nombre de la categoría de la familia que se guarda (null = pendiente de clasificar). */
  category: string | null
  /** Marca de origen para expenses.category_source (null = sin marca). */
  source: 'auto' | 'sugerida' | null
  /** Nombre de la categoría sugerida cuando el movimiento queda pendiente (o «Ingreso» con duda). */
  suggestion: string | null
  confidence: Confidence | null
  reason: ClassificationReason
  /** Clave del catálogo en la que se apoyó (si hubo). */
  catalogKey: string | null
}

// ───────────────────────── Normalización ─────────────────────────

// Marcas diacríticas combinadas (acentos tras normalizar a NFD), construidas por código para no depender de caracteres invisibles en el archivo.
const COMBINING_MARKS = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g')
const MASKED_CARD = /^[0-9x*]{8,}$/
const LEGAL_SUFFIX = new Set(['sa', 'sl', 'slu', 'sau', 'sll', 'scl', 'ltd', 'pte', 'limited', 'sucursal', 'en', 'espana', 'de', 'del', 'la', 'el', 'los', 'las', 'y'])
const BOILERPLATE = /^(compra tarj|adeudo|recibo|transferencia a favor de|transferencia de|bizum a|bizum de|pago bizum|pago en|pago a|pago)\b\.?\s*/

/** Minúsculas, sin acentos y con todo lo que no sea letra o número convertido en un solo espacio; empieza y acaba con espacio para casar palabras enteras. */
export function normalizeConcept(raw: string | null | undefined): string {
  const base = (raw ?? '')
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  return base ? ` ${base} ` : ' '
}

function stripBoilerplate(normalized: string): string {
  let t = normalized.trim()
  for (let i = 0; i < 3; i++) {
    const next = t.replace(BOILERPLATE, '')
    if (next === t) break
    t = next
  }
  return t
}

/**
 * Identidad estable de un comercio para APRENDER de él: sin prefijos bancarios, sin tarjeta enmascarada, sin fechas, referencias ni ciudad
 * («MERCADONA-RAFAL» y «MERCADONA S.A.» → «mercadona»; «WWW.AMAZON* 7V62L4X05-LUXEMBOURG» → «amazon»). Máximo tres palabras.
 */
export function merchantKey(raw: string | null | undefined): string {
  const text = (raw ?? '').normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase()
  // La ciudad va tras el último guion pegado («comercio-ciudad»): se queda lo anterior.
  const head = text.includes('-') ? text.slice(0, text.lastIndexOf('-')) : text
  const words = stripBoilerplate(` ${head.replace(/[^a-z0-9]+/g, ' ').trim()} `)
    .replace(/( s a u| s l u| s a| s l| s c l| s l l)+$/, '') // forma legal al final («S.A.», «S.L.U.»)
    .split(' ')
    .filter(Boolean)
    .filter((w) => !MASKED_CARD.test(w))
    .filter((w) => !(/\d/.test(w) && w.length >= 4)) // referencias, números de tienda largos, fechas
    .filter((w) => !/^\d{1,2}$/.test(w)) // día/mes sueltos de «27.07 H M»
    .filter((w) => !LEGAL_SUFFIX.has(w))
    .filter((w) => w !== 'www' && w !== 'com' && w !== 'es')
  return words.slice(0, 3).join(' ')
}

// ───────────────────────── Reglas ─────────────────────────

type Matcher = string | RegExp

interface Rule {
  id: string
  /** Frases (palabras enteras; con * final = prefijo) o expresiones regulares sobre el concepto normalizado. */
  match: Matcher[]
  /** Clave de catalog_categories. null = sin categoría propuesta (pendiente sin sugerencia). */
  key: string | null
  confidence: Confidence
  flow: MovementFlow | 'ambos'
}

const R = (id: string, flow: Rule['flow'], confidence: Confidence, key: string | null, ...match: Matcher[]): Rule => ({ id, match, key, confidence, flow })

export const CASH_WITHDRAWAL = /(reintegro|disposicion|retirada|extraccion)\s+(de\s+)?(efectivo|en cajero|cajero)|cajero automatico|\batm\b/
export const CASH_DEPOSIT = /ingreso\s+(de\s+|en\s+)?(efectivo|cajero)|efectivo\s+cajero|cajero automatico ingreso/

// El ORDEN importa: lo específico antes que lo general («movistar plus» antes que «movistar»; «veterinaria» antes que «clínica»).
export const RULES: Rule[] = [
  // Movimientos que no son gasto ni ingreso reales
  R('efectivo-retirada', 'gasto', 'alta', 'g.movimientos_internos.retirada_efectivo', CASH_WITHDRAWAL),
  R('efectivo-ingreso', 'ingreso', 'alta', 'i.movimientos_internos', CASH_DEPOSIT),
  R('traspaso-propio', 'gasto', 'alta', 'g.movimientos_internos.transferencias_propias', 'traspaso*', 'entre cuentas', 'cuentas propias'),
  R('traspaso-propio-ing', 'ingreso', 'alta', 'i.movimientos_internos', 'traspaso*', 'entre cuentas', 'cuentas propias'),
  R('comisiones', 'gasto', 'alta', 'g.finanzas_obligaciones.comisiones_cargos', 'comision*', 'intereses y o comisiones', 'mantenimiento cuenta', 'mantenimiento de cuenta', 'cuota tarjeta', 'descubierto'),

  // Ingresos
  R('nomina', 'ingreso', 'alta', 'i.sueldo', 'nomina*', 'salario*', 'sueldo*', 'haberes', 'retribucion*', 'paga extra'),
  R('pension', 'ingreso', 'alta', 'i.ingreso.pensiones_prestaciones', 'pension*', 'prestacion*', 'desempleo', 'sepe', 'inss', 'seguridad social', 'ingreso minimo'),
  R('intereses-ing', 'ingreso', 'alta', 'i.ingreso.intereses_rentas', 'intereses*', 'dividendo*', 'rendimientos'),
  R('devolucion-ing', 'ingreso', 'media', 'i.ingreso.devoluciones', 'devolucion*', 'reembolso*', 'agencia tributaria', 'aeat'),
  R('bizum-ing', 'ingreso', 'baja', null, 'bizum*', 'transferencia*'),

  // Deudas, seguros y obligaciones
  R('hipoteca', 'gasto', 'alta', 'g.vivienda_hogar.alquiler_hipoteca', 'hipoteca*', 'prestamo hipotecario'),
  R('seguro-hogar', 'gasto', 'alta', 'g.vivienda_hogar.seguro_hogar', 'seguro de hogar', 'seguro hogar', 'hogar seguro'),
  R('seguro-vehiculo', 'gasto', 'alta', 'g.transporte_vehiculo.seguro_financiacion_vehiculo', 'seguro de coche', 'seguro coche', 'seguro auto', 'seguro de auto', 'seguro vehiculo', 'seguro moto'),
  R('seguros', 'gasto', 'alta', 'g.finanzas_obligaciones.seguros', 'seguro*', 'mapfre', 'mutua madrilena', 'axa', 'allianz', 'zurich', 'linea directa', 'caser', 'reale', 'ocaso', 'generali', 'sanitas', 'adeslas', 'asisa', 'dkv', 'santalucia', 'nationale nederlanden', 'catalana occidente', 'plus ultra', 'verti', 'pelayo', 'fiatc', 'helvetia', 'previsora', /\bvida\b/),
  R('prestamo-cofidis', 'gasto', 'alta', 'g.finanzas_obligaciones.prestamos_intereses', 'cofidis', 'prestamo*', 'cuota prestamo', 'financiera', 'cetelem', 'santander consumer', 'younited', 'aplazame', 'oney', 'klarna'),
  R('pccomponentes', 'gasto', 'alta', 'g.compras_familia.tecnologia_electronica', 'pc componentes', 'pccomponentes', 'mediamarkt', 'media markt', 'fnac', 'worten', 'coolmod', 'phone house'),
  R('sequra', 'gasto', 'baja', 'g.finanzas_obligaciones.prestamos_intereses', 'sequra'),
  R('impuestos', 'gasto', 'alta', 'g.finanzas_obligaciones.impuestos', 'ayuntamiento*', 'agencia tributaria', 'aeat', 'hacienda', 'suma gestion tributaria', 'gestion tributaria', 'ibi', 'tasa', 'tasas', 'impuesto*', 'tesoreria general', 'seguridad social'),
  R('multas', 'gasto', 'media', 'g.finanzas_obligaciones.multas_obligaciones', 'dgt', 'trafico', 'multa*', 'sancion*'),
  R('dni-tasas', 'gasto', 'media', 'g.finanzas_obligaciones.impuestos', 'dni pasaporte', 'dni', 'pasaporte', 'registro civil', 'registro mercantil', 'registro de la propiedad'),
  R('asesoria', 'gasto', 'media', 'g.finanzas_obligaciones.asesoria', 'gestoria*', 'asesoria*', 'abogad*', 'notari*', 'procurador*'),

  // Vivienda y suministros
  R('electricidad', 'gasto', 'alta', 'g.vivienda_hogar.electricidad', 'endesa', 'iberdrola', 'holaluz', 'som energia', 'octopus', 'repsol luz', 'totalenergies', 'viesgo', 'factorenergia', 'electricidad'),
  R('energia-generica', 'gasto', 'media', 'g.vivienda_hogar.electricidad', 'luz', 'energia*'),
  R('gas', 'gasto', 'media', 'g.vivienda_hogar.gas', 'gas natural', 'nedgia', 'butano', 'redexis', 'gas'),
  R('naturgy', 'gasto', 'media', 'g.vivienda_hogar.suministros', 'naturgy'),
  R('agua', 'gasto', 'alta', 'g.vivienda_hogar.agua', 'agua', 'aguas', 'hidraqua', 'emasesa', 'canal de isabel', 'agbar', 'aquagest', 'aigues*', 'emivasa', 'aqualia', 'emaya', 'global omnium', 'gestion integral de aguas'),
  R('comunidad', 'gasto', 'media', 'g.vivienda_hogar.comunidad', 'comunidad de propietarios', 'comunidad de vecinos', 'comunidad propietarios', 'administrador de fincas', 'administracion de fincas'),

  // Comunicaciones, suscripciones y software (movistar plus ANTES que movistar)
  R('suscripciones', 'gasto', 'alta', 'g.ocio_viajes.suscripciones_entretenimiento', 'movistar plus', 'netflix', 'spotify', 'hbo', 'disney*', 'prime video', 'youtube premium', 'skyshowtime', 'filmin', 'dazn', 'apple tv', 'atresplayer', 'crunchyroll', 'audible', 'kindle unlimited'),
  R('telefonia', 'gasto', 'alta', 'g.comunicaciones_servicios.telefono_internet', 'movistar', 'vodafone', 'orange', 'yoigo', 'masmovil', 'digi', 'jazztel', 'pepephone', 'lowi', 'simyo', 'finetwork', 'telefonica'),
  R('software', 'gasto', 'alta', 'g.comunicaciones_servicios.software_aplicaciones', 'anthropic', 'openai', 'chatgpt', 'supabase', 'ovh', 'ovhcloud', 'github', 'notion', 'google one', 'google workspace', 'google play', 'google cloud', 'microsoft', 'adobe', 'dropbox', 'cloudflare', 'namecheap', 'godaddy', 'vercel', 'netlify', 'icloud', 'apple com bill', 'zoom', 'canva', '1password', 'nordvpn'),

  // Transporte y vehículo
  R('repsol-energia', 'gasto', 'alta', 'g.vivienda_hogar.electricidad', 'repsol luz', 'repsol electricidad', 'repsol gas'),
  R('combustible', 'gasto', 'alta', 'g.transporte_vehiculo.combustible', 'cepsa', 'galp', 'shell', 'bp', 'estacion de servicio', 'estacio de servei', 'gasolinera*', 'petroprix', 'ballenoil', 'plenergy', 'tamoil', 'q8', 'avia', /^ (?:\d+ )?e s /),
  // Repsol vende gasolina, luz y gas: solo con «estación de servicio» es seguro (regla de arriba); a secas, sugerida.
  R('repsol', 'gasto', 'media', 'g.transporte_vehiculo.combustible', 'repsol'),
  R('parking', 'gasto', 'alta', 'g.transporte_vehiculo.aparcamiento_peajes', 'parking*', 'aparcamiento*', 'peaje*', 'autopista*', 'ora', 'telpark', 'emparking', 'via t', 'viat'),
  R('itv-taller', 'gasto', 'alta', 'g.transporte_vehiculo.mantenimiento_reparaciones', 'itv*', 'inspeccion tecnica', 'taller*', 'neumaticos*', 'midas', 'norauto', 'feu vert', 'recambios*', 'autolavado*'),
  R('uber-eats', 'gasto', 'alta', 'g.alimentacion.restaurantes', 'uber eats', 'ubereats', 'glovo', 'just eat'),
  R('transporte', 'gasto', 'media', 'g.transporte_vehiculo.transporte_publico_taxi', 'renfe', 'emt', 'metro', 'tmb', 'taxi*', 'cabify', 'bolt', 'freenow', 'free now', 'alsa', 'avanza', 'monbus', 'bus', 'autobus*', 'cercanias', 'ouigo', 'iryo', 'avlo', 'blablacar', 'bicing', 'uber'),
  R('viajes', 'gasto', 'alta', 'g.ocio_viajes.viajes_vacaciones', 'ryanair', 'vueling', 'iberia', 'air europa', 'easyjet', 'booking*', 'airbnb', 'hotel*', 'hostal*', 'camping*', 'rentalcars', 'edreams', 'logitravel', 'civitatis', 'melia', 'parador*'),

  R('alquiler', 'gasto', 'media', 'g.vivienda_hogar.alquiler_hipoteca', 'alquiler*', 'arrendamiento*'),

  // Alimentación (la comida de supermercado se desglosa luego con el ticket, si lo hay)
  R('restaurantes', 'gasto', 'alta', 'g.alimentacion.restaurantes', 'restaurante*', 'bar', 'cafeteria*', 'cafe', 'pizzeria*', 'asador*', 'meson', 'taberna*', 'cerveceria*', 'burger*', 'mcdonald*', 'kfc', 'telepizza', 'dominos', 'glovo', 'just eat', 'uber eats', 'ubereats', 'heladeria*', 'chiringuito*', 'starbucks', 'foster*', 'vips', 'kebab*', 'sushi*', 'tapas'),
  R('supermercado', 'gasto', 'alta', 'g.alimentacion.supermercado', 'mercadona', 'lidl', 'aldi', 'carrefour', 'eroski', 'consum', 'alcampo', 'supermercad*', 'hipermercad*', 'coviran', 'hiperber', 'caprabo', 'bon preu', 'condis', 'ahorramas', 'gadis', 'froiz', 'supersol', 'mas y mas', 'carniceria*', 'pescaderia*', 'fruteria*', 'charcuteria*', 'ultramarinos', 'panaderia*', 'horno', 'super dumbo', 'superdumbo', /\bdia \d{3,}\b/, /\bdia s a\b/),

  // Mayoristas: venden comida y también menaje y material (la familia los reparte): sugerida
  R('mayorista', 'gasto', 'media', 'g.alimentacion.supermercado', 'makro'),

  // Salud y bienestar
  R('farmacia', 'gasto', 'alta', 'g.salud_bienestar.salud_farmacia', 'farmacia*', 'fcia', 'parafarmacia*'),
  R('veterinario', 'gasto', 'alta', 'g.compras_familia.mascotas', 'veterinari*', 'kiwoko', 'tiendanimal', 'mascota*', 'pienso*'),
  R('medicos', 'gasto', 'alta', 'g.salud_bienestar.medicos_dentista_optica', 'clinica*', 'dental*', 'dentista*', 'odontolog*', 'optica*', 'oculista*', 'fisio*', 'podolog*', 'psicolog*', 'medico*', 'hospital*', 'laboratorio*', 'quiron*', 'vithas', 'ribera salud'),
  R('deporte', 'gasto', 'alta', 'g.salud_bienestar.deporte_fitness', 'gimnasio*', 'gym', 'basicfit', 'basic fit', 'club deportivo', 'padel', 'piscina*', 'polideportivo*'),
  R('decathlon', 'gasto', 'media', 'g.salud_bienestar.deporte_fitness', 'decathlon'),
  R('belleza', 'gasto', 'alta', 'g.salud_bienestar.belleza_cuidado_personal', 'peluquer*', 'estetica*', 'barberia*', 'primor', 'druni', 'sephora', 'perfumeria*', 'manicura*'),

  // Compras y familia
  R('ropa', 'gasto', 'alta', 'g.compras_familia.ropa_accesorios', 'zara', /\bh m\b/, 'primark', 'footwork', 'mango', 'bershka', 'pull bear', 'stradivarius', 'shein', 'sprinter', 'kiabi', 'springfield', 'cortefiel', 'women secret', 'lefties', 'deichmann', 'zapateria*', 'calzedonia', 'intimissimi', 'tendam', 'decimas', /^ c a /),
  R('el-corte-ingles', 'gasto', 'media', 'g.compras_familia.ropa_accesorios', 'el corte ingles'),
  R('ferreteria', 'gasto', 'alta', 'g.vivienda_hogar.mantenimiento_hogar', 'ferreteria*', 'ferbrico', 'bricolaje'),
  R('casa-jardin', 'gasto', 'alta', 'g.compras_familia.casa_jardin', 'ikea', 'leroy merlin', 'bricomart', 'brico depot', 'bauhaus', 'conforama', 'maisons du monde', 'jardineria*', 'vivero*', 'muebles*', 'colchon*'),
  R('ninos', 'gasto', 'media', 'g.compras_familia.ninos', 'juguet*', 'imaginarium', 'robotikids', 'toysrus', 'toys', 'kiddy', 'chicco'),
  R('educacion', 'gasto', 'media', 'g.educacion', 'colegio*', 'apa', 'ampa', 'guarderia*', 'escuela infantil', 'academia*', 'universidad*', 'extraescolar*'),
  R('ocio', 'gasto', 'media', 'g.ocio_viajes.ocio_cultura', 'cine*', 'teatro*', 'museo*', 'ticketmaster', 'entradas', 'zoo', 'parque de atracciones', 'port aventura', 'bowling', 'escape room', 'steam', 'playstation', 'nintendo', 'xbox', 'casa del libro', 'libreria*'),
  R('donaciones', 'gasto', 'media', 'g.otros.donaciones', 'fundacion*', 'cruz roja', 'unicef', 'medicus mundi', 'caritas', 'greenpeace', 'manos unidas', 'aldeas infantiles', 'ong', 'save the children', 'world vision'),
  R('regalos', 'gasto', 'media', 'g.compras_familia.regalos_compras_varias', 'floristeria*', 'flores', 'interflora', 'joyeria*', 'regalo*'),

  // Comercios cuyo gasto NO se puede deducir del nombre: pendientes, sin inventar categoría (Amazon se detalla con su ticket)
  R('marketplace', 'gasto', 'baja', null, 'amazon*', 'aliexpress', 'temu', 'paypal', 'sumup', 'sum up', 'bizum*'),
  R('banco-contraparte', 'gasto', 'baja', 'g.finanzas_obligaciones.prestamos_intereses', 'banco bilbao vizcaya argentaria', 'bbva', 'banco santander', 'caixabank', 'banco sabadell', 'bankinter'),
]

/** Si la familia no tiene la categoría concreta (la borró o la creó otra), se prueba una más general antes de rendirse. */
export const FALLBACK_KEYS: Readonly<Record<string, readonly string[]>> = {
  'g.vivienda_hogar.electricidad': ['g.vivienda_hogar.suministros'],
  'g.vivienda_hogar.gas': ['g.vivienda_hogar.suministros'],
  'g.vivienda_hogar.agua': ['g.vivienda_hogar.suministros'],
  'g.vivienda_hogar.comunidad': ['g.vivienda_hogar.mantenimiento_hogar', 'g.vivienda_hogar'],
  'g.salud_bienestar.medicos_dentista_optica': ['g.salud_bienestar.salud_farmacia'],
  'g.otros.donaciones': ['g.compras_familia.regalos_compras_varias', 'g.otros'],
  'i.ingreso.pensiones_prestaciones': ['i.ingreso'],
  'i.ingreso.intereses_rentas': ['i.ingreso'],
  'i.ingreso.devoluciones': ['i.ingreso'],
  'i.movimientos_internos': ['i.ingreso'],
}

function matches(normalized: string, m: Matcher): boolean {
  if (typeof m !== 'string') return m.test(normalized)
  if (m.endsWith('*')) return normalized.includes(` ${m.slice(0, -1)}`)
  return normalized.includes(` ${m} `)
}

export function findRule(normalized: string, flow: MovementFlow): Rule | null {
  for (const rule of RULES) {
    if (rule.flow !== 'ambos' && rule.flow !== flow) continue
    if (rule.match.some((m) => matches(normalized, m))) return rule
  }
  return null
}

// ───────────────────────── Aprendizaje (de las decisiones de la propia familia) ─────────────────────────

export interface MerchantHistory {
  manual: Map<string, number>
  other: Map<string, number>
}
export type LearningIndex = Map<string, MerchantHistory>

export function buildLearningIndex(rows: readonly HistoryRow[]): LearningIndex {
  const index: LearningIndex = new Map()
  for (const r of rows) {
    if (!r.category || !r.store) continue
    const key = merchantKey(r.store)
    if (!key) continue
    const h = index.get(key) ?? { manual: new Map(), other: new Map() }
    // Solo cuentan las decisiones de una persona y los movimientos antiguos sin marca; lo que PEPA clasificó sola no se usa para reforzarse a sí misma.
    if (r.source === 'auto' || r.source === 'sugerida') continue
    const bucket = r.source === 'manual' ? h.manual : h.other
    bucket.set(r.category, (bucket.get(r.category) ?? 0) + 1)
    index.set(key, h)
  }
  return index
}

/** La categoría que domina (≥ 80 %) entre al menos 2 movimientos antiguos del comercio. «Otros» e «Ingreso» no cuentan: no dicen nada. */
function dominantCategory(map: Map<string, number>): { name: string; count: number } | null {
  let total = 0
  let best: [string, number] | null = null
  for (const [name, n] of map) {
    if (name === 'Otros' || name === 'Ingreso') continue
    total += n
    if (!best || n > best[1]) best = [name, n]
  }
  if (!best || total < 2 || best[1] / total < 0.8) return null
  return { name: best[0], count: best[1] }
}

function top(map: Map<string, number>): [string, number] | null {
  let best: [string, number] | null = null
  for (const e of map) if (!best || e[1] > best[1]) best = e
  return best
}

// ───────────────────────── Decisión ─────────────────────────

export interface ClassifyInput {
  /** Comercio o contraparte (ya limpio de prefijos bancarios, si se tiene). */
  store: string | null
  /** Concepto completo tal como lo manda el banco. */
  description?: string | null
  isIncome: boolean
  categories: readonly FamilyCategoryRef[]
  learning?: LearningIndex
  /** Nombres de las personas de la familia: un movimiento hacia/desde una de ellas parece un traspaso, no un gasto ni un ingreso. */
  memberNames?: readonly string[]
}

const NONE = (flow: MovementFlow, categories: readonly FamilyCategoryRef[], reason: ClassificationReason = 'ninguna', suggestion: string | null = null): BankClassification => ({
  category: flow === 'gasto' ? (categories.some((c) => c.name === 'Otros') ? 'Otros' : (categories.find((c) => c.budgetGroup !== 'ingresos')?.name ?? 'Otros')) : 'Ingreso',
  source: null,
  suggestion,
  confidence: null,
  reason,
  catalogKey: null,
})

function groupOf(flow: MovementFlow): (c: FamilyCategoryRef) => boolean {
  return flow === 'ingreso' ? (c) => c.budgetGroup === 'ingresos' : (c) => c.budgetGroup !== 'ingresos'
}

export function resolveCategoryName(key: string | null, flow: MovementFlow, categories: readonly FamilyCategoryRef[]): { name: string; key: string } | null {
  if (!key) return null
  const pool = categories.filter(groupOf(flow))
  for (const k of [key, ...(FALLBACK_KEYS[key] ?? [])]) {
    const found = pool.find((c) => c.catalogKey === k)
    if (found) return { name: found.name, key: k }
  }
  return null
}

function looksLikePerson(normalized: string): boolean {
  const words = normalized.trim().split(' ').filter(Boolean)
  return words.length >= 2 && words.length <= 4 && words.every((w) => /^[a-z]{2,}$/.test(w))
}

function mentionsMember(normalized: string, memberNames: readonly string[]): boolean {
  return memberNames.some((n) => {
    const parts = normalizeConcept(n).trim().split(' ').filter((p) => p.length >= 3)
    return parts.length > 0 && parts.every((p) => normalized.includes(` ${p} `))
  })
}

export function classifyMovement(input: ClassifyInput): BankClassification {
  const flow: MovementFlow = input.isIncome ? 'ingreso' : 'gasto'
  const text = [input.store, input.description].filter(Boolean).join(' ')
  const normalized = normalizeConcept(text)
  if (normalized.trim() === '') return NONE(flow, input.categories)
  const names = new Set(input.categories.filter(groupOf(flow)).map((c) => c.name))

  // 1. Lo que la familia ya decidió para este comercio.
  const key = merchantKey(input.store ?? input.description)
  const history = key ? input.learning?.get(key) : undefined
  let mixed = false
  if (history && history.manual.size >= 1) {
    if (history.manual.size === 1) {
      const [name] = [...history.manual.keys()]
      if (names.has(name)) {
        return { category: name, source: 'auto', suggestion: null, confidence: 'alta', reason: 'aprendizaje', catalogKey: input.categories.find((c) => c.name === name)?.catalogKey ?? null }
      }
    } else {
      mixed = true // mismo comercio, categorías distintas: no se da por segura ninguna
    }
  }

  // 1b. La COSTUMBRE de la familia: movimientos antiguos (sin marca) que siempre fueron a la misma categoría. Con 3 o más es la forma de trabajar
  // de la familia (alta); con 2, una sugerencia (media). Gana a las reglas: Endesa que la familia siempre puso en «Suministros» no pasa a «Electricidad».
  const habit = history && !mixed ? dominantCategory(history.other) : null
  if (habit && names.has(habit.name)) {
    const confidence: Confidence = habit.count >= 3 ? 'alta' : 'media'
    return {
      category: habit.name,
      source: confidence === 'alta' ? 'auto' : 'sugerida',
      suggestion: null,
      confidence,
      reason: 'historial',
      catalogKey: input.categories.find((c) => c.name === habit.name)?.catalogKey ?? null,
    }
  }

  // 2. Reglas por clave del catálogo.
  const rule = findRule(normalized, flow)
  if (rule && rule.confidence === 'baja' && rule.key === null) {
    const person = personTransfer(normalized, flow, input)
    if (person) return person
  }
  if (rule) {
    const resolved = resolveCategoryName(rule.key, flow, input.categories)
    let confidence: Confidence = rule.confidence
    if (mixed && confidence === 'alta') confidence = 'media'
    if (!resolved) {
      // La regla es de un tipo que esta familia no tiene: sin categoría concreta, queda sin clasificar (nunca se inventa).
      return rule.confidence === 'baja' || rule.key === null ? lowConfidence(flow, null, input.categories) : NONE(flow, input.categories, 'regla')
    }
    if (confidence === 'alta') return { category: resolved.name, source: 'auto', suggestion: null, confidence, reason: 'regla', catalogKey: resolved.key }
    if (confidence === 'media') return { category: resolved.name, source: 'sugerida', suggestion: null, confidence, reason: 'regla', catalogKey: resolved.key }
    return lowConfidence(flow, resolved.name, input.categories, resolved.key)
  }

  // 3. Comercio «mixto» (la familia puso categorías distintas) y sin regla: pendiente, sugiriendo la que más ha usado.
  if (history && mixed) {
    const best = top(history.manual)
    if (best) return lowConfidence(flow, best[0], input.categories)
  }

  // 4. Una persona de la familia: parece un traspaso o un reparto, no un gasto ni un ingreso reales (nunca se decide solo).
  return personTransfer(normalized, flow, input) ?? NONE(flow, input.categories)
}

function personTransfer(normalized: string, flow: MovementFlow, input: ClassifyInput): BankClassification | null {
  const memberNames = input.memberNames ?? []
  if (memberNames.length === 0 || !mentionsMember(normalized, memberNames)) return null
  if (!(/transferencia|traspaso|bizum/.test(normalized) || looksLikePerson(stripBoilerplate(normalized)))) return null
  const move = resolveCategoryName(flow === 'gasto' ? 'g.movimientos_internos.transferencias_propias' : 'i.movimientos_internos', flow, input.categories)
  return lowConfidence(flow, move?.name ?? null, input.categories, move?.key ?? null, 'persona')
}

function lowConfidence(
  flow: MovementFlow,
  suggestion: string | null,
  categories: readonly FamilyCategoryRef[],
  catalogKey: string | null = null,
  reason: ClassificationReason = 'regla',
): BankClassification {
  if (flow === 'gasto') {
    // Pendiente de clasificar (category NULL, como siempre): cuenta como gasto real pero no consume ningún presupuesto de categoría.
    return { category: null, source: null, suggestion, confidence: 'baja', reason, catalogKey }
  }
  // Un abono dudoso no se deja sin categoría: se guarda como «Ingreso» y se ofrece la sugerencia (si es un traspaso, la persona lo confirma).
  const generic = NONE(flow, categories)
  return { ...generic, suggestion, confidence: 'baja', reason, catalogKey }
}
