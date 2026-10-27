// Previsión de pagos — ECO-02: IDENTIDAD COMERCIAL para la conciliación bancaria. Código puro y determinista (sin IA, sin red).
//
// Pregunta que responde: «¿el concepto del banco y el pago previsto hablan del MISMO comercio, beneficiario o contrato?». La respuesta es
// tri-estado, nunca un número inventado:
//   - match    → hay evidencia (una referencia de contrato común, una variante de nombre verificada o una palabra distintiva común);
//   - conflict → los DOS lados tienen un nombre identificable y no comparten nada (ENDESA ↔ AMAZON, SEQURA ↔ Eric Segura Hepburn);
//   - unknown  → algún lado no tiene ningún nombre identificable (solo palabras genéricas, o sin concepto): no se puede comprobar.
// El motor de conciliación (forecastReconciliation.ts) solo propone cuando es `match`. Ante la duda NO se propone: la asociación a mano sigue
// disponible. Compartir una palabra suelta («segura», «energía», «google») nunca basta por sí sola.
//
// Se reutiliza la misma idea de normalización que el resto de Previsión (minúsculas, sin tildes, sin puntuación, sin referencias de tarjeta
// enmascaradas, boilerplate bancario); aquí se amplía con formas jurídicas, localidades añadidas al concepto, palabras de sector y marcas
// multiproducto. No toca ningún dato guardado.

export type IdentityVia = 'reference' | 'alias' | 'name'

export type MerchantIdentityMatch =
  | {
      kind: 'match'
      via: IdentityVia
      /** Palabras o referencias que ambos lados comparten (para explicarlo en pantalla). */
      shared: string[]
      /** Evidencia sólida: referencia de contrato, variante verificada, 2+ palabras comunes o una palabra distintiva de 6+ letras. */
      strong: boolean
    }
  | { kind: 'conflict' }
  | { kind: 'unknown' }

// ── Ruido que no identifica a nadie ──────────────────────────────────────────────────────────────────────────────

// Boilerplate bancario habitual (el medio de pago o el tipo de apunte, nunca el comercio).
const BANK_BOILERPLATE = new Set([
  'compra', 'compras', 'tarj', 'tarjeta', 'adeudo', 'adeudos', 'recibo', 'recibos', 'transferencia', 'transf', 'favor', 'bizum', 'pago', 'pagos', 'domiciliacion', 'domiciliado', 'cuota', 'cuotas',
  'factura', 'facturas', 'cargo', 'cargos', 'abono', 'ref', 'referencia', 'num', 'numero', 'sepa', 'concepto', 'liquidacion', 'mensual', 'trimestral', 'anual', 'periodo', 'importe', 'nomina',
  'comision', 'comisiones', 'anul', 'devolucion', 'cobro', 'orden', 'ordenante', 'beneficiario',
])

// Formas jurídicas y sufijos de empresa.
const LEGAL_FORMS = new Set(['sa', 'sl', 'slu', 'sau', 'slp', 'sll', 'sc', 'cb', 'ltd', 'inc', 'llc', 'gmbh', 'plc', 'bv', 'ag', 'spa', 'srl', 'sas', 'sarl', 'corp', 'co', 'cia'])

// Partículas web y palabras vacías.
const FILLER = new Set(['www', 'http', 'https', 'com', 'net', 'org', 'eu', 'es', 'the', 'and', 'del', 'los', 'las', 'por', 'con', 'para', 'una', 'uno', 'que', 'sus', 'mis', 'tus', 'nos'])

// Localidades y países que el banco añade al comercio («NETFLIX.COM-Madrid», «AMAZON-LUXEMBOURG»). Lista de apoyo: además, en el concepto del banco
// se descarta siempre el último tramo tras un guion (ver stripTrailingLocation).
const LOCATIONS = new Set([
  'madrid', 'barcelona', 'valencia', 'sevilla', 'alicante', 'murcia', 'malaga', 'bilbao', 'zaragoza', 'palma', 'granada', 'cordoba', 'valladolid', 'vigo', 'gijon', 'coruna', 'elche', 'orihuela',
  'dublin', 'london', 'londres', 'paris', 'berlin', 'amsterdam', 'lisboa', 'roma', 'milan', 'luxembourg', 'luxemburgo', 'ireland', 'irlanda', 'espagne', 'espana', 'spain', 'france', 'germany',
  'portugal', 'italia', 'italy', 'netherlands', 'belgium', 'usa', 'uk',
  // Vega Baja / Alicante (la zona de la familia): el banco las añade a los comercios locales.
  'rafal', 'almoradi', 'torrevieja', 'guardamar', 'rojales', 'albatera', 'crevillente', 'callosa', 'bigastro', 'benejuzar', 'formentera', 'cox', 'granja', 'redovan', 'dolores', 'catral',
])

