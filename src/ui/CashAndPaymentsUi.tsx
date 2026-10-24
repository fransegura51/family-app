import { useCallback, useEffect, useMemo, useState } from 'react'
import { addMovement, archiveWallet, cashErrorText, createWallet, deleteMovement, dismissDuplicate, linkBankExpenseToWallet, linkPurchaseToBank, listDuplicateDecisions, listMovements, listWallets, registerPurchaseRefund, removeDuplicateExpense, transferCash, unlinkBankMovement } from '@/data/cash'
import { balanceText, eur, isManualMovement, MOVEMENT_LABELS, movementDelta, usableWallets, type CashMovement, type CashWallet, type ShortfallChoice, type ShortfallNotice } from '@/domain/cashWallet'
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

// ─── Carteras de efectivo (opcionales) ───

export function CashWalletsSection({ members, myMemberId, bankExpenses }: { members: readonly FamilyMember[]; myMemberId: string | null; bankExpenses: readonly Expense[] }) {
  const [open, setOpen] = useState(false)
  const [wallets, setWallets] = useState<CashWallet[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  const reload = useCallback(() => {
    listWallets()
      .then(setWallets)
      .catch((err) => setError(cashErrorText(err, 'No se pudieron cargar las carteras')))
  }, [])
  useEffect(() => {
    if (open && wallets == null) reload()
  }, [open, wallets, reload])

  const visible = (wallets ?? []).filter((w) => w.archivedAt == null)
  const active = visible.find((w) => w.id === activeId) ?? null

  return (
    <div style={{ margin: '12px 0' }}>
      <button type="button" className="link-button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        💶 Efectivo (opcional) {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="card" style={{ marginTop: 6 }}>
          <p className="muted" style={{ marginTop: 0 }}>
            Controlar el efectivo es opcional: puedes apuntar gastos en efectivo sin tener ninguna cartera. Si quieres saber cuánto llevas, crea una.
          </p>
          {error && <p className="error">{error}</p>}
          {visible.length === 0 && wallets != null && <p className="muted">Todavía no hay carteras.</p>}
          {visible.map((w) => (
            <button key={w.id} type="button" className="receipt-row-summary" style={{ width: '100%', textAlign: 'left' }} onClick={() => setActiveId(activeId === w.id ? null : w.id)}>
              <strong>{w.name}</strong> <span className="muted">· {w.ownerMemberId ? `de ${members.find((m) => m.id === w.ownerMemberId)?.name ?? 'una persona'}` : 'familiar'}</span>
              <br />
              <span className={w.balance < 0 ? 'error' : undefined}>{balanceText(w.balance)}</span>
            </button>
          ))}
          {active && <WalletDetail wallet={active} wallets={visible} myMemberId={myMemberId} bankExpenses={bankExpenses} onChanged={reload} />}
          <NewWalletForm members={members} myMemberId={myMemberId} hasPersonal={visible.some((w) => w.ownerMemberId === myMemberId)} onCreated={reload} />
        </div>
      )}
    </div>
  )
}

