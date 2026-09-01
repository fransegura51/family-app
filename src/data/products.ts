import { supabase } from '@/data/supabaseClient'
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
  const { data, error } = await supabase
    .from('products')
    .select('id, family_id, normalized_name, display_name, category, brand')
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    familyId: r.family_id,
    normalizedName: r.normalized_name,
    displayName: r.display_name,
    category: r.category,
    brand: r.brand,
  }))
}

export async function listAllProductPrices(): Promise<ProductPrice[]> {
  const { data, error } = await supabase
    .from('product_prices')
    .select('id, product_id, price, store, quantity, unit, recorded_date')
    .order('recorded_date', { ascending: true })
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    productId: r.product_id,
    price: Number(r.price),
    store: r.store,
    quantity: r.quantity,
    unit: r.unit,
    recordedDate: r.recorded_date,
  }))
}

// Reconoce productos equivalentes por nombre normalizado, sin perder el
// texto original que escribió la familia (Skill 11). Registra un punto
// más de historial de precio cada vez que se llama (Skill 09).
export async function recordProductPurchase(input: {
  name: string
  price: number
  quantity: string
  unit: string
  store: string
  date?: string
}): Promise<void> {
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
    ...(input.date ? { recorded_date: input.date } : {}),
  })
  if (priceError) throw priceError
}
