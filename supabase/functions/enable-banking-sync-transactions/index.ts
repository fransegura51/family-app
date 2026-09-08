import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

// Botón "Sincronizar movimientos" en Banco (o pg_cron, ver
// 0077_schedule_bank_sync.sql, 4 veces al día — el mismo banco de la
// familia dijo que ellos actualizan igual de seguido, petición real).
//
// Cada movimiento del banco se copia a bank_transactions (deduplicado
// por entry_reference) y ADEMÁS se convierte en un gasto real de
// Movimientos — nunca se queda "solo en el banco" sin poder editarse:
// - Si ya existe un gasto de un TICKET o apuntado A MANO con el mismo
//   importe y una fecha muy cercana (±3 días), es la misma compra
//   pagada con tarjeta: no se duplica, se marca ese gasto como source
//   'ticket_banco' y se enlaza (petición real: "que no se dupliquen
//   movimientos con los tickets importados" — se detectó en pruebas
//   que también pasaba con un gasto manual, no solo con tickets).
// - Si no hay ningún gasto que case, se crea uno nuevo con source
//   'banco', categoría adivinada por el comercio (siempre editable
//   después, igual que cualquier otro gasto — nunca se inventa una
//   categoría seguro: si no hay pista clara, se deja en "Otros").
//
// Primera vez que se sincroniza una cuenta: trae el periodo pedido
// (días). A partir de ahí cada sincronización es incremental de
// verdad: solo pide al banco desde el último movimiento que ya
// tenemos guardado (con 3 días de margen por si algo llega con
// retraso), no repite el mes entero cada vez.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-cron-secret",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } })
}