function NewWalletForm({ members, myMemberId, hasPersonal, onCreated }: { members: readonly FamilyMember[]; myMemberId: string | null; hasPersonal: boolean; onCreated: () => void }) {
  const [adding, setAdding] = useState(false)
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
        <button type="button" className="link-button" onClick={() => setAdding(false)}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

type WalletAction = 'in' | 'out' | 'adjust' | 'transfer' | 'bank' | null

function WalletDetail({ wallet, wallets, myMemberId, bankExpenses, onChanged }: { wallet: CashWallet; wallets: CashWallet[]; myMemberId: string | null; bankExpenses: readonly Expense[]; onChanged: () => void }) {
  const [movements, setMovements] = useState<CashMovement[]>([])
  const [action, setAction] = useState<WalletAction>(null)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [target, setTarget] = useState('')
  const [bankId, setBankId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const writable = wallet.ownerMemberId == null || wallet.ownerMemberId === myMemberId

  const load = useCallback(() => {
    listMovements(wallet.id).then(setMovements).catch(() => setMovements([]))
  }, [wallet.id])
  useEffect(load, [load, wallet.balance])

  const others = wallets.filter((w) => w.id !== wallet.id)
  const linkedBankIds = new Set(movements.map((m) => m.expenseId).filter(Boolean))
  const bankCandidates = bankExpenses.filter((e) => (e.source === 'banco' || e.source === 'ticket_banco') && e.kind === 'real' && !linkedBankIds.has(e.id)).slice(0, 40)

  async function run(fn: () => Promise<void>) {
    setError(null)
    try {
      await fn()
      setAction(null)
      setAmount('')
      setNote('')
      setBankId('')
      load()
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
    <div className="day-modal-group" style={{ marginTop: 6 }}>
      <h3 className="section-title" style={{ margin: '0 0 4px' }}>
        {wallet.name}
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
      <p className="muted" style={{ margin: '8px 0 2px' }}>Historial</p>
      {movements.length === 0 && <p className="muted">Sin movimientos todavía (saldo inicial {eur(wallet.openingBalance)}).</p>}
      {movements.map((m) => (
        <p key={m.id} className="muted receipt-row-detail-line" style={{ margin: '2px 0' }}>
          {shortDate(m.occurredOn)} · {MOVEMENT_LABELS[m.kind]} · <strong>{m.amount > 0 ? '+' : ''}{eur(m.amount)}</strong>
          {m.note ? ` · ${m.note}` : ''}{' '}
          {writable && isManualMovement(m.kind) && (
            <button type="button" className="link-button" onClick={() => void run(() => deleteMovement(m.id))} aria-label="Borrar movimiento">✕</button>
          )}
          {writable && m.expenseId && (m.kind === 'transfer_in' || m.kind === 'transfer_out') && (
            <button type="button" className="link-button" onClick={() => void run(() => unlinkBankMovement(m.id))}>Deshacer</button>
          )}
        </p>
      ))}
      {writable && wallet.ownerMemberId != null && (
        <button type="button" className="link-button" onClick={() => void run(() => archiveWallet(wallet.id))}>Archivar cartera</button>
      )}
    </div>
  )
}

// ─── Posibles duplicados / pagos por vincular ───

export function PurchaseDuplicatesPanel({
  expenses,
  purchaseExpenseIds,
  cashLinkedExpenseIds,
  onChanged,
  onLogged,
}: {
  expenses: readonly Expense[]
  purchaseExpenseIds: ReadonlySet<string>
  cashLinkedExpenseIds: ReadonlySet<string>
  onChanged: () => void
  /** Se llama con el id de la anotación cuando una acción se puede deshacer (vincular con el banco, retirar un duplicado). */
  onLogged?: (logId: string, text: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState<[string, string][]>([])
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

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
  const suggestions = useMemo(() => (loaded ? findDuplicateSuggestions(dup, dismissed) : []), [dup, dismissed, loaded])
  if (suggestions.length === 0) return null

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
        🔎 {suggestions.length} {suggestions.length === 1 ? 'posible duplicado o pago por vincular' : 'posibles duplicados o pagos por vincular'} {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="card" style={{ marginTop: 6 }}>
          <p className="muted" style={{ marginTop: 0 }}>Nada se une ni se borra solo: tú decides.</p>
          {suggestions.map((s: DuplicateSuggestion) => (
            <div key={s.a.id + s.b.id} className="receipt-line-card">
              <p style={{ margin: 0 }}>
                {s.kind === 'link_bank' ? '🏦 ¿Es el pago bancario de esta compra?' : '⚠️ ¿La misma compra apuntada dos veces?'}
              </p>
              <p className="muted" style={{ margin: '2px 0' }}>{s.kind === 'link_bank' ? 'Compra' : 'Se conserva'}: {line(s.a)}</p>
              <p className="muted" style={{ margin: '2px 0' }}>{s.kind === 'link_bank' ? 'Banco' : 'Sobraría'}: {line(s.b)}</p>
              <p className="muted" style={{ margin: '2px 0', fontSize: 12 }}>Coinciden: {s.reasons.join(', ')}</p>
              {s.kind === 'link_bank' ? (
                <button type="button" className="link-button" onClick={() => void act(async () => onLogged?.(await linkPurchaseToBank(s.a.id, s.b.id), 'Vinculado con el banco: un solo gasto.'))}>
                  Sí, vincular (un solo gasto)
                </button>
              ) : (
                <button type="button" className="link-button" onClick={() => { if (window.confirm('¿Quitar el apunte que sobra? La compra que se conserva no cambia.')) void act(async () => onLogged?.(await removeDuplicateExpense(s.a.id, s.b.id), 'Duplicado retirado.')) }}>
                  Sí, quitar el que sobra
                </button>
              )}{' '}
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
