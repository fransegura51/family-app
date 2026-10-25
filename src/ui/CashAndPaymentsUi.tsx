import { useEffect, useMemo, useRef, useState } from 'react'
import { adoptEntryAsWithdrawal, addMovement, archiveWallet, assignWithdrawal, cashErrorText, createWallet, dismissDuplicate, linkBankExpenseToWallet, linkPurchaseToBank, listDuplicateDecisions, registerPurchaseRefund, removeDuplicateExpense, renameWallet, transferCash } from '@/data/cash'
import { checkWithdrawalSplit, planAdoptions, type WithdrawalCandidate } from '@/domain/cashWithdrawals'
import { balanceText, eur, movementDelta, usableWallets, type CashMovement, type CashWallet, type ShortfallChoice, type ShortfallNotice } from '@/domain/cashWallet'
import { planBankLinks, type BankLinkPair } from '@/domain/bankReconciliation'
import { findDuplicateSuggestions, type DupExpense, type DuplicateSuggestion } from '@/domain/duplicateDetection'
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS, parseAmount, type PaymentMethod } from '@/domain/manualPurchase'
import { emptyLeg, remainingToAllocate, splitInTwo, type PaymentLeg } from '@/domain/purchasePayments'
import { refundSummary, validateRefund, type RefundSummary } from '@/domain/purchaseRefunds'
import type { Expense, FamilyMember } from '@/domain/types'

// Efectivo opcional, pagos mixtos, devoluciones y duplicados. Todo lo que cambia datos pasa por las funciones del servidor de la
// migración 0312 (permisos y consistencia se comprueban allí); aquí solo se pide y se enseña.

const today = () => new Date().toISOString().slice(0, 10)
const shortDate = (d: string) => d.split('-').reverse().join('/')

// ─── Forma de pago de una compra: un medio, o varios (pago mixto) ───

export function PaymentSection({
  total,
  method,
  onMethod,
  walletId,
  onWallet,
  legs,
  onLegs,
  wallets,
}: {
  total: number | null
  method: string
  onMethod: (m: string) => void
  walletId: string
  onWallet: (id: string) => void
  /** null = un solo medio. */
  legs: PaymentLeg[] | null
  onLegs: (legs: PaymentLeg[] | null) => void
  /** Carteras que esta persona puede usar (vacío = el efectivo se registra sin cartera). */
  wallets: CashWallet[]
}) {
  const single = legs == null
  const rest = legs && total != null ? remainingToAllocate(total, legs) : 0

  function setLeg(i: number, patch: Partial<PaymentLeg>) {
    if (!legs) return
    onLegs(legs.map((l, idx) => (idx === i ? { ...l, ...patch, ...(patch.method && patch.method !== 'efectivo' ? { walletId: '' } : {}) } : l)))
  }

  const walletSelect = (value: string, onChange: (v: string) => void) =>
    wallets.length > 0 ? (
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Cartera de efectivo">
        <option value="">Sin cartera</option>
        {wallets.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name} ({balanceText(w.balance)})
          </option>
        ))}
      </select>
    ) : null

  return (
    <div className="day-modal-group" style={{ marginTop: 6 }}>
      {single ? (
        <>
          <label>
            Forma de pago
            <select value={method} onChange={(e) => onMethod(e.target.value)}>
              <option value="">—</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
          {method === 'efectivo' && walletSelect(walletId, onWallet)}
          {method !== '' && total != null && total > 0 && (
            <button type="button" className="link-button" onClick={() => onLegs(splitInTwo(total, { method: method as PaymentMethod, amount: String(total / 2), walletId: method === 'efectivo' ? walletId : '' }))}>
              + Pagar con varios medios
            </button>
          )}
        </>
      ) : (
        <>
          <p className="muted" style={{ margin: '0 0 4px' }}>
            Pago con varios medios — el gasto sigue siendo uno solo ({total != null ? eur(total) : '…'}).
          </p>
          {legs.map((l, i) => (
            <div key={i} className="receipt-line-row receipt-line-row-secondary">
              <select value={l.method} onChange={(e) => setLeg(i, { method: e.target.value as PaymentMethod })} aria-label="Medio de pago">
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
              <input type="number" step="0.01" min="0" value={l.amount} onChange={(e) => setLeg(i, { amount: e.target.value })} placeholder="€" aria-label="Importe del pago" />
              {l.method === 'efectivo' && walletSelect(l.walletId, (v) => setLeg(i, { walletId: v }))}
              {legs.length > 2 && (
                <button type="button" className="link-button" onClick={() => onLegs(legs.filter((_, idx) => idx !== i))} aria-label="Quitar este pago">
                  ✕
                </button>
              )}
            </div>
          ))}
          <p className={Math.abs(rest) > 0.005 ? 'error' : 'muted'} style={{ margin: '4px 0' }}>
            {Math.abs(rest) <= 0.005 ? '✓ Cuadra con el total' : rest > 0 ? `Faltan ${eur(rest)} por repartir` : `Sobran ${eur(-rest)}`}
          </p>
          <button type="button" className="link-button" onClick={() => onLegs([...legs, emptyLeg('tarjeta')])}>
            + Otro medio
          </button>{' '}
          <button type="button" className="link-button" onClick={() => onLegs(null)}>
            Un solo medio
          </button>
        </>
      )}
    </div>
  )
}