// Palabras de SECTOR o descripción: dicen qué es el pago, no quién lo cobra. Dos pagos de «energía» o de «seguro» no son el mismo comercio.
const GENERIC_DESCRIPTORS = new Set([
  'energia', 'electricidad', 'electrica', 'luz', 'gas', 'agua', 'seguro', 'seguros', 'telefono', 'movil', 'internet', 'fibra', 'hipoteca', 'prestamo', 'prestamos', 'alquiler', 'comunidad', 'suscripcion',
  'servicio', 'servicios', 'supermercado', 'supermercados', 'restaurante', 'asador', 'bar', 'cafeteria', 'tienda', 'banco', 'cuenta', 'casa', 'hogar', 'vivienda', 'coche', 'moto', 'aire', 'acondicionado',
  'mantenimiento', 'colegio', 'escuela', 'gimnasio', 'impuesto', 'impuestos', 'tasa', 'tasas', 'basura', 'residuos', 'cuenta', 'plan', 'tarifa', 'contrato', 'poliza', 'general', 'gestion', 'compania',
  'grupo', 'empresa', 'online', 'digital', 'pay', 'shop', 'store', 'market', 'natural', 'mobile', 'telecom', 'telecomunicaciones', 'suministro', 'suministros', 'iberica', 'iberico', 'nacional',
])

// Marcas con MUCHOS productos y comercios distintos: compartir solo la marca no demuestra que sea el mismo pago (dos servicios de Google, una compra
// de Amazon y una suscripción de Amazon, etc.). Solo cuentan si además comparten otra palabra distintiva o una referencia.
const MULTI_PRODUCT_BRANDS = new Set(['google', 'amazon', 'apple', 'microsoft', 'meta', 'facebook', 'paypal', 'samsung', 'sony', 'ebay', 'aliexpress'])

// Variantes de nombre VERIFICADAS (mismo grupo = mismo emisor). Deliberadamente mínima: solo equivalencias comerciales públicas e inequívocas. Se amplía
// caso a caso con evidencia real, nunca por anticipado.
const ALIAS_GROUPS: readonly (readonly string[])[] = [['telefonica', 'movistar']]

const MIN_IDENTITY_TOKEN_LENGTH = 4
const STRONG_SINGLE_TOKEN_LENGTH = 6
const MIN_REFERENCE_DIGITS = 6

// ── Normalización ────────────────────────────────────────────────────────────────────────────────────────────────

// Referencia de tarjeta enmascarada («5402XXXXXXXX4041»): dígitos y «x» mezclados. Un identificador real (contrato, préstamo) es solo dígitos.
function isMaskedCardReference(word: string): boolean {
  return /^[0-9x]+$/.test(word) && /\d/.test(word) && /x/.test(word)
}

function foldText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

// El banco añade la localidad al final del comercio tras un guion («ASADOR SESE-RAFAL», «SEQURA-BARCELONA»). Solo en el concepto del BANCO y solo si hay un
// tramo antes: así la localidad nunca se convierte en «identidad» compartida. (El texto del pago previsto lo escribe la persona: ahí no se recorta.)
function stripTrailingLocation(bankConcept: string): string {
  const parts = bankConcept.split(/\s+-\s*|-(?=[A-Za-zÀ-ÿ]+\s*$)/)
  if (parts.length < 2) return bankConcept
  const head = parts.slice(0, -1).join(' ')
  return head.trim().length >= MIN_IDENTITY_TOKEN_LENGTH ? head : bankConcept
}

export interface MerchantIdentityTokens {
  /** Palabras distintivas (sin ruido, sin sector, sin localidades). */
  names: string[]
  /** Referencias numéricas largas (contrato, préstamo…). */
  refs: string[]
  /** Palabras normalizadas tal cual (para unir nombres partidos: «mas movil» ↔ «masmovil»). */
  raw: string[]
  /** Palabras en orden sin ruido bancario/jurídico/localidad (conserva las cortas y las de sector): sirven para comparar la frase «google one». */
  seq: string[]
}

export function merchantIdentityTokens(text: string, opts: { bankConcept?: boolean } = {}): MerchantIdentityTokens {
  const source = opts.bankConcept ? stripTrailingLocation(text) : text
  const words = foldText(source).match(/[a-z0-9]+/g) ?? []
  const names: string[] = []
  const refs: string[] = []
  const seq: string[] = []
  for (const w of words) {
    if (!/^\d+$/.test(w) && !isMaskedCardReference(w) && w.length >= 2 && !BANK_BOILERPLATE.has(w) && !LEGAL_FORMS.has(w) && !FILLER.has(w) && !LOCATIONS.has(w)) seq.push(w)
    if (/^\d+$/.test(w)) {
      if (w.length >= MIN_REFERENCE_DIGITS) refs.push(w)
      continue
    }
    if (isMaskedCardReference(w)) continue
    if (w.length < MIN_IDENTITY_TOKEN_LENGTH) continue
    if (BANK_BOILERPLATE.has(w) || LEGAL_FORMS.has(w) || FILLER.has(w) || LOCATIONS.has(w) || GENERIC_DESCRIPTORS.has(w)) continue
    names.push(w)
  }
  return { names: [...new Set(names)], refs: [...new Set(refs)], raw: words, seq }
}

