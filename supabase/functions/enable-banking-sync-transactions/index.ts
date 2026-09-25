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
//   importe y una fecha cercana (±7 días — un ticket puede fotografiarse
//   días después de la compra), es la misma compra
//   pagada con tarjeta: no se duplica, se marca ese gasto como source
//   'ticket_banco' y se enlaza (petición real: "que no se dupliquen
//   movimientos con los tickets importados" — se detectó en pruebas
//   que también pasaba con un gasto manual, no solo con tickets).
// - Si no hay ningún gasto que case, se crea uno nuevo con source
//   'banco', categoría adivinada por el comercio (siempre editable
//   después, igual que cualquier otro gasto — nunca se inventa una
//   categoría seguro: si no hay pista clara, se deja en "Otros").
// - Un "ANUL COMPRA TARJ..." (cobro anulado por el comercio/banco, no
//   un ingreso real) se empareja con el cobro original del mismo
//   importe y ambos pasan a "Cobro anulado" (ver
//   linkTransactionsToExpenses) — así no cuentan como gasto duplicado
//   ni como ingreso suelto si luego se vuelve a cobrar.
// - FASE CA-1 — mismo destino ("Cobro anulado") para una reversión/bonificación de comisión bancaria
//   ("BONIFIC. COMISION MANT. CUENTA" contra "INTERESES Y/O COMISIONES CUENTA", caso real auditado del
//   24/06 y 24/09/2026): el banco no usa la palabra "ANUL" para esto, así que es una regla aparte,
//   deliberadamente más estrecha (misma cuenta, ventana de 3 días, exige palabra de comisión/interés en
//   AMBOS lados) — ver isCommissionReversalDescription/isCommissionChargeDescription/
//   pickUnambiguousCommissionCharge. Si hay ambigüedad (más de un cargo candidato), no empareja nada.
//
// Primera vez que se sincroniza una cuenta: trae el periodo pedido
// (días). A partir de ahí cada sincronización es incremental de
// verdad: solo pide al banco desde el último movimiento que ya
// tenemos guardado (con 3 días de margen por si algo llega con
// retraso), no repite el mes entero cada vez.
//
// verify_jwt = false a propósito (petición real: "la de Sabadell no se
// ha sincronizado sola pero si dándole a sincronizar" — el cron 4x/día
// llamaba SIN cabecera Authorization, solo con x-cron-secret; con
// verify_jwt=true la propia plataforma rechazaba esa llamada con 401
// antes de que el código de aquí abajo llegase a comprobar el secreto,
// así que el cron llevaba fallando siempre, silenciosamente, y solo el
// botón manual (que sí manda el JWT del usuario) funcionaba). La
// autenticación real la sigue haciendo el propio código: secreto
// compartido para el cron, o JWT de usuario para el botón — igual que
// sync-external-calendars-cron / sync-calendar-to-google-cron.

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

// FASE CA-1 — petición real: "INTERESES Y/O COMISIONES CUENTA" (cargo) + "BONIFIC. COMISION MANT.
// CUENTA" (abono), mismo día, se cancelan entre sí igual que un "ANUL COMPRA TARJ..." — pero el banco no
// usa la palabra "ANUL" para esto, así que el patrón /^anul\b/i de más abajo nunca lo detectaba. Regla
// DELIBERADAMENTE estrecha: nunca "mismo importe con signo contrario" a secas (eso generaría falsos
// "Cobro anulado" con cualquier coincidencia de importe, p. ej. una compra de 60€ y un ingreso de 60€ sin
// relación) — exige que AMBAS descripciones (abono Y cargo candidato) mencionen comisión/interés, no solo
// la del abono. Funciones puras (sin admin/IO) para poder razonarlas y testearlas por separado.
const COMMISSION_KEYWORDS_PATTERN = /comisi[oó]n|inter[eé]s(es)?/i
const COMMISSION_REVERSAL_PATTERN = /bonific|revers|anulaci[oó]n/i

// ¿Es esta la descripción de un CARGO de comisión/interés bancario (el lado que se anula)?
function isCommissionChargeDescription(description: string | null): boolean {
  return COMMISSION_KEYWORDS_PATTERN.test(description ?? "")
}

