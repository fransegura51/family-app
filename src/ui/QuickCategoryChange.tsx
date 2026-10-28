import { useMemo, useState, type ReactNode } from 'react'
import { classifyPurchase } from '@/data/classifyPurchase'
import { reportClientError } from '@/data/errorReports'
import { confirmExpenseCategory, setExpensesCategory, updateExpense } from '@/data/finance'
import { frequentCategoryNames } from '@/domain/categorySearch'
import { CLASSIFY_FAILED_MESSAGE, classifyMessage, classifyOk } from '@/domain/classifyPurchase'
import { errorMessage } from '@/domain/errorMessage'
import { otrosReclassificationProposals, similarPastMovements, type OtrosProposal } from '@/domain/similarMovements'
import type { BudgetCategory, Expense } from '@/domain/types'
import { emitHelpEvent } from '@/help/tours/helpBus'
import { CategorySelect } from '@/ui/CategorySelect'

// ECO-CLASIF — cambiar la categoría de un movimiento TOCÁNDOLA, sin abrir el formulario largo, igual de fluido que elegir el producto de una línea del
// ticket en Compras. Reutiliza lo que ya existía: el mismo selector de categorías (ahora con buscador y sugerencias) y la misma vía de guardado
// (classify_purchase, que mantiene a la vez el gasto y su ticket vinculado). Si hay movimientos anteriores del mismo comercio en otra categoría, se
// OFRECE cambiarlos también; nunca se cambian por sí solos.

interface Args {
  /** Todos los movimientos cargados (no solo los del periodo): sirve para las categorías más usadas y para los anteriores del mismo comercio. */
  expenses: readonly Expense[]
  categories: BudgetCategory[]
  /** Recarga la lista tras un cambio. */
  onChanged: () => void
}