function aliasOf(token: string): readonly string[] | null {
  return ALIAS_GROUPS.find((g) => g.includes(token)) ?? null
}

// ¿Este token de un lado aparece en el otro? Igualdad exacta. Nada de prefijos ni subcadenas: «segura» no es «sequra».
function tokenInOther(token: string, other: MerchantIdentityTokens): boolean {
  return other.names.includes(token)
}

// El mismo nombre escrito con y sin espacio («mas movil» ↔ «masmovil»): dos palabras CONSECUTIVAS de un lado que, unidas, igualan un nombre del otro.
function joinedNameShared(a: MerchantIdentityTokens, b: MerchantIdentityTokens): string[] {
  const hits: string[] = []
  const scan = (x: MerchantIdentityTokens, y: MerchantIdentityTokens) => {
    for (let i = 0; i < x.raw.length - 1; i++) {
      const joined = x.raw[i] + x.raw[i + 1]
      if (joined.length >= STRONG_SINGLE_TOKEN_LENGTH && y.names.includes(joined)) hits.push(joined)
    }
  }
  scan(a, b)
  scan(b, a)
  return [...new Set(hits)]
}

/**
 * Compara el comercio de un pago previsto (título + proveedor) con el concepto del banco.
 * `forecastText` es lo que escribió la persona; `bankConcept` es la descripción del movimiento (puede ser null).
 */
export function compareMerchantIdentity(forecastText: string, bankConcept: string | null): MerchantIdentityMatch {
  if (!bankConcept || !bankConcept.trim()) return { kind: 'unknown' }
  const f = merchantIdentityTokens(forecastText)
  const b = merchantIdentityTokens(bankConcept, { bankConcept: true })

  // 1) Referencia común (número de contrato, de préstamo…): la evidencia más fuerte.
  const sharedRefs = f.refs.filter((r) => b.refs.includes(r))
  if (sharedRefs.length > 0) return { kind: 'match', via: 'reference', shared: sharedRefs, strong: true }

  // 2) Palabras distintivas comunes (las marcas multiproducto no cuentan solas).
  const sharedNames = f.names.filter((t) => tokenInOther(t, b))
  const decisive = sharedNames.filter((t) => !MULTI_PRODUCT_BRANDS.has(t))
  if (decisive.length > 0) {
    const strong = sharedNames.length >= 2 || decisive.some((t) => t.length >= STRONG_SINGLE_TOKEN_LENGTH)
    return { kind: 'match', via: 'name', shared: sharedNames, strong }
  }

  // 2a) La misma FRASE de marca + producto («GOOGLE ONE» en los dos lados): dos palabras consecutivas comunes, una de ellas un nombre distintivo compartido
  //     (así «google one» sí, pero «google» a secas o «google» + «youtube» no).
  const sharedNameSet = new Set(sharedNames)
  const phrase: string[] = []
  for (let i = 0; i < f.seq.length - 1; i++) {
    const [x, y] = [f.seq[i], f.seq[i + 1]]
    if (!sharedNameSet.has(x) && !sharedNameSet.has(y)) continue
    for (let j = 0; j < b.seq.length - 1; j++) if (b.seq[j] === x && b.seq[j + 1] === y && x !== y) phrase.push(`${x} ${y}`)
  }
  if (phrase.length > 0) return { kind: 'match', via: 'name', shared: [...new Set(phrase)], strong: true }

  // 2b) El mismo nombre partido en dos palabras de un lado.
  const joined = joinedNameShared(f, b).filter((t) => !MULTI_PRODUCT_BRANDS.has(t))
  if (joined.length > 0) return { kind: 'match', via: 'name', shared: joined, strong: true }

  // 3) Variante comercial verificada (p. ej. Telefónica ↔ Movistar).
  for (const t of f.names) {
    const group = aliasOf(t)
    if (!group) continue
    const hit = group.find((g) => g !== t && tokenInOther(g, b))
    if (hit) return { kind: 'match', via: 'alias', shared: [t, hit], strong: true }
  }

  // 4) Sin evidencia: ¿es un desacuerdo claro o simplemente no se puede comprobar?
  const fHasName = f.names.length > 0 || f.refs.length > 0
  const bHasName = b.names.length > 0 || b.refs.length > 0
  if (fHasName && bHasName) return { kind: 'conflict' }
  return { kind: 'unknown' }
}