// ¿Es esta la descripción de un ABONO que revierte/bonifica una comisión (el lado que anula)? Exige
// también la palabra de comisión/interés en el propio abono (no solo "bonific") para no confundirse con
// una bonificación no relacionada con comisiones (p. ej. "BONIFICACION NOMINA").
function isCommissionReversalDescription(description: string | null): boolean {
  const text = description ?? ""
  return COMMISSION_REVERSAL_PATTERN.test(text) && COMMISSION_KEYWORDS_PATTERN.test(text)
}

// Mismo margen que INTERNAL_TRANSFER_MATCH_WINDOW_DAYS / RECONCILIATION_DATE_WINDOW_DAYS (domain/
// finance.ts, domain/forecastReconciliation.ts): 3 días para dos patas del MISMO evento real. Los dos
// casos reales observados (24/06 y 24/09/2026) llegan el mismo día — 3 días deja margen para que el banco
// registre la bonificación con un pequeño desfase sin ampliarlo a una ventana larga tipo la de 60 días de
// "ANUL" (esa es para una devolución de compra, que sí puede tardar semanas; una reversión de comisión de
// mantenimiento es un ajuste del propio banco, se aplica casi siempre el mismo día o el siguiente).
const COMMISSION_REVERSAL_MATCH_WINDOW_DAYS = 3

interface CommissionChargeCandidate {
  id: string
  amount: number
  description: string | null
}

// Único candidato válido, o null si no hay ninguno o si hay más de uno — mejor NO emparejar
// automáticamente (cae al camino normal, como un Ingreso cualquiera) que arriesgar un "Cobro anulado"
// falso por ambigüedad (petición real, caso de dos cargos candidatos del mismo importe).
function pickUnambiguousCommissionCharge(candidates: CommissionChargeCandidate[], targetAmount: number): CommissionChargeCandidate | null {
  const matches = candidates.filter((c) => Math.abs(c.amount - targetAmount) < 0.01 && isCommissionChargeDescription(c.description))
  return matches.length === 1 ? matches[0] : null
}

// FASE DEV-1 — devolución bancaria EXPLÍCITA: el banco antepone literalmente la palabra "DEVOLUCION" a
// estos abonos (auditoría real, Familia Hepburn: 5/5 casos conocidos empiezan así — Amazon, Farmacia,
// Leroy Merlin, Google One, C&A). Regla deliberadamente tan estrecha como /^anul\b/i: SOLO reconoce ese
// inicio literal, nunca "abono"/"reembolso"/"retorno"/"ajuste"/"bonificación"/"refund"/"transferencia
// recibida" — quedan fuera a propósito en esta fase. NO intenta enlazar ninguna compra (la auditoría
// demostró que 3/5 son parciales, 1/5 no tiene compra localizable, y Amazon puede repetir el mismo
// importe en varios cargos distintos el mismo mes) — solo decide QUÉ ES el abono, nunca A QUÉ
// corresponde, así que no hace ninguna consulta adicional (a diferencia de ANUL/CA-1).
const EXPLICIT_BANK_REFUND_PATTERN = /^devolucion\b/i

function isExplicitBankRefundDescription(description: string | null): boolean {
  return EXPLICIT_BANK_REFUND_PATTERN.test(description ?? "")
}

// Mismo valor que REFUND_CATALOG_KEY en src/domain/refunds.ts — un edge function Deno no puede importar
// de src/ (se despliega como archivo aparte), así que se mantiene sincronizado a mano; ver
// explicitBankRefundDetection.test.ts, que comprueba que este valor coincide exactamente con el de
// refunds.ts. Identidad SIEMPRE por catalog_key, nunca por el nombre visible de la categoría (igual que
// refunds.ts: una familia puede renombrar "Devoluciones" sin perder la identidad).
const REFUND_CATALOG_KEY = "i.ingreso.devoluciones"

interface BankAccountRow {
  id: string
  account_uid: string
  connection_id: string
  owner_member_id: string | null
  bank_connections: { family_id: string; status: string }
}

interface EnableBalance {
  balance_amount?: { amount?: string; currency?: string }
  balance_type?: string
}