function base64url(data: ArrayBuffer | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data)
  let binary = ""
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function signEnableBankingJWT(applicationId: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { typ: "JWT", alg: "RS256", kid: applicationId }
  const payload = { iss: "enablebanking.com", aud: "api.enablebanking.com", iat: now, exp: now + 3600 }
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`

  const pemBody = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "")
  const keyData = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(signingInput))
  return `${signingInput}.${base64url(signature)}`
}

interface EnableTransaction {
  entry_reference?: string | null
  transaction_amount: { currency: string; amount: string }
  credit_debit_indicator: "CRDT" | "DBIT"
  booking_date?: string | null
  value_date?: string | null
  transaction_date?: string | null
  creditor?: { name?: string | null } | null
  debtor?: { name?: string | null } | null
  remittance_information?: string[] | null
}

function describeTransaction(t: EnableTransaction): string | null {
  const party = t.credit_debit_indicator === "DBIT" ? t.creditor?.name : t.debtor?.name
  const remittance = (t.remittance_information ?? []).filter(Boolean).join(" ")
  return party || remittance || null
}

// Prefijos habituales de la banca española que no aportan nada al
// nombre del comercio — se quitan para que "store" quede legible
// (petición real: categorización automática, esto ayuda a acertar más
// y a que se lea bien aunque no se acierte).
const BOILERPLATE_PREFIXES = [
  /^COMPRA TARJ\.?\s*[\dX]*\s*/i,
  /^ADEUDO\s+/i,
  /^RECIBO\s+/i,
  /^TRANSFERENCIA\s+(A FAVOR DE|DE)\s+/i,
  /^BIZUM\s+(A|DE)\s+/i,
  /^PAGO\s+(A|EN)\s+/i,
]

function cleanMerchantName(raw: string | null): string | null {
  if (!raw) return null
  let name = raw.trim()
  for (const re of BOILERPLATE_PREFIXES) name = name.replace(re, "")
  return name.trim().slice(0, 120) || null
}

// Categorización automática por palabras clave del comercio — mejor
// suposición, nunca inventada como certeza: si no hay pista clara cae
// en "Otros" (la propia taxonomía del documento maestro la define
// para "movimientos que Pepa todavía no pueda clasificar con
// suficiente confianza"). Siempre editable después por la familia.
const MERCHANT_CATEGORY_RULES: { keywords: string[]; category: string }[] = [
  { keywords: ["mercadona", "lidl", "aldi", "carrefour", "eroski", "consum", "alcampo", " dia ", "dia s.a", "spar", "hiperber", "caprabo", "super dumbo", "superdumbo"], category: "Supermercado, carnicería y tiendas de alimentación" },
  { keywords: ["farmacia"], category: "Salud y farmacia" },
  { keywords: ["repsol", "cepsa", "galp", "shell", "gasolinera", "estacion de servicio", "petroprix", "ballenoil"], category: "Combustible" },
  { keywords: ["parking", "aparcamiento", "peaje", "autopista"], category: "Aparcamiento y peajes" },
  { keywords: ["renfe", "emt", "metro ", "taxi", "cabify", "uber", "bus "], category: "Transporte público / taxi" },
  { keywords: ["restaurante", " bar ", "cafeteria", "cafe ", "burger", "mcdonald", "kfc", "telepizza", "dominos", "glovo", "just eat", "ubereats", "uber eats"], category: "Restaurantes, bares y cafeterías" },
  { keywords: ["netflix", "spotify", "hbo", "disney", "prime video", "youtube premium", "movistar plus"], category: "Suscripciones y entretenimiento" },
  { keywords: ["movistar", "vodafone", "orange", "yoigo", "masmovil", "más móvil", "digi mobil", "digi.es", "jazztel", "pepephone"], category: "Teléfono e Internet" },
  { keywords: ["seguros", "mapfre", "mutua madrileña", " axa ", "allianz", "zurich", "linea directa", "línea directa", "caser", "reale"], category: "Seguros" },
  { keywords: ["hipoteca", "prestamo hipotecario", "préstamo hipotecario"], category: "Alquiler / hipoteca" },
  { keywords: ["ayuntamiento", "agencia tributaria", "hacienda", "iban  es dgt", "trafico"], category: "Impuestos" },
  { keywords: ["decathlon", "gimnasio", "gym ", "basicfit", "basic-fit"], category: "Deporte y fitness" },
  { keywords: ["primor", "druni", "peluqueria", "peluquería", "estetica", "estética"], category: "Belleza y cuidado personal" },
  { keywords: ["zara", "h&m", "primark", "footwork", "el corte ingles", "el corte inglés"], category: "Ropa y accesorios" },
  { keywords: ["leroy merlin", "bricomart", "ikea", "casa y jardin"], category: "Casa y jardín" },
  { keywords: ["apple.com", "google play", "microsoft", "adobe"], category: "Software y aplicaciones" },
  { keywords: ["veterinario", "veterinaria", "kiwoko", "tiendanimal"], category: "Mascotas" },
]

function guessCategory(description: string | null, familyCategoryNames: Set<string>): string {
  if (description) {
    const norm = description.toLowerCase()
    for (const rule of MERCHANT_CATEGORY_RULES) {
      if (rule.keywords.some((k) => norm.includes(k)) && familyCategoryNames.has(rule.category)) return rule.category
    }
  }
  return familyCategoryNames.has("Otros") ? "Otros" : [...familyCategoryNames][0] ?? "Otros"
}

interface BankAccountRow {
  id: string
  account_uid: string
  connection_id: string
  bank_connections: { family_id: string; status: string }
}

async function syncAccount(
  admin: ReturnType<typeof createClient>,
  jwt: string,
  account: BankAccountRow,
  defaultDays: number,
): Promise<{ synced: number; error?: string }> {
  // Incremental de verdad: si la cuenta ya tiene movimientos, se pide
  // desde el último guardado (3 días de margen por si el banco liquida
  // tarde) en vez del periodo pedido — así una sincronización 4 veces
  // al día no vuelve a traer el mes entero cada vez.
  const { data: latest } = await admin
    .from("bank_transactions")
    .select("transaction_date")
    .eq("account_id", account.id)
    .order("transaction_date", { ascending: false })
    .limit(1)
    .maybeSingle()

  let dateFrom: string | null = null
  if (latest?.transaction_date) {
    const d = new Date(latest.transaction_date as string)
    d.setDate(d.getDate() - 3)
    dateFrom = d.toISOString().slice(0, 10)
  } else if (defaultDays > 0) {
    dateFrom = new Date(Date.now() - defaultDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  }

  let continuationKey: string | null = null
  let synced = 0
  do {
    const url = new URL(`https://api.enablebanking.com/accounts/${account.account_uid}/transactions`)
    if (dateFrom) url.searchParams.set("date_from", dateFrom)
    if (continuationKey) url.searchParams.set("continuation_key", continuationKey)
    const res = await fetch(url, { headers: { Authorization: `Bearer ${jwt}` } })
    if (!res.ok) throw new Error(await res.text())
    const data = await res.json()
    const transactions: EnableTransaction[] = Array.isArray(data.transactions) ? data.transactions : []

    const rows = transactions
      .filter((t) => t.entry_reference)
      .map((t) => ({
        account_id: account.id,
        entry_reference: t.entry_reference,
        transaction_date: t.booking_date ?? t.value_date ?? t.transaction_date ?? null,
        amount: Number(t.transaction_amount.amount),
        currency: t.transaction_amount.currency,
        credit_debit: t.credit_debit_indicator,
        description: describeTransaction(t),
        raw: t,
      }))
    if (rows.length > 0) {
      const { error: upsertError } = await admin.from("bank_transactions").upsert(rows, { onConflict: "account_id,entry_reference" })
      if (upsertError) throw upsertError
      synced += rows.length
    }
    continuationKey = data.continuation_key ?? null
  } while (continuationKey)

  await linkTransactionsToExpenses(admin, account)
  return { synced }
}