// ─── Aviso de saldo insuficiente (no bloqueante) ───

export function ShortfallDialog({ notice, walletName, onChoose, onAddCash }: { notice: ShortfallNotice; walletName: string; onChoose: (c: ShortfallChoice) => void; onAddCash: (amount: number) => void }) {
  const [adding, setAdding] = useState(false)
  const [amount, setAmount] = useState(String(notice.missing || ''))
  return (
    <div className="modal-overlay" role="alertdialog" aria-label="Saldo de la cartera insuficiente">
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2 className="section-title" style={{ margin: 0 }}>
          Efectivo en «{walletName}»
        </h2>
        <p>{notice.message}</p>
        {!adding ? (
          <div className="form-actions">
            <button type="button" onClick={() => onChoose('continue')}>
              {notice.choices[0].label}
            </button>
            <button type="button" className="link-button" onClick={() => setAdding(true)}>
              {notice.choices[1].label}
            </button>
            <button type="button" className="link-button" onClick={() => onChoose('cancel')}>
              {notice.choices[2].label}
            </button>
          </div>
        ) : (
          <>
            <label>
              ¿Cuánto efectivo añades? (€)
              <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <div className="form-actions">
              <button type="button" disabled={!(parseAmount(amount) ?? 0)} onClick={() => onAddCash(parseAmount(amount) ?? 0)}>
                Añadir y continuar
              </button>
              <button type="button" className="link-button" onClick={() => setAdding(false)}>
                Atrás
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Devolución de una compra ───

export function RefundPanel({ receiptId, summary, purchaseStore, wallets, onDone, onCancel }: { receiptId: string; summary: RefundSummary; purchaseStore: string | null; wallets: CashWallet[]; onDone: () => void; onCancel: () => void }) {
  const [amount, setAmount] = useState(String(summary.remaining))
  const [date, setDate] = useState(today())
  const [destination, setDestination] = useState<PaymentMethod>('tarjeta')
  const [walletId, setWalletId] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    const check = validateRefund(summary, amount)
    if ('error' in check) return setError(check.error)
    setSaving(true)
    setError(null)
    try {
      await registerPurchaseRefund({ receiptId, amount: check.amount, date, destination, walletId: destination === 'efectivo' && walletId ? walletId : null, note })
      onDone()
    } catch (err) {
      setError(cashErrorText(err, 'No se pudo registrar la devolución'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="day-modal-group">
      <p style={{ margin: 0 }}>
        Devolución de la compra{purchaseStore ? ` en ${purchaseStore}` : ''} — quedan {eur(summary.remaining)} por devolver.
      </p>
      <div className="inline-fields">
        <label>
          Importe devuelto (€)
          <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>
          Fecha
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <label>
        ¿Cómo te lo han devuelto?
        <select value={destination} onChange={(e) => setDestination(e.target.value as PaymentMethod)}>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_METHOD_LABELS[m]}
            </option>
          ))}
        </select>
      </label>
      {destination === 'efectivo' && wallets.length > 0 && (
        <select value={walletId} onChange={(e) => setWalletId(e.target.value)} aria-label="Cartera donde entra">
          <option value="">Sin cartera</option>
          {wallets.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      )}
      <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (opcional)" />
      <p className="muted" style={{ fontSize: 12, margin: '4px 0' }}>
        No cuenta como ingreso: resta del gasto de esa compra. La compra original no se toca.
      </p>
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button type="button" onClick={save} disabled={saving}>
          {saving ? 'Guardando…' : 'Registrar devolución'}
        </button>
        <button type="button" className="link-button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ─── Borrar una compra: qué va a pasar y cómo deshacerlo ───

export function DeletePurchaseDialog({ title, lines, onConfirm, onCancel, busy, hasPhoto = false }: { title: string; lines: string[]; onConfirm: () => void; onCancel: () => void; busy: boolean; hasPhoto?: boolean }) {
  return (
    <div className="modal-overlay" role="alertdialog" aria-label="Borrar compra">
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2 className="section-title" style={{ margin: 0 }}>
          Borrar «{title}»
        </h2>
        <p>Antes de borrarla, esto es lo que pasará:</p>
        <ul>
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <p className="muted" style={{ fontSize: 12 }}>
          {hasPhoto
            ? 'La foto del ticket se borra y NO se podrá recuperar: si deshaces el borrado justo después, la compra vuelve sin la foto.'
            : 'Podrás deshacerlo justo después.'}
        </p>
        <div className="form-actions">
          <button type="button" onClick={onConfirm} disabled={busy}>
            {busy ? 'Borrando…' : 'Borrar la compra'}
          </button>
          <button type="button" className="link-button" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

export function UndoNotice({ text, onUndo, onDismiss }: { text: string; onUndo: () => void; onDismiss: () => void }) {
  return (
    <div className="card" role="status" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <span style={{ flex: 1 }}>{text}</span>
      <button type="button" className="link-button" onClick={onUndo}>
        Deshacer
      </button>
      <button type="button" className="link-button" onClick={onDismiss} aria-label="Cerrar aviso">
        ✕
      </button>
    </div>
  )
}

export { refundSummary }

// ─── Carteras de efectivo (opcionales): crear y herramientas ───
// Las tarjetas y el listado de movimientos de cada cartera viven en Economía → Movimientos (FinanceScreen). Aquí solo están el formulario de
// alta y las cinco herramientas (entrada, salida, ajuste, traspaso y retirada del banco) de la cartera elegida.

export function NewWalletForm({ members, myMemberId, hasPersonal, onCreated, startOpen = false, onCancel }: { members: readonly FamilyMember[]; myMemberId: string | null; hasPersonal: boolean; onCreated: () => void; startOpen?: boolean; onCancel?: () => void }) {
  const [adding, setAdding] = useState(startOpen)
  const [name, setName] = useState('')
  const [personal, setPersonal] = useState(!hasPersonal && myMemberId != null)
  const [opening, setOpening] = useState('0')
  const [error, setError] = useState<string | null>(null)
  const me = members.find((m) => m.id === myMemberId)
  if (!adding) {
    return (
      <button type="button" className="link-button" onClick={() => { setAdding(true); setName(personal && me ? `Cartera de ${me.name}` : 'Cartera familiar') }}>
        + Añadir cartera
      </button>
    )
  }
  async function save() {
    const open = parseAmount(opening)
    if (!name.trim()) return setError('Ponle un nombre')
    if (open == null) return setError('Escribe el saldo inicial (puede ser 0)')
    try {
      await createWallet({ name, ownerMemberId: personal ? myMemberId : null, openingBalance: open })
      setAdding(false)
      onCreated()
    } catch (err) {
      setError(cashErrorText(err, 'No se pudo crear la cartera'))
    }
  }
  return (
    <div className="day-modal-group">
      <div className="chip-row" role="group" aria-label="Tipo de cartera">
        <button type="button" className={personal ? 'chip chip-active' : 'chip'} disabled={myMemberId == null || hasPersonal} onClick={() => { setPersonal(true); setName(`Cartera de ${me?.name ?? ''}`.trim()) }}>
          Personal
        </button>
        <button type="button" className={!personal ? 'chip chip-active' : 'chip'} onClick={() => { setPersonal(false); setName('Cartera familiar') }}>
          Familiar
        </button>
      </div>
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" />
      <label>
        Saldo inicial (€)
        <input type="number" step="0.01" value={opening} onChange={(e) => setOpening(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button type="button" onClick={save}>
          Crear cartera
        </button>
        <button type="button" className="link-button" onClick={() => { setAdding(false); onCancel?.() }}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

type WalletAction = 'in' | 'out' | 'adjust' | 'transfer' | 'bank' | null

/**
 * Las cinco herramientas del efectivo sobre la cartera elegida. Los movimientos de la cartera NO se repiten aquí: salen en el listado de Movimientos.
 * Cada operación pasa por las mismas funciones y validaciones de siempre (permisos, aviso de saldo, trazabilidad).
 */
export function WalletTools({ wallet, wallets, myMemberId, bankExpenses, onChanged, linkedExpenseIds }: { wallet: CashWallet; wallets: CashWallet[]; myMemberId: string | null; bankExpenses: readonly Expense[]; onChanged: () => void; linkedExpenseIds: ReadonlySet<string> }) {
  const [action, setAction] = useState<WalletAction>(null)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [target, setTarget] = useState('')
  const [bankId, setBankId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const writable = wallet.ownerMemberId == null || wallet.ownerMemberId === myMemberId

  const others = wallets.filter((w) => w.id !== wallet.id)
  const bankCandidates = bankExpenses.filter((e) => (e.source === 'banco' || e.source === 'ticket_banco') && e.kind === 'real' && !linkedExpenseIds.has(e.id)).slice(0, 40)

  async function run(fn: () => Promise<void>) {
    setError(null)
    try {
      await fn()
      setAction(null)
      setAmount('')
      setNote('')
      setBankId('')
      setRenaming(null)
      onChanged()
    } catch (err) {
      setError(cashErrorText(err, 'No se pudo guardar'))
    }
  }

  function submit() {
    if (action === 'in' || action === 'out' || action === 'adjust') {
      const r = movementDelta({ kind: action, amount }, wallet.balance)
      if ('error' in r) return setError(r.error)
      void run(() => addMovement({ walletId: wallet.id, kind: action, delta: r.delta, note, date: today() }))
    } else if (action === 'transfer') {
      const v = parseAmount(amount)
      if (v == null || v <= 0) return setError('Escribe el importe del traspaso')
      if (!target) return setError('Elige la cartera de destino')
      void run(() => transferCash({ from: wallet.id, to: target, amount: v, date: today(), note }))
    } else if (action === 'bank') {
      if (!bankId) return setError('Elige el movimiento del banco')
      void run(() => linkBankExpenseToWallet(wallet.id, bankId))
    }
  }

  return (
    <div className="day-modal-group" style={{ marginTop: 6 }} data-help-id="finance.cash-tools">
      <h3 className="section-title" style={{ margin: '0 0 4px' }}>
        Operaciones de efectivo
      </h3>
      {writable ? (
        <div className="chip-row" role="group" aria-label="Operaciones de la cartera">
          {([['in', '＋ Entrada'], ['out', '− Salida'], ['adjust', '⚖️ Ajustar saldo'], ['transfer', '⇄ Traspaso'], ['bank', '🏦 Retirada del banco']] as const).map(([k, label]) => (
            <button key={k} type="button" className={action === k ? 'chip chip-active' : 'chip'} onClick={() => { setAction(action === k ? null : k); setError(null) }}>
              {label}
            </button>
          ))}
        </div>
      ) : (
        <p className="muted">Cartera de otra persona: solo puedes verla.</p>
      )}
      {action && action !== 'bank' && (
        <>
          <label>
            {action === 'adjust' ? 'Saldo que debería haber (€)' : 'Importe (€)'}
            <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          {action === 'transfer' && (
            <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Cartera de destino">
              <option value="">Elige la cartera de destino…</option>
              {others.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          )}
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (opcional)" />
          {action === 'transfer' && <p className="muted" style={{ fontSize: 12 }}>Un traspaso no es ingreso ni gasto: solo mueve el efectivo entre carteras.</p>}
        </>
      )}
      {action === 'bank' && (
        <>
          <select value={bankId} onChange={(e) => setBankId(e.target.value)} aria-label="Movimiento del banco">
            <option value="">Elige la retirada (o el ingreso de efectivo)…</option>
            {bankCandidates.map((e) => (
              <option key={e.id} value={e.id}>
                {shortDate(e.expenseDate)} · {eur(e.amount)} · {e.isIncome ? 'ingreso' : 'cargo'} {e.store ?? e.notes ?? ''}
              </option>
            ))}
          </select>
          <p className="muted" style={{ fontSize: 12 }}>Ese movimiento pasa a «Movimientos internos»: deja de contar como gasto o ingreso y mueve el saldo de esta cartera.</p>
        </>
      )}
      {error && <p className="error">{error}</p>}
      {action && (
        <div className="form-actions">
          <button type="button" onClick={submit}>
            Guardar
          </button>
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
      {writable && renaming == null && (
        <button type="button" className="link-button" onClick={() => setRenaming(wallet.name)}>
          ✏️ Cambiar nombre
        </button>
      )}
      {writable && renaming != null && (
        <div className="inline-fields">
          <input type="text" value={renaming} onChange={(e) => setRenaming(e.target.value)} aria-label="Nombre de la cartera" />
          <button type="button" onClick={() => void run(() => renameWallet(wallet.id, renaming))}>
            Guardar nombre
          </button>
          <button type="button" className="link-button" onClick={() => setRenaming(null)}>
            Cancelar
          </button>
        </div>
      )}
      {writable && wallet.ownerMemberId != null && (
        <button type="button" className="link-button" onClick={() => void run(() => archiveWallet(wallet.id))}>Archivar cartera</button>
      )}
      </div>
    </div>
  )
}

// ─── Retiradas de efectivo del banco por asignar ───
// El banco trae «REINTEGRO CAJERO…». No es un gasto: se clasifica como «Retirada de efectivo» (Movimientos internos) y, si la persona lo confirma, entra en una o
// varias carteras. Si ya había apuntado esa entrada a mano, el cargo se vincula a ELLA (sin segunda entrada). Nada entra en una cartera sin confirmación,
// salvo ese caso seguro y único. El movimiento bancario original no se modifica nunca.

export function WithdrawalsToAssign({
  withdrawals,
  movements,
  wallets,
  myMemberId,
  onChanged,
  onNotice,
}: {
  withdrawals: readonly WithdrawalCandidate[]
  movements: readonly CashMovement[]
  wallets: readonly CashWallet[]
  myMemberId: string | null
  onChanged: () => void
  /** Aviso con las entradas vinculadas solas (para que se vea qué ha pasado; se puede deshacer desde la fila del movimiento). */
  onNotice?: (text: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [choice, setChoice] = useState<Record<string, string>>({})
  const [split, setSplit] = useState<Record<string, Record<string, string>>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [autoFailed, setAutoFailed] = useState<ReadonlySet<string>>(new Set())
  const attempted = useRef<Set<string>>(new Set())
  const usable = useMemo(() => usableWallets(wallets, myMemberId), [wallets, myMemberId])
  const plan = useMemo(() => planAdoptions(withdrawals, movements), [withdrawals, movements])

  // Coincidencia segura y única con una entrada ya apuntada: se vincula sola (una vez por pareja).
  useEffect(() => {
    const todo = plan.auto.filter((p) => !attempted.current.has(p.withdrawal.expense.id + p.entry.id))
    if (todo.length === 0) return
    for (const p of todo) attempted.current.add(p.withdrawal.expense.id + p.entry.id)
    void (async () => {
      let done = 0
      const failed = new Set<string>()
      for (const p of todo) {
        try {
          await adoptEntryAsWithdrawal(p.withdrawal.expense.id, p.entry.id)
          done += 1
        } catch {
          failed.add(p.withdrawal.expense.id)
        }
      }
      if (failed.size > 0) setAutoFailed((prev) => new Set([...prev, ...failed]))
      if (done > 0) {
        onNotice?.(done === 1 ? 'Una retirada del banco se ha vinculado a la entrada de efectivo que ya habías apuntado (sin crear otra entrada).' : `${done} retiradas del banco se han vinculado a entradas de efectivo que ya habías apuntado (sin crear otras).`)
        onChanged()
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan])

  const autoIds = new Set(plan.auto.filter((p) => !autoFailed.has(p.withdrawal.expense.id)).map((p) => p.withdrawal.expense.id))
  const visible = withdrawals.filter((w) => !autoIds.has(w.expense.id))
  if (visible.length === 0) return null

  async function run(id: string, fn: () => Promise<unknown>) {
    setError(null)
    setBusy(id)
    try {
      await fn()
      onChanged()
    } catch (err) {
      setError(cashErrorText(err, 'No se pudo asignar la retirada'))
    } finally {
      setBusy(null)
    }
  }

  function confirm(w: WithdrawalCandidate) {
    const id = w.expense.id
    const pick = choice[id] ?? ''
    if (pick === 'none') return void run(id, () => assignWithdrawal(id, []))
    if (pick === 'split') {
      const check = checkWithdrawalSplit(w.expense.amount, usable.map((u) => ({ walletId: u.id, amount: split[id]?.[u.id] ?? '' })))
      if (!check.ok) return setError(check.error)
      return void run(id, () => assignWithdrawal(id, check.parts))
    }
    if (pick) return void run(id, () => assignWithdrawal(id, [{ walletId: pick, amount: w.expense.amount }]))
    setError('Elige una cartera, «Repartir entre varias» o «Sin cartera».')
  }

  return (
    <div style={{ margin: '8px 0' }} data-help-id="finance.cash-withdrawals">
      <button type="button" className="link-button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        🏧 {visible.length} {visible.length === 1 ? 'retirada de efectivo por asignar' : 'retiradas de efectivo por asignar'} {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="card" style={{ marginTop: 6 }}>
          <p className="muted" style={{ marginTop: 0 }}>
            Una retirada del cajero no es un gasto: pasa a «Retirada de efectivo» (Movimientos internos). Nada entra en una cartera sin tu confirmación.
          </p>
          {visible.map((w) => {
            const id = w.expense.id
            const entries = plan.suggest.find((s) => s.withdrawal.expense.id === id)?.entries ?? []
            const pick = choice[id] ?? ''
            const check = pick === 'split' ? checkWithdrawalSplit(w.expense.amount, usable.map((u) => ({ walletId: u.id, amount: split[id]?.[u.id] ?? '' }))) : null
            return (
              <div key={id} className="receipt-line-card">
                <p style={{ margin: 0 }}>
                  {shortDate(w.expense.expenseDate)} · <strong>{eur(w.expense.amount)}</strong> · {w.label}
                </p>
                {entries.map((m) => (
                  <p key={m.id} className="muted" style={{ margin: '4px 0' }}>
                    ¿Es esta entrada que ya apuntaste ({shortDate(m.occurredOn)} · {eur(m.amount)} · {wallets.find((x) => x.id === m.walletId)?.name ?? 'cartera'})?{' '}
                    <button type="button" className="link-button" disabled={busy === id} onClick={() => void run(id, () => adoptEntryAsWithdrawal(id, m.id))}>
                      Sí, es esa
                    </button>
                  </p>
                ))}
                <select value={pick} onChange={(e) => setChoice((c) => ({ ...c, [id]: e.target.value }))} aria-label={`Cartera de la retirada de ${eur(w.expense.amount)}`}>
                  <option value="">¿A qué cartera entra?…</option>
                  {usable.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                  {usable.length > 1 && <option value="split">Repartir entre varias carteras…</option>}
                  <option value="none">Sin cartera (solo clasificar)</option>
                </select>
                {pick === 'split' && (
                  <div style={{ marginTop: 6 }}>
                    {usable.map((u) => (
                      <label key={u.id} style={{ display: 'block' }}>
                        {u.name} (€)
                        <input type="text" inputMode="decimal" value={split[id]?.[u.id] ?? ''} onChange={(e) => setSplit((s) => ({ ...s, [id]: { ...(s[id] ?? {}), [u.id]: e.target.value } }))} />
                      </label>
                    ))}
                    <p className="muted" style={{ fontSize: 12, margin: '4px 0' }}>
                      Sin asignar: {eur(check ? check.unassigned : w.expense.amount)} (queda como efectivo sin cartera)
                    </p>
                  </div>
                )}
                <div className="form-actions" style={{ marginTop: 6 }}>
                  <button type="button" disabled={busy === id} onClick={() => confirm(w)}>
                    {busy === id ? 'Guardando…' : 'Confirmar retirada'}
                  </button>
                </div>
              </div>
            )
          })}
          {error && <p className="error">{error}</p>}
        </div>
      )}
    </div>
  )
}

// ─── Posibles duplicados / pagos por vincular ───
// Solo se avisa de lo que de verdad necesita a una persona. Una coincidencia SEGURA y ÚNICA entre una compra y su cargo del banco se vincula sola
// (planBankLinks); aquí quedan las dudosas (fecha distinta, comercio desconocido, varias posibles) y los posibles duplicados entre dos apuntes propios.

/** Máximo de vinculaciones automáticas por apertura de la pantalla (el resto, en la siguiente: nunca una avalancha de cambios de golpe). */
export const AUTO_LINK_BATCH = 25

const DOUBT_TEXT: Record<NonNullable<BankLinkPair['doubt']>, string> = {
  varias_coincidencias: 'Hay varias coincidencias posibles: elige la correcta (no se vincula sola).',
  fecha: 'La fecha no es la misma: confirma que es el mismo pago.',
  comercio_desconocido: 'Falta el comercio en uno de los dos: confirma que es el mismo pago.',
}

export function PurchaseDuplicatesPanel({
  expenses,
  purchaseExpenseIds,
  cashLinkedExpenseIds,
  onChanged,
  onLogged,
  onAutoLinked,
  autoLink = true,
}: {
  expenses: readonly Expense[]
  purchaseExpenseIds: ReadonlySet<string>
  cashLinkedExpenseIds: ReadonlySet<string>
  onChanged: () => void
  /** Se llama con el id de la anotación cuando una acción se puede deshacer (vincular con el banco, retirar un duplicado). */
  onLogged?: (logId: string, text: string) => void
  /** Se llama con las anotaciones de las compras vinculadas SOLAS (coincidencia segura y única), para poder deshacerlas todas. */
  onAutoLinked?: (logIds: string[]) => void
  /** false = ni siquiera las coincidencias seguras se vinculan solas (solo se sugieren). */
  autoLink?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState<[string, string][]>([])
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [autoFailed, setAutoFailed] = useState<ReadonlySet<string>>(new Set())
  const attempted = useRef<Set<string>>(new Set())

  useEffect(() => {
    listDuplicateDecisions().then((d) => {
      setDismissed(d)
      setLoaded(true)
    })
  }, [])

  const dup: DupExpense[] = useMemo(
    () =>
      expenses
        .filter((e) => e.kind === 'real')
        .map((e) => ({
          id: e.id,
          expenseDate: e.expenseDate,
          amount: e.amount,
          store: e.store,
          source: e.source,
          isIncome: e.isIncome,
          paymentMethod: e.paymentMethod ?? null,
          hasPurchase: purchaseExpenseIds.has(e.id),
          hasCashLink: cashLinkedExpenseIds.has(e.id),
        })),
    [expenses, purchaseExpenseIds, cashLinkedExpenseIds],
  )
  const plan = useMemo(() => (loaded ? planBankLinks(dup, dismissed) : { auto: [], confirm: [] }), [dup, dismissed, loaded])
  const duplicates = useMemo(() => (loaded ? findDuplicateSuggestions(dup, dismissed).filter((s) => s.kind === 'duplicate') : []), [dup, dismissed, loaded])

  // Vinculación automática de las coincidencias seguras y únicas (una vez por pareja y por apertura).
  useEffect(() => {
    if (!loaded || !autoLink) return
    const todo = plan.auto.filter((p) => !attempted.current.has(p.own.id + p.bank.id)).slice(0, AUTO_LINK_BATCH)
    if (todo.length === 0) return
    for (const p of todo) attempted.current.add(p.own.id + p.bank.id)
    void (async () => {
      const logIds: string[] = []
      const failed = new Set<string>()
      for (const p of todo) {
        try {
          logIds.push(await linkPurchaseToBank(p.own.id, p.bank.id))
        } catch {
          failed.add(p.own.id + p.bank.id)
        }
      }
      if (failed.size > 0) setAutoFailed((prev) => new Set([...prev, ...failed]))
      if (logIds.length > 0) {
        onAutoLinked?.(logIds)
        onChanged()
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, loaded, autoLink])

  // Mientras la vinculación automática está en marcha (o si no se pudo) lo seguro no se enseña como pendiente; si falla, se ofrece a mano.
  const pendingAuto = autoLink ? plan.auto.filter((p) => autoFailed.has(p.own.id + p.bank.id)) : plan.auto
  const links = [...plan.confirm, ...pendingAuto]
  const total = links.length + duplicates.length
  if (total === 0) return null

  async function act(fn: () => Promise<void>) {
    setError(null)
    try {
      await fn()
      onChanged()
    } catch (err) {
      setError(cashErrorText(err, 'No se pudo completar'))
    }
  }

  const line = (e: DupExpense) => `${shortDate(e.expenseDate)} · ${eur(e.amount)} · ${e.store ?? 'sin comercio'}`

  return (
    <div style={{ margin: '8px 0' }}>
      <button type="button" className="link-button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        🔎 {total} {total === 1 ? 'posible duplicado o pago por vincular' : 'posibles duplicados o pagos por vincular'} {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="card" style={{ marginTop: 6 }}>
          <p className="muted" style={{ marginTop: 0 }}>Lo seguro se vincula solo. Aquí solo quedan los casos dudosos: tú decides.</p>
          {links.map((p) => (
            <div key={p.own.id + p.bank.id} className="receipt-line-card">
              <p style={{ margin: 0 }}>🏦 ¿Es el pago bancario de esta compra?</p>
              <p className="muted" style={{ margin: '2px 0' }}>Compra: {line(p.own)}</p>
              <p className="muted" style={{ margin: '2px 0' }}>Banco: {line(p.bank)}</p>
              <p className="muted" style={{ margin: '2px 0', fontSize: 12 }}>Coinciden: {p.reasons.join(', ')}</p>
              {p.doubt && <p className="muted" style={{ margin: '2px 0', fontSize: 12 }}>{DOUBT_TEXT[p.doubt]}</p>}
              <button type="button" className="link-button" onClick={() => void act(async () => onLogged?.(await linkPurchaseToBank(p.own.id, p.bank.id), 'Vinculado con el banco: un solo gasto.'))}>
                Sí, vincular (un solo gasto)
              </button>{' '}
              <button type="button" className="link-button" onClick={() => void act(async () => { await dismissDuplicate(p.own.id, p.bank.id); setDismissed((d) => [...d, [p.own.id, p.bank.id]]) })}>
                No, son distintas
              </button>
            </div>
          ))}
          {duplicates.map((s: DuplicateSuggestion) => (
            <div key={s.a.id + s.b.id} className="receipt-line-card">
              <p style={{ margin: 0 }}>⚠️ ¿La misma compra apuntada dos veces?</p>
              <p className="muted" style={{ margin: '2px 0' }}>Se conserva: {line(s.a)}</p>
              <p className="muted" style={{ margin: '2px 0' }}>Sobraría: {line(s.b)}</p>
              <p className="muted" style={{ margin: '2px 0', fontSize: 12 }}>Coinciden: {s.reasons.join(', ')}</p>
              <button type="button" className="link-button" onClick={() => { if (window.confirm('¿Quitar el apunte que sobra? La compra que se conserva no cambia.')) void act(async () => onLogged?.(await removeDuplicateExpense(s.a.id, s.b.id), 'Duplicado retirado.')) }}>
                Sí, quitar el que sobra
              </button>{' '}
              <button type="button" className="link-button" onClick={() => void act(async () => { await dismissDuplicate(s.a.id, s.b.id); setDismissed((d) => [...d, [s.a.id, s.b.id]]) })}>
                No, son distintas
              </button>
            </div>
          ))}
          {error && <p className="error">{error}</p>}
        </div>
      )}
    </div>
  )
}

export { usableWallets }
export type { PaymentLeg }