// Petición real: "debajo de Economía Pepa me vas a poner tarjetas de
// saldo con las cuentas de los bancos" — el saldo no viene en el
// listado de cuentas (solo iban/nombre/moneda), hay que pedirlo aparte
// a /accounts/{uid}/balances. Si falla (algún banco no lo expone, o el
// consentimiento no cubre saldos), no debe tirar abajo el resto de la
// sincronización — lo importante son los movimientos, el saldo es un
// extra.
async function syncBalance(admin: ReturnType<typeof createClient>, jwt: string, account: BankAccountRow): Promise<void> {
  try {
    const res = await fetch(`https://api.enablebanking.com/accounts/${account.account_uid}/balances`, {
      headers: { Authorization: `Bearer ${jwt}` },
    })
    if (!res.ok) return
    const data = await res.json()
    const balances: EnableBalance[] = Array.isArray(data.balances) ? data.balances : []
    // Preferimos el disponible de verdad (lo que se puede gastar ya
    // mismo) sobre el contable/liquidado si el banco distingue los dos.
    const chosen =
      balances.find((b) => (b.balance_type ?? "").toLowerCase().includes("available")) ??
      balances.find((b) => (b.balance_type ?? "").toLowerCase().includes("booked")) ??
      balances[0]
    const amount = chosen?.balance_amount?.amount
    if (amount == null) return
    await admin
      .from("bank_accounts")
      .update({
        balance: Number(amount),
        balance_currency: chosen?.balance_amount?.currency ?? null,
        balance_updated_at: new Date().toISOString(),
      })
      .eq("id", account.id)
  } catch {
    // Sin saldo esta vez — no bloquea el resto de la sincronización.
  }
}