// Convierte cada movimiento del banco sin enlazar todavía en un gasto
// real de Movimientos: o se une a un ticket ya existente (mismo
// importe, ±3 días) o se crea un gasto nuevo con categoría adivinada.
async function linkTransactionsToExpenses(admin: ReturnType<typeof createClient>, account: BankAccountRow): Promise<void> {
  const familyId = account.bank_connections.family_id

  const { data: unmatched } = await admin
    .from("bank_transactions")
    .select("id, transaction_date, amount, currency, credit_debit, description")
    .eq("account_id", account.id)
    .is("matched_expense_id", null)
  if (!unmatched || unmatched.length === 0) return

  const { data: categories } = await admin.from("budget_categories").select("name").eq("family_id", familyId)
  const familyCategoryNames = new Set((categories ?? []).map((c) => c.name as string))

  for (const bt of unmatched) {
    const store = cleanMerchantName(bt.description as string | null)
    const isIncome = bt.credit_debit === "CRDT"

    if (!isIncome) {
      // ¿Ya existe un ticket O un gasto apuntado a mano con este mismo
      // importe en una fecha cercana, sin enlazar todavía a ningún
      // otro movimiento bancario? Si lo hay, es la misma compra pagada
      // con tarjeta: no se duplica (petición real: "comprobar que no
      // se dupliquen movimientos con los tickets importados" — se
      // aplica igual a un gasto manual, es el mismo caso real).
      const date = new Date(bt.transaction_date as string)
      const from = new Date(date)
      from.setDate(from.getDate() - 3)
      const to = new Date(date)
      to.setDate(to.getDate() + 3)

      const { data: candidates } = await admin
        .from("expenses")
        .select("id, amount")
        .eq("family_id", familyId)
        .in("source", ["ticket", "manual"])
        .eq("is_income", false)
        .gte("expense_date", from.toISOString().slice(0, 10))
        .lte("expense_date", to.toISOString().slice(0, 10))

      const match = (candidates ?? []).find((c) => Math.abs(Number(c.amount) - Number(bt.amount)) < 0.01)

      if (match) {
        const { data: alreadyLinked } = await admin
          .from("bank_transactions")
          .select("id")
          .eq("matched_expense_id", match.id)
          .maybeSingle()
        if (!alreadyLinked) {
          await admin.from("expenses").update({ source: "ticket_banco" }).eq("id", match.id)
          await admin.from("bank_transactions").update({ matched_expense_id: match.id }).eq("id", bt.id)
          continue
        }
      }
    }

    const category = isIncome ? "" : guessCategory(store, familyCategoryNames)
    const { data: newExpense, error: insertError } = await admin
      .from("expenses")
      .insert({
        family_id: familyId,
        expense_date: bt.transaction_date,
        amount: Number(bt.amount),
        category: isIncome ? "Ingreso" : category,
        store: isIncome ? null : store,
        kind: "real",
        notes: bt.description as string | null,
        is_income: isIncome,
        budget_group: isIncome ? "ingresos" : "generales",
        source: "banco",
      })
      .select("id")
      .single()
    if (!insertError && newExpense) {
      await admin.from("bank_transactions").update({ matched_expense_id: newExpense.id }).eq("id", bt.id)
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS })

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // Dos formas de llamar: pg_cron con el secreto compartido (todas
    // las familias, 4 veces al día) o la propia app con la sesión de
    // un usuario (solo su familia, botón "Sincronizar movimientos").
    const cronSecretHeader = req.headers.get("x-cron-secret")
    let familyIds: string[] | null = null

    if (cronSecretHeader) {
      const { data: expectedSecret } = await admin.rpc("get_app_secret", { p_name: "cron_shared_secret" })
      if (!expectedSecret || cronSecretHeader !== expectedSecret) return json({ error: "unauthorized" }, 401)
      familyIds = null // null = todas las familias
    } else {
      const authHeader = req.headers.get("Authorization")
      if (!authHeader) return json({ error: "unauthorized" }, 401)
      const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
      const { data: userData, error: userError } = await userClient.auth.getUser()
      if (userError || !userData.user) return json({ error: "unauthorized" }, 401)
      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("family_id")
        .eq("id", userData.user.id)
        .single()
      if (profileError || !profile) return json({ error: "no family" }, 400)
      familyIds = [profile.family_id as string]
    }

    const [{ data: applicationId }, { data: privateKey }] = await Promise.all([
      admin.rpc("get_app_secret", { p_name: "enablebanking_application_id" }),
      admin.rpc("get_app_secret", { p_name: "enablebanking_private_key" }),
    ])
    if (!applicationId || !privateKey) return json({ error: "not_configured" }, 500)

    // "days": solo importa para la primera sincronización de cada
    // cuenta (a partir de ahí es incremental, ver syncAccount) — por
    // defecto los últimos 3 meses (petición real: "el histórico
    // completo podría ser mucho... que tal si se importan los últimos
    // 3 meses"). 0 = todo el histórico disponible.
    let defaultDays = 90
    try {
      const body = await req.json()
      if (typeof body?.days === "number" && body.days >= 0) defaultDays = body.days
    } catch {
      // Sin body (p. ej. llamada de cron) → se queda el valor por defecto.
    }

    let accountsQuery = admin
      .from("bank_accounts")
      .select("id, account_uid, connection_id, bank_connections!inner(family_id, status)")
      .eq("bank_connections.status", "active")
    if (familyIds) accountsQuery = accountsQuery.in("bank_connections.family_id", familyIds)
    const { data: accounts, error: accountsError } = await accountsQuery
    if (accountsError) throw accountsError

    const jwt = await signEnableBankingJWT(applicationId, privateKey)
    let totalSynced = 0
    const results: { accountId: string; synced: number; error?: string }[] = []

    for (const account of (accounts ?? []) as unknown as BankAccountRow[]) {
      try {
        const { synced } = await syncAccount(admin, jwt, account, defaultDays)
        results.push({ accountId: account.id, synced })
        totalSynced += synced
      } catch (err) {
        results.push({ accountId: account.id, synced: 0, error: String(err) })
      }
    }

    return json({ ok: true, totalSynced, accounts: results })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
