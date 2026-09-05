import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

// Recibe pedidos de Amazon ya interpretados por un workflow externo
// (Outlook reenvía el email de confirmación a Pipedream, que lo lee y
// llama a este webhook) — no hay sesión de usuario posible aquí, así
// que va sin verificación de JWT (verify_jwt=false) y se autentica con
// el token secreto propio de cada familia (families.amazon_webhook_token)
// en vez de un login. Guarda lo mismo que "Subir ticket" a mano
// (receipt + gasto real + product_prices por producto, con receipt_id
// para que el borrado en cascada funcione igual), para que un pedido de
// Amazon aparezca en Tickets/Historial/Gastos sin duplicar lógica —
// categoría "Amazon" propia, fuera de los presupuestos por ahora
// (petición real: no mezclarlo con Alimentación ni Generales todavía).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } })
}

interface OrderItem {
  name: string
  price: number
  quantity: number
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS })

  try {
    const body = await req.json()
    const token: string | null = typeof body.token === "string" ? body.token : null
    const orderNumber: string | null = typeof body.orderNumber === "string" ? body.orderNumber : null
    const orderDate: string | null =
      typeof body.orderDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.orderDate) ? body.orderDate : null
    const total: number | null = typeof body.total === "number" ? body.total : null
    const items: OrderItem[] = Array.isArray(body.items)
      ? body.items
          .filter((it: unknown): it is { name: unknown; price: unknown; quantity: unknown } => typeof it === "object" && it !== null)
          .map((it: { name: unknown; price: unknown; quantity: unknown }) => {
            const quantity = typeof it.quantity === "number" ? it.quantity : Number(it.quantity)
            return {
              name: typeof it.name === "string" ? it.name : "",
              price: typeof it.price === "number" ? it.price : Number(it.price),
              quantity: Number.isFinite(quantity) && quantity > 0 ? Math.round(quantity) : 1,
            }
          })
          .filter((it: OrderItem) => it.name.trim() && Number.isFinite(it.price))
      : []

    if (!token) return json({ error: "missing token" }, 401)
    if (!orderDate) return json({ error: "missing or invalid orderDate" }, 400)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const { data: family, error: familyError } = await admin
      .from("families")
      .select("id")
      .eq("amazon_webhook_token", token)
      .maybeSingle()
    if (familyError) throw familyError
    if (!family) return json({ error: "invalid token" }, 401)
    const familyId = family.id

    let expenseId: string | null = null
    if (total != null) {
      const { data: expense, error: expenseError } = await admin
        .from("expenses")
        .insert({
          family_id: familyId,
          expense_date: orderDate,
          amount: total,
          category: "Amazon",
          store: "Amazon",
          kind: "real",
          notes: orderNumber ? `Pedido ${orderNumber}` : null,
        })
        .select("id")
        .single()
      if (expenseError) throw expenseError
      expenseId = expense.id
    }

    const { data: receipt, error: receiptError } = await admin
      .from("receipts")
      .insert({
        family_id: familyId,
        storage_path: null,
        store: "Amazon",
        receipt_date: orderDate,
        total_amount: total,
        expense_id: expenseId,
        notes: orderNumber ? `Pedido ${orderNumber}` : null,
        category: "Amazon",
      })
      .select("id")
      .single()
    if (receiptError) throw receiptError

    for (const item of items) {
      const normalizedName = item.name.trim().toLowerCase()
      const { data: product, error: productError } = await admin
        .from("products")
        .upsert(
          { family_id: familyId, normalized_name: normalizedName, display_name: item.name.trim() },
          { onConflict: "family_id,normalized_name" },
        )
        .select("id")
        .single()
      if (productError) throw productError

      const { error: priceError } = await admin.from("product_prices").insert({
        product_id: product.id,
        price: item.price,
        store: "Amazon",
        quantity: String(item.quantity),
        unit: null,
        recorded_date: orderDate,
        receipt_id: receipt.id,
      })
      if (priceError) throw priceError
    }

    return json({ ok: true, receiptId: receipt.id, itemsSaved: items.length })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