async function syncAccount(
  admin: ReturnType<typeof createClient>,
  jwt: string,
  account: BankAccountRow,
  requestedDays: number | null,
): Promise<{ synced: number; error?: string }> {
  // Incremental de verdad: si la cuenta ya tiene movimientos, por
  // defecto se pide desde el último guardado (3 días de margen por si
  // el banco liquida tarde) en vez de repetir el periodo pedido cada
  // vez — así el cron 4 veces al día no vuelve a traer el mes entero.
  //
  // Pero si la familia pide explícitamente un periodo más amplio desde
  // el botón "Sincronizar movimientos" (petición real: "he intentado
  // importar los últimos 3 meses pero no he podido" — antes el
  // desplegable de periodo solo servía la primerísima vez que se
  // enlazaba la cuenta, luego se ignoraba siempre), se amplía el
  // histórico hacia atrás hasta cubrir también ese periodo, sin perder
  // el margen incremental hacia delante. requestedDays === 0 ("todo el
  // histórico") siempre fuerza a pedir sin límite de fecha, aunque ya
  // haya movimientos guardados.
  const { data: latest } = await admin
    .from("bank_transactions")
    .select("transaction_date")
    .eq("account_id", account.id)
    .order("transaction_date", { ascending: false })
    .limit(1)
    .maybeSingle()

  let incrementalFrom: string | null = null
  if (latest?.transaction_date) {
    const d = new Date(latest.transaction_date as string)
    d.setDate(d.getDate() - 3)
    incrementalFrom = d.toISOString().slice(0, 10)
  }

  let dateFrom: string | null
  if (requestedDays === 0) {
    dateFrom = null
  } else if (requestedDays != null && requestedDays > 0) {
    const requestedFrom = new Date(Date.now() - requestedDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    dateFrom = incrementalFrom && incrementalFrom < requestedFrom ? incrementalFrom : requestedFrom
  } else if (incrementalFrom) {
    dateFrom = incrementalFrom
  } else {
    dateFrom = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  }

  // El saldo se pide antes que los movimientos y en su propio
  // try/catch (ver syncBalance) — así, si el banco está limitando las
  // peticiones de movimientos (visto en pruebas reales: "[HUB046]
  // Allowed number of accesses exceeded for consent"), al menos se
  // intenta el saldo antes de que el resto de la función pueda fallar.
  await syncBalance(admin, jwt, account)

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

// Compartida por el patrón "ANUL..." y por la nueva regla de reversión de comisión (FASE CA-1): pasa el
// cargo ya existente a "Cobro anulado", crea el gasto del abono con esa misma categoría y enlaza el
// movimiento bancario del abono a ese nuevo gasto. Mismo efecto exacto que tenía el bloque de "ANUL" antes
// de esta fase — solo se ha sacado a una función para no repetirlo con la regla nueva.
async function reclassifyAsCancelledChargePair(
  admin: ReturnType<typeof createClient>,
  params: {
    chargeExpenseId: string
    familyId: string
    ownerMemberId: string | null
    bt: { id: string; transaction_date: unknown; amount: unknown; description: unknown }
  },
): Promise<void> {
  await admin.from("expenses").update({ category: "Cobro anulado" }).eq("id", params.chargeExpenseId)
  const { data: refundExpense } = await admin
    .from("expenses")
    .insert({
      family_id: params.familyId,
      expense_date: params.bt.transaction_date,
      amount: Number(params.bt.amount),
      category: "Cobro anulado",
      store: null,
      kind: "real",
      notes: params.bt.description as string | null,
      is_income: true,
      budget_group: "generales",
      source: "banco",
      owner_member_id: params.ownerMemberId,
    })
    .select("id")
    .single()
  if (refundExpense) await admin.from("bank_transactions").update({ matched_expense_id: refundExpense.id }).eq("id", params.bt.id)
}

// Convierte cada movimiento del banco sin enlazar todavía en un gasto
// real de Movimientos: o se une a un ticket ya existente (mismo
// importe, ±7 días) o se crea un gasto nuevo con categoría adivinada.
async function linkTransactionsToExpenses(admin: ReturnType<typeof createClient>, account: BankAccountRow): Promise<void> {
  const familyId = account.bank_connections.family_id

  const { data: unmatched } = await admin
    .from("bank_transactions")
    .select("id, transaction_date, amount, currency, credit_debit, description")
    .eq("account_id", account.id)
    .is("matched_expense_id", null)
  if (!unmatched || unmatched.length === 0) return

  const { data: categories } = await admin.from("budget_categories").select("name, catalog_key").eq("family_id", familyId)
  const familyCategoryNames = new Set((categories ?? []).map((c) => c.name as string))
  // FASE DEV-1 — resuelve el nombre REAL de "Devoluciones" para esta familia por catalog_key (nunca un
  // texto fijo "Devoluciones": la categoría podría estar renombrada, igual que ya asume refunds.ts). Si
  // la familia no tiene esa categoría (no debería pasar: la crea el catálogo estándar), la regla DEV-1
  // simplemente no se aplica y el abono cae al camino normal de "Ingreso" — nunca se inventa una
  // categoría que no existe.
  const refundCategoryName = (categories ?? []).find((c) => c.catalog_key === REFUND_CATALOG_KEY)?.name as string | undefined

  for (const bt of unmatched) {
    const store = cleanMerchantName(bt.description as string | null)
    const isIncome = bt.credit_debit === "CRDT"

    // Petición real: "H&M las últimas dos compras me han cobrado, me lo
    // han devuelto y lo han vuelto a cobrar... parece que se ha
    // gastado el doble" — "ANUL COMPRA TARJ..." es la anulación de un
    // cobro anterior, no un ingreso real. Se busca ese cobro original
    // (mismo importe, en los 60 días anteriores, todavía no emparejado
    // con otra anulación) y se pasan AMBOS a "Cobro anulado" —
    // subcategoría hermana de "Transferencias entre cuentas propias"
    // bajo "Movimientos internos" (ver 0115_cancelled_charge_category),
    // así que queda excluido de Gastado/Ingresado en toda la app con el
    // mismo mecanismo que ya usa isInternalTransferCategory, sin tocar
    // cada sitio que lo calcula. Si no se encuentra el cobro original
    // (p. ej. de antes de empezar a sincronizar), cae al camino normal
    // de abajo y se guarda como un Ingreso cualquiera.
    if (isIncome && /^anul\b/i.test((bt.description as string | null) ?? "")) {
      const date = new Date(bt.transaction_date as string)
      const from = new Date(date)
      from.setDate(from.getDate() - 60)

      const { data: chargeCandidates } = await admin
        .from("expenses")
        .select("id, amount, expense_date")
        .eq("family_id", familyId)
        .in("source", ["banco", "ticket_banco"])
        .eq("is_income", false)
        // Null-safe: en SQL «NULL <> 'x'» no es verdadero, así que un cargo SIN categoría (pendiente de clasificar) se perdería como
        // candidato a original de una anulación. Hoy este sync no produce categorías NULL; se prepara el consumidor (Fase 6C.2A).
        .or("category.is.null,category.neq.Cobro anulado")
        .gte("expense_date", from.toISOString().slice(0, 10))
        .lte("expense_date", bt.transaction_date as string)

      const originalCharge = (chargeCandidates ?? [])
        .filter((c) => Math.abs(Number(c.amount) - Number(bt.amount)) < 0.01)
        .sort(
          (a, b) =>
            Math.abs(new Date(a.expense_date as string).getTime() - date.getTime()) -
            Math.abs(new Date(b.expense_date as string).getTime() - date.getTime()),
        )[0]

      if (originalCharge) {
        await reclassifyAsCancelledChargePair(admin, { chargeExpenseId: originalCharge.id, familyId, ownerMemberId: account.owner_member_id, bt })
        continue
      }
    }

    // FASE CA-1 — reversión/bonificación de comisión bancaria (ver isCommissionReversalDescription más
    // arriba): solo se intenta cuando el patrón "ANUL" de arriba no ha aplicado. Ventana corta (3 días,
    // no 60 — ver COMMISSION_REVERSAL_MATCH_WINDOW_DAYS), MISMA CUENTA (bank_transactions.account_id =
    // account.id, la cuenta que se está sincronizando ahora mismo — no se busca en otras cuentas de la
    // familia) y exige que el cargo candidato también mencione comisión/interés (isCommissionChargeDescription)
    // — así un "BONIFIC." cualquiera no candidato no empareja con una compra normal (petición real, caso
    // 6). Si hay más de un cargo candidato del mismo importe, no se elige ninguno (petición real, caso 7:
    // mejor no automatizar un caso dudoso que crear un "Cobro anulado" falso) y cae al camino normal de
    // abajo, igual que si no se hubiera encontrado ninguno.
    if (isIncome && isCommissionReversalDescription((bt.description as string | null) ?? null)) {
      const date = new Date(bt.transaction_date as string)
      const from = new Date(date)
      from.setDate(from.getDate() - COMMISSION_REVERSAL_MATCH_WINDOW_DAYS)

      // Mismo criterio que el resto del archivo: dos consultas simples (bank_transactions de esta MISMA
      // cuenta, luego los expenses que enlazan) en vez de un embed de PostgREST, para quedar en el mismo
      // estilo que el resto de linkTransactionsToExpenses.
      const { data: chargeTxCandidates } = await admin
        .from("bank_transactions")
        .select("amount, description, matched_expense_id")
        .eq("account_id", account.id)
        .eq("credit_debit", "DBIT")
        .not("matched_expense_id", "is", null)
        .gte("transaction_date", from.toISOString().slice(0, 10))
        .lte("transaction_date", bt.transaction_date as string)

      const candidateExpenseIds = (chargeTxCandidates ?? []).map((c) => c.matched_expense_id as string)
      const { data: candidateExpenses } = candidateExpenseIds.length
        ? await admin.from("expenses").select("id, is_income, category").in("id", candidateExpenseIds)
        : { data: [] as { id: string; is_income: boolean; category: string | null }[] }
      const eligibleExpenseIds = new Set(
        (candidateExpenses ?? []).filter((e) => e.is_income === false && e.category !== "Cobro anulado").map((e) => e.id as string),
      )

      const eligible: CommissionChargeCandidate[] = (chargeTxCandidates ?? [])
        .filter((c) => eligibleExpenseIds.has(c.matched_expense_id as string))
        .map((c) => ({ id: c.matched_expense_id as string, amount: Number(c.amount), description: c.description as string | null }))

      const originalCharge = pickUnambiguousCommissionCharge(eligible, Number(bt.amount))
      if (originalCharge) {
        await reclassifyAsCancelledChargePair(admin, { chargeExpenseId: originalCharge.id, familyId, ownerMemberId: account.owner_member_id, bt })
        continue
      }
    }

    // FASE DEV-1 — devolución bancaria explícita (ver isExplicitBankRefundDescription más arriba): solo
    // se intenta cuando ni "ANUL" ni la reversión de comisión de arriba han aplicado. A diferencia de
    // esas dos reglas, esta NO hace ninguna consulta ni busca la compra original — solo decide la
    // categoría del ingreso que se va a insertar más abajo (ver "category: isIncome ? incomeCategory...").
    const incomeCategory = isIncome && refundCategoryName && isExplicitBankRefundDescription((bt.description as string | null) ?? null) ? refundCategoryName : "Ingreso"

    if (!isIncome) {
      // ¿Ya existe un ticket O un gasto apuntado a mano con este mismo
      // importe en una fecha cercana, sin enlazar todavía a ningún
      // otro movimiento bancario? Si lo hay, es la misma compra pagada
      // con tarjeta: no se duplica (petición real: "comprobar que no
      // se dupliquen movimientos con los tickets importados" — se
      // aplica igual a un gasto manual, es el mismo caso real).
      // Antes ±3 días: se vio en producción un ticket fotografiado 4
      // días después de la compra (fin de semana) que se quedaba fuera
      // del margen y se duplicaba. Con ±7 días cabe más de un candidato
      // del mismo importe exacto, así que se queda con el de fecha más
      // cercana al movimiento del banco, no el primero que devuelva la
      // consulta (sin orden garantizado).
      const date = new Date(bt.transaction_date as string)
      const from = new Date(date)
      from.setDate(from.getDate() - 7)
      const to = new Date(date)
      to.setDate(to.getDate() + 7)

      const { data: candidates } = await admin
        .from("expenses")
        .select("id, amount, expense_date")
        .eq("family_id", familyId)
        .in("source", ["ticket", "manual"])
        .eq("is_income", false)
        .gte("expense_date", from.toISOString().slice(0, 10))
        .lte("expense_date", to.toISOString().slice(0, 10))

      const match = (candidates ?? [])
        .filter((c) => Math.abs(Number(c.amount) - Number(bt.amount)) < 0.01)
        .sort(
          (a, b) =>
            Math.abs(new Date(a.expense_date as string).getTime() - date.getTime()) -
            Math.abs(new Date(b.expense_date as string).getTime() - date.getTime()),
        )[0]

      if (match) {
        const { data: alreadyLinked } = await admin
          .from("bank_transactions")
          .select("id")
          .eq("matched_expense_id", match.id)
          .maybeSingle()
        if (!alreadyLinked) {
          // Piso compartido: si el ticket/manual ya tenía otro dueño
          // (p. ej. quien lo apuntó a mano), pasa a ser el de la cuenta
          // bancaria — es la fuente real de quién es ese dinero.
          await admin.from("expenses").update({ source: "ticket_banco", owner_member_id: account.owner_member_id }).eq("id", match.id)
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
        category: isIncome ? incomeCategory : category,
        store: isIncome ? null : store,
        kind: "real",
        notes: bt.description as string | null,
        is_income: isIncome,
        budget_group: isIncome ? "ingresos" : "generales",
        source: "banco",
        // Piso compartido: este insert corre con el rol de servicio (sin
        // auth.uid()), así que el default de la columna no aplica aquí
        // — el dueño real es el de la cuenta bancaria de origen.
        owner_member_id: account.owner_member_id,
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

    // "days": el periodo que pide EXPLÍCITAMENTE el botón "Sincronizar
    // movimientos" (ver syncAccount) — null si no viene body (p. ej. la
    // llamada de cron), que entonces es puramente incremental. 0 =
    // todo el histórico disponible, sin límite de fecha.
    let requestedDays: number | null = null
    try {
      const body = await req.json()
      if (typeof body?.days === "number" && body.days >= 0) requestedDays = body.days
    } catch {
      // Sin body (p. ej. llamada de cron) → null.
    }

    let accountsQuery = admin
      .from("bank_accounts")
      .select("id, account_uid, connection_id, owner_member_id, bank_connections!inner(family_id, status)")
      .eq("bank_connections.status", "active")
    if (familyIds) accountsQuery = accountsQuery.in("bank_connections.family_id", familyIds)
    const { data: accounts, error: accountsError } = await accountsQuery
    if (accountsError) throw accountsError

    const jwt = await signEnableBankingJWT(applicationId, privateKey)
    let totalSynced = 0
    const results: { accountId: string; synced: number; error?: string }[] = []

    for (const account of (accounts ?? []) as unknown as BankAccountRow[]) {
      try {
        const { synced } = await syncAccount(admin, jwt, account, requestedDays)
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
