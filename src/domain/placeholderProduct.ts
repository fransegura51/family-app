// Producto MARCADOR (COR-01): algunas compras llegan de fuera (atajo del móvil, importación) con una única línea cuyo «producto» no es un producto, sino la palabra
// «Pendiente» (= «aún no sé qué es»). Esa línea comparte UN solo producto entre todas las compras de la familia: si alguien le pone una clase (p. ej. «Ropa y calzado»),
// TODAS las compras con marcador caían en esa clase aunque el gasto estuviera clasificado de otra forma (Cable Ethernet → «Ropa y calzado»). Una línea marcador NO es
// desglose real: no aporta clasificación ni naturaleza; la compra se clasifica por su propio reparto / clasificación / categoría. Se reconoce por el nombre completo, sin
// mayúsculas, tildes ni signos («PENDIENTE», «Pendiente.»), pero SIN coincidencias parciales («Pendiente de pago de ...» o «Pendientes» no lo son). No se toca ningún dato
// histórico: solo se deja de usar como fuente de clasificación. Módulo puro, sin dependencias (lo usan el resolutor de clases y el cálculo de naturaleza).
const PLACEHOLDER_PRODUCT_NAMES: ReadonlySet<string> = new Set(['pendiente', 'pendiente de clasificar', 'pendiente por clasificar', 'pendiente de revisar', 'pendiente por revisar'])

function placeholderKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function isPlaceholderProduct(product: { normalizedName?: string | null; displayName?: string | null } | null | undefined): boolean {
  if (!product) return false
  return [product.normalizedName, product.displayName].some((n) => !!n && PLACEHOLDER_PRODUCT_NAMES.has(placeholderKey(n)))
}