export function useQuickCategoryChange({ expenses, categories, onChanged }: Args): { start: (expense: Expense) => void; dialogs: ReactNode } {
  const [target, setTarget] = useState<Expense | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [offer, setOffer] = useState<{ expense: Expense; category: string; similar: Expense[] } | null>(null)
  const [busy, setBusy] = useState(false)

  const frequent = useMemo(() => {
    if (!target) return []
    const valid = new Set(categories.filter((c) => (target.isIncome ? c.budgetGroup === 'ingresos' : c.budgetGroup !== 'ingresos')).map((c) => c.name))
    return frequentCategoryNames(expenses.filter((e) => e.isIncome === target.isIncome), valid)
  }, [target, expenses, categories])

  async function apply(expense: Expense, name: string) {
    if (name === '' || name === expense.category) return
    setError(null)
    try {
      if (expense.isIncome) {
        await updateExpense(expense.id, { category: name })
      } else {
        let result
        try {
          result = await classifyPurchase({ expenseId: expense.id, category: name })
        } catch (err) {
          void reportClientError(err)
          setError(CLASSIFY_FAILED_MESSAGE)
          return
        }
        if (!classifyOk(result)) {
          setError(classifyMessage(result))
          return
        }
      }
      emitHelpEvent('finance.movement-updated') // para los tutoriales «Enséñame»: el cambio YA está guardado
      const similar = similarPastMovements(expenses, expense, name)
      if (similar.length > 0) setOffer({ expense, category: name, similar })
      else onChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo cambiar la categoría'))
    }
  }

  async function applyToSimilar() {
    if (!offer) return
    setBusy(true)
    try {
      await setExpensesCategory(offer.similar.map((e) => e.id), offer.category)
      setOffer(null)
      onChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudieron cambiar los anteriores'))
      setOffer(null)
    } finally {
      setBusy(false)
    }
  }

  const dialogs = (
    <>
      {target && (
        <CategorySelect
          open
          value={target.category ?? ''}
          categories={categories}
          flow={target.isIncome ? 'ingreso' : 'gasto'}
          suggestion={target.categorySuggestion ?? null}
          frequent={frequent}
          confirmCurrent={
            target.categorySource === 'sugerida' && target.category
              ? () => {
                  const t = target
                  void confirmExpenseCategory(t.id).then(onChanged).catch((err) => setError(errorMessage(err, 'No se pudo confirmar')))
                }
              : undefined
          }
          onChange={(name) => void apply(target, name)}
          onClose={() => setTarget(null)}
          onCreated={onChanged}
        />
      )}
      {offer && (
        <div className="modal-overlay" onClick={() => !busy && (setOffer(null), onChanged())}>
          <div className="modal-sheet" data-help-id="finance.similar-offer" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="section-title" style={{ margin: 0 }}>¿Cambiar también los anteriores?</h2>
            </div>
            <p>
              Hay {offer.similar.length} {offer.similar.length === 1 ? 'movimiento anterior' : 'movimientos anteriores'} de «{offer.expense.store ?? 'este comercio'}» en otra
              categoría. ¿Quieres pasarlos también a «{offer.category}»?
            </p>
            <p className="muted" style={{ fontSize: 13 }}>
              Solo se cambian los que importó el banco y que tú no habías decidido a mano. Los importes no se tocan.
            </p>
            <div className="form-actions">
              <button type="button" disabled={busy} onClick={applyToSimilar}>
                {busy ? 'Cambiando…' : `Sí, cambiar ${offer.similar.length === 1 ? 'el anterior' : `los ${offer.similar.length}`}`}
              </button>
              <button
                type="button"
                className="link-button"
                disabled={busy}
                onClick={() => {
                  setOffer(null)
                  onChanged()
                }}
              >
                No, solo este
              </button>
            </div>
          </div>
        </div>
      )}
      {error && !target && (
        <div className="modal-overlay" onClick={() => setError(null)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <p className="error">{error}</p>
            <button type="button" onClick={() => setError(null)}>
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  )

  return { start: (expense) => { setError(null); setTarget(expense) }, dialogs }
}

/**
 * «PEPA ya sabe clasificar N movimientos que están en “Otros”»: tarjeta discreta que ofrece revisar, con casillas marcadas por defecto, lo que el
 * clasificador ahora sitúa con fundamento. Es voluntario: nada cambia hasta pulsar «Aplicar».
 */
export function OtrosReviewCard({
  expenses,
  categories,
  memberNames,
  onChanged,
}: {
  expenses: readonly Expense[]
  categories: BudgetCategory[]
  memberNames: readonly string[]
  onChanged: () => void
}) {
  const proposals = useMemo(() => otrosReclassificationProposals(expenses, categories, memberNames), [expenses, categories, memberNames])
  const [open, setOpen] = useState(false)
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem('familyapp:otros-review-dismissed') === '1'
    } catch {
      return false
    }
  })
  if (proposals.length === 0 || dismissed) return null

  const chosen = proposals.filter((p) => !unchecked.has(p.expense.id))

  async function apply() {
    setBusy(true)
    setError(null)
    try {
      const byCategory = new Map<string, string[]>()
      for (const p of chosen) byCategory.set(p.category, [...(byCategory.get(p.category) ?? []), p.expense.id])
      for (const [category, ids] of byCategory) await setExpensesCategory(ids, category)
      emitHelpEvent('finance.movement-updated')
      setOpen(false)
      onChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo aplicar'))
    } finally {
      setBusy(false)
    }
  }

  function dismiss() {
    try {
      localStorage.setItem('familyapp:otros-review-dismissed', '1')
    } catch {
      /* sin almacenamiento: se oculta solo en esta sesión */
    }
    setDismissed(true)
  }

  return (
    <>
      <div className="card otros-review-card" data-help-id="finance.otros-review">
        <p style={{ margin: 0 }}>
          ✨ PEPA ya sabe situar <strong>{proposals.length}</strong> {proposals.length === 1 ? 'movimiento' : 'movimientos'} que están en «Otros».
        </p>
        <div className="form-actions" style={{ marginTop: 6 }}>
          <button type="button" onClick={() => setOpen(true)}>
            Revisar
          </button>
          <button type="button" className="link-button" onClick={dismiss}>
            No mostrar más
          </button>
        </div>
      </div>
      {open && (
        <div className="modal-overlay" onClick={() => !busy && setOpen(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="section-title" style={{ margin: 0 }}>Movimientos en «Otros»</h2>
              <button type="button" className="modal-close" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
              Estas son las categorías que PEPA propone. Quita la marca de los que no quieras cambiar. Los importes no se tocan.
            </p>
            <ul className="otros-review-list">
              {proposals.map((p: OtrosProposal) => (
                <li key={p.expense.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={!unchecked.has(p.expense.id)}
                      onChange={(e) => {
                        const next = new Set(unchecked)
                        if (e.target.checked) next.delete(p.expense.id)
                        else next.add(p.expense.id)
                        setUnchecked(next)
                      }}
                    />
                    <span>
                      <strong>{p.expense.store ?? 'Sin nombre'}</strong> · {p.expense.amount.toFixed(2)} €
                      <br />
                      <span className="muted">Otros → {p.category}{p.confidence === 'media' ? ' (sugerida)' : ''}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {error && <p className="error">{error}</p>}
            <div className="form-actions">
              <button type="button" disabled={busy || chosen.length === 0} onClick={apply}>
                {busy ? 'Aplicando…' : `Aplicar a ${chosen.length}`}
              </button>
              <button type="button" className="link-button" disabled={busy} onClick={() => setOpen(false)}>
                Ahora no
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
