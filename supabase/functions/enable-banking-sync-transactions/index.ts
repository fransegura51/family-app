import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

// Botón "Sincronizar movimientos" en Banco: trae los movimientos de
// todas las cuentas ya enlazadas de la familia y los guarda en
// bank_transactions (deduplicados por entry_reference, gracias al
// unique(account_id, entry_reference) de la migración 0066). Formato
// de /accounts/{uid}/transactions verificado contra el sandbox real de
// Enable Banking (Mock ASPSP) el 2026-09-09 — no es una suposición de
// la documentación: transaction_amount.amount llega como STRING,
// booking_date es la fecha a usar, credit_debit_indicator ya viene en
// 'CRDT'/'DBIT' tal cual necesita la columna.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS })

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return json({ error: "unauthorized" }, 401)

    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) return json({ error: "unauthorized" }, 401)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("family_id")
      .eq("id", userData.user.id)
      .single()
    if (profileError || !profile) return json({ error: "no family" }, 400)

    const [{ data: applicationId }, { data: privateKey }] = await Promise.all([
      admin.rpc("get_app_secret", { p_name: "enablebanking_application_id" }),
      admin.rpc("get_app_secret", { p_name: "enablebanking_private_key" }),
    ])
    if (!applicationId || !privateKey) return json({ error: "not_configured" }, 500)

    // Cuántos días hacia atrás traer — por defecto el último mes
    // (petición real: "se pueden importar el último mes por ejemplo?",
    // en vez del histórico completo que da el banco). "days" a 0 o
    // ausente en el body es el único caso que trae todo el histórico.
    let days = 30
    try {
      const body = await req.json()
      if (typeof body?.days === "number" && body.days > 0) days = body.days
      else if (body?.days === 0) days = 0
    } catch {
      // Sin body (o body vacío) → se queda el valor por defecto (30).
    }
    const dateFrom = days > 0 ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) : null

    const { data: accounts, error: accountsError } = await admin
      .from("bank_accounts")
      .select("id, account_uid, connection_id, bank_connections!inner(family_id, status)")
      .eq("bank_connections.family_id", profile.family_id)
      .eq("bank_connections.status", "active")
    if (accountsError) throw accountsError

    const jwt = await signEnableBankingJWT(applicationId, privateKey)
    let totalSynced = 0
    const results: { accountId: string; synced: number; error?: string }[] = []

    for (const account of accounts ?? []) {
      let continuationKey: string | null = null
      let syncedForAccount = 0
      try {
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
            const { error: upsertError } = await admin
              .from("bank_transactions")
              .upsert(rows, { onConflict: "account_id,entry_reference" })
            if (upsertError) throw upsertError
            syncedForAccount += rows.length
          }
          continuationKey = data.continuation_key ?? null
        } while (continuationKey)
        results.push({ accountId: account.id, synced: syncedForAccount })
        totalSynced += syncedForAccount
      } catch (err) {
        results.push({ accountId: account.id, synced: syncedForAccount, error: String(err) })
      }
    }

    return json({ ok: true, totalSynced, accounts: results })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
