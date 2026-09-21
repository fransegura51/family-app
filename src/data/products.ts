import { fetchAllRows } from '@/data/paginate'
import { supabase } from '@/data/supabaseClient'
import { storedClassKind, type ProductClassKind } from '@/domain/productClass'
import { isProductLine } from '@/domain/ticketLines'
import type { Product, ProductPrice } from '@/domain/types'

async function currentFamilyId(): Promise<string> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const { data: profileRow, error } = await supabase
    .from('profiles')
    .select('family_id')
    .eq('id', userResult.user.id)
    .single()
  if (error) throw error
  return profileRow.family_id
}

function normalize(name: string): string {
  return name.trim().toLowerCase()
}

export async function listProducts(): Promise<Product[]> {
  const [data, classes] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase
        .from('products')
        .select('id, family_id, normalized_name, display_name, category, brand, non_food, class_confirmed_at')
        .order('id')
        .range(from, to),
    ),
    // Clases de la familia (RLS): el `kind` de la clase guardada de cada producto es lo que decide Alimentos / Otros (Fase 6C).
    supabase.from('family_food_types').select('name, kind'),
  ])
  if (classes.error) throw classes.error
  const familyClasses = (classes.data ?? []).map((c) => ({ name: c.name as string, kind: c.kind as ProductClassKind }))
  return data.map((r) => ({
    id: r.id,
    familyId: r.family_id,
    normalizedName: r.normalized_name,
    displayName: r.display_name,
    category: r.category,
    brand: r.brand,
    nonFood: r.non_food,
    classConfirmedAt: r.class_confirmed_at ?? null,
    classKind: storedClassKind(r.category, familyClasses),
  }))
}

// Excepción manual por producto a la regla "compra en tienda física =
// alimentación" (ver isFoodPurchase) — petición real: "Bombona y
// Plantas aparecen como Alimentación", productos sueltos que no son
// comida aunque se compraran en Mercadona/Hiperber junto con la
// compra normal.
export async function setProductNonFood(productId: string, nonFood: boolean): Promise<void> {
  const { error } = await supabase.from('products').update({ non_food: nonFood }).eq('id', productId)
  if (error) throw error
}

export interface ReceiptLineDetail {
  id: string
  name: string
  price: number
  quantity: string | null
}

// El detalle de líneas leído de un ticket concreto — para el desplegable
// "ver detalle" de cada ticket guardado, reconstruido a partir de lo que
// ya se guardó en el Historial (product_prices.receipt_id) en vez de
// duplicar esa información en otra tabla.
export async function listProductPricesByReceipt(receiptId: string): Promise<ReceiptLineDetail[]> {
  const { data, error } = await supabase
    .from('product_prices')
    .select('id, price, quantity, products(display_name)')
    .eq('receipt_id', receiptId)
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    name: (r.products as unknown as { display_name: string } | null)?.display_name ?? '?',
    price: Number(r.price),
    quantity: r.quantity,
  }))
}

// Al editar un ticket, se sustituyen todas sus líneas por las nuevas en
// vez de intentar emparejar una a una — más simple y evita arrastrar
// líneas borradas por el usuario en la edición.
export async function deleteProductPricesByReceipt(receiptId: string): Promise<void> {
  const { error } = await supabase.from('product_prices').delete().eq('receipt_id', receiptId)
  if (error) throw error
}

export async function listAllProductPrices(): Promise<ProductPrice[]> {
  const data = await fetchAllRows((from, to) =>
    supabase
      .from('product_prices')
      .select('id, product_id, price, store, quantity, unit, recorded_date, receipt_id')
      .order('recorded_date', { ascending: true })
      .order('id')
      .range(from, to),
  )
  return data.map((r) => ({
    id: r.id,
    productId: r.product_id,
    price: Number(r.price),
    store: r.store,
    quantity: r.quantity,
    unit: r.unit,
    recordedDate: r.recorded_date,
    receiptId: r.receipt_id,
  }))
}

// Reconoce productos equivalentes por nombre normalizado, sin perder el
// texto original que escribió la familia (Skill 11). Registra un punto
// más de historial de precio cada vez que se llama (Skill 09).
//
// Es el ÚNICO camino del cliente que crea products/product_prices: aquí se descartan, ANTES de persistir nada, las líneas que no son
// productos (p. ej. PARKING en Mercadona, ver domain/ticketLines.ts). Devuelve productId=null cuando la línea se ha descartado.
// (Los webhooks del servidor aplican la misma regla y la base de datos la refuerza con un trigger en product_prices.)
export async function recordProductPurchase(input: {
  name: string
  price: number
  quantity: string
  unit: string
  store: string
  date?: string
  receiptId?: string
}): Promise<{ productId: string | null }> {
  if (!isProductLine(input.store, input.name)) return { productId: null }
  const familyId = await currentFamilyId()
  const normalizedName = normalize(input.name)

  const { data: product, error: productError } = await supabase
    .from('products')
    .upsert(
      { family_id: familyId, normalized_name: normalizedName, display_name: input.name },
      { onConflict: 'family_id,normalized_name' },
    )
    .select('id')
    .single()
  if (productError) throw productError

  const { error: priceError } = await supabase.from('product_prices').insert({
    product_id: product.id,
    price: input.price,
    store: input.store || null,
    quantity: input.quantity || null,
    unit: input.unit || null,
    receipt_id: input.receiptId || null,
    ...(input.date ? { recorded_date: input.date } : {}),
  })
  if (priceError) throw priceError
  return { productId: product.id }
}
