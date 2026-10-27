// Adaptadores de los productos y precios de la familia al formato del comparador (sin dependencias de pantalla ni de datos).
import type { CmpPrice, CmpProduct } from './priceComparison'
import type { Product, ProductPrice } from './types'

export function toCmpProduct(p: Product): CmpProduct {
  return { id: p.id, displayName: p.displayName, brand: p.brand, classKey: p.classConfirmedAt ? p.category : null, catalogProductKey: p.catalogProductKey ?? null }
}

export function toCmpPrice(p: ProductPrice): CmpPrice {
  return { id: p.id, productId: p.productId, price: p.price, store: p.store, unit: p.unit, recordedDate: p.recordedDate, pack: p.pack ?? null }
}
