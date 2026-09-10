// Módulo Banco (Enable Banking) — mismo patrón que google-calendar
// (startGoogleConnect): esta pestaña redirige al banco, la vuelta
// ocurre en enable-banking-auth-callback, que trae de vuelta a
// /familia con ?bank=connected o ?bank=error.
import { fetchAllRows, supabase } from '@/data/supabaseClient'
import type { BankAccount, BankConnection, BankTransaction } from '@/domain/types'

export interface Aspsp {
  name: string
  country: string
  logo: string | null
}

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('No autenticado')
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  return fetch(`${supabaseUrl}/functions/v1/${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
}

export async function listAspsps(country: string): Promise<Aspsp[]> {
  const res = await authedFetch(`enable-banking-list-aspsps?country=${encodeURIComponent(country)}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'No se pudo obtener la lista de bancos')
  return json.aspsps
}

// iban (opcional): pide un consentimiento "dedicado" a esa cuenta en vez
// del "global". Caso real: Caja Rural Central (hub Ruralvía) autorizaba
// el consentimiento global pero devolvía 0 cuentas, 12 veces seguidas —
// ver enable-banking-auth-start.
export async function startBankConnection(aspspName: string, aspspCountry: string, iban?: string): Promise<void> {
  const res = await authedFetch('enable-banking-auth-start', {
    method: 'POST',
    body: JSON.stringify({ aspspName, aspspCountry, iban: iban?.trim() || undefined }),
  })
  const json = await res.json()
  if (!res.ok || !json.url) {
    if (json.error === 'iban_invalid') throw new Error('El IBAN no parece correcto — revísalo (empieza por ES y tiene 24 caracteres).')
    throw new Error(json.error ?? 'No se pudo iniciar la conexión con el banco')
  }
  window.location.href = json.url
}

export interface SyncResult {
  totalSynced: number
}

// days: solo importa para la primera sincronización de cada cuenta —
// a partir de ahí cada sincronización (manual o del cron 4 veces al
// día) es incremental de verdad, solo trae lo nuevo desde el último
// movimiento ya guardado. Por defecto los últimos 3 meses (petición
// real: "el histórico completo podría ser mucho... los últimos 3
// meses"). 0 = todo el histórico disponible.
export async function syncBankTransactions(days = 90): Promise<SyncResult> {
  const res = await authedFetch('enable-banking-sync-transactions', { method: 'POST', body: JSON.stringify({ days }) })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'No se pudo sincronizar')
  return { totalSynced: json.totalSynced }
}

export async function listBankConnections(): Promise<BankConnection[]> {
  const { data, error } = await supabase
    .from('bank_connections')
    .select('id, family_id, aspsp_name, aspsp_country, status, valid_until, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    familyId: r.family_id,
    aspspName: r.aspsp_name,
    aspspCountry: r.aspsp_country,
    status: r.status,
    validUntil: r.valid_until,
    createdAt: r.created_at,
  }))
}

export async function listBankAccounts(): Promise<BankAccount[]> {
  const { data, error } = await supabase
    .from('bank_accounts')
    .select('id, connection_id, account_uid, iban, name, currency, balance, balance_currency, balance_updated_at')
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    connectionId: r.connection_id,
    accountUid: r.account_uid,
    iban: r.iban,
    name: r.name,
    currency: r.currency,
    balance: r.balance == null ? null : Number(r.balance),
    balanceCurrency: r.balance_currency,
    balanceUpdatedAt: r.balance_updated_at,
  }))
}

export async function listBankTransactions(): Promise<BankTransaction[]> {
  const data = await fetchAllRows((from, to) =>
    supabase
      .from('bank_transactions')
      .select('id, account_id, entry_reference, transaction_date, amount, currency, credit_debit, description, matched_expense_id')
      .order('transaction_date', { ascending: false })
      .order('id')
      .range(from, to),
  )
  return data.map((r) => ({
    id: r.id,
    accountId: r.account_id,
    entryReference: r.entry_reference,
    transactionDate: r.transaction_date,
    amount: Number(r.amount),
    currency: r.currency,
    creditDebit: r.credit_debit,
    description: r.description,
    matchedExpenseId: r.matched_expense_id,
  }))
}

// Antes solo se marcaba la fila como "revoked" y el consentimiento
// seguía vivo en Enable Banking y en el banco (bug real: 12 sesiones
// autorizadas huérfanas acumuladas en un solo día). Ahora se cierra de
// verdad en el servidor (DELETE /sessions, que cancela el consentimiento
// en el banco "si es posible"), y solo después se marca aquí.
export async function disconnectBank(connectionId: string): Promise<void> {
  const res = await authedFetch('enable-banking-disconnect', {
    method: 'POST',
    body: JSON.stringify({ connectionId }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error ?? 'No se pudo desconectar el banco')
}
