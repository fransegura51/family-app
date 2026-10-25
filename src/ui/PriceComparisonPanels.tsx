import { useCallback, useEffect, useMemo, useState } from 'react'
import { clearFamilyDecision, listFamilyDecisions, loadSharedEquivalences, setFamilyDecision } from '@/data/productEquivalences'
import { listAllProductPrices, listProducts } from '@/data/products'
import { errorMessage } from '@/domain/errorMessage'
import { productSignature } from '@/domain/productIdentity'
import {
  compareShoppingList,
  equivalentGroup,
  productPriceView,
  relationBetween,
  type CmpPrice,
  type CmpProduct,
  type DecisionRelation,
  type FamilyDecision,
  type GroupScope,
  type SharedEquivalence,
} from '@/domain/priceComparison'
import { basisLabel } from '@/domain/productSize'
import type { Product, ProductPrice, ShoppingItem } from '@/domain/types'

// Comparador inteligente de precios (Compras): ficha del producto y lista de la compra.
// Todo sale de las compras de ESTA familia; las equivalencias compartidas solo aportan nombres, nunca precios.
// Los precios son HISTÓRICOS (lo que se pagó), no ofertas vigentes.

const eur = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
const shortDate = (d: string) => {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

export function toCmpProduct(p: Product): CmpProduct {
  return { id: p.id, displayName: p.displayName, brand: p.brand, classKey: p.classConfirmedAt ? p.category : null }
}
export function toCmpPrice(p: ProductPrice): CmpPrice {
  return { productId: p.productId, price: p.price, store: p.store, unit: p.unit, recordedDate: p.recordedDate }
}

/** Decisiones de la familia + equivalencias compartidas para un conjunto de productos (con recarga tras corregir). */
function useEquivalenceContext(products: readonly CmpProduct[], focusName?: string) {
  const [decisions, setDecisions] = useState<FamilyDecision[]>([])
  const [shared, setShared] = useState<SharedEquivalence[]>([])
  const [version, setVersion] = useState(0)

  const names = useMemo(() => {
    if (!focusName) return products.slice(0, 100).map((p) => p.displayName)
    // Solo los nombres que comparten alguna palabra con el producto en foco (el servidor admite 100 por consulta).
    const core = new Set(productSignature(focusName).core)
    const related = products.filter((p) => productSignature(p.displayName, p.brand).core.some((w) => core.has(w)))
    return [focusName, ...related.map((p) => p.displayName)].slice(0, 100)
  }, [products, focusName])

  const namesKey = names.join('|')
  useEffect(() => {
    let cancelled = false
    listFamilyDecisions().then((d) => !cancelled && setDecisions(d))
    loadSharedEquivalences(names).then((s) => !cancelled && setShared(s))
    return () => {
      cancelled = true
    }
    // names cambia solo cuando cambia su contenido (namesKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesKey, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { ctx: { decisions, shared }, reload }
}

// ─── Ficha del producto ───

export function ProductPriceComparison({ productId, products, prices }: { productId: string; products: readonly Product[]; prices: readonly ProductPrice[] }) {
  const cmpProducts = useMemo(() => products.map(toCmpProduct), [products])
  const target = cmpProducts.find((p) => p.id === productId)
  const { ctx, reload } = useEquivalenceContext(cmpProducts, target?.displayName)
  const [scope, setScope] = useState<GroupScope>('equivalent')
  const [openStore, setOpenStore] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const group = useMemo(() => (target ? equivalentGroup(target, cmpProducts, ctx, scope) : { members: [], suggestions: [] }), [target, cmpProducts, ctx, scope])
  const memberIds = useMemo(() => new Set(group.members.map((m) => m.product.id)), [group])
  const view = useMemo(
    () => productPriceView(group.members.map((m) => m.product), prices.filter((p) => memberIds.has(p.productId)).map(toCmpPrice)),
    [group, prices, memberIds],
  )
  if (!target) return null

  async function decide(otherId: string, relation: DecisionRelation | null) {
    setError(null)
    try {
      if (relation == null) await clearFamilyDecision(productId, otherId)
      else await setFamilyDecision(productId, otherId, relation)
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    }
  }

  const others = group.members.filter((m) => m.product.id !== productId)
  const hasAnyPrices = prices.some((p) => memberIds.has(p.productId))
  if (!hasAnyPrices && group.suggestions.length === 0) return null

  return (
    <div className="day-modal-group" data-help-id="shopping.price-compare" style={{ marginTop: 12 }}>
      <h3 className="section-title" style={{ margin: '0 0 6px' }}>
        Precio por tienda
      </h3>
      <div className="chip-row" role="group" aria-label="Qué productos comparar" data-help-id="shopping.price-scope">
        <button type="button" className={scope === 'identical' ? 'chip chip-active' : 'chip'} aria-pressed={scope === 'identical'} onClick={() => setScope('identical')}>
          Solo el mismo
        </button>
        <button type="button" className={scope === 'equivalent' ? 'chip chip-active' : 'chip'} aria-pressed={scope === 'equivalent'} onClick={() => setScope('equivalent')}>
          + Equivalentes
        </button>
      </div>

      {view.rows.length === 0 && <p className="muted">{view.note}</p>}
      {view.rows.map((row) => (
        <div key={row.store} className="receipt-line-card">
          <button type="button" className="receipt-row-summary" style={{ width: '100%', textAlign: 'left' }} onClick={() => setOpenStore(openStore === row.store ? null : row.store)}>
            <strong>{row.store}</strong>
            {view.cheapestStore === row.store && <span> · 🏷️ más barato</span>}
            <br />
            <span>
              {eur(row.last.price.value)} {basisLabel(row.last.price.basis).replace('€', '')}
            </span>
            <span className="muted">
              {' '}
              · {shortDate(row.last.date)}
              {row.last.price.packagePrice != null && row.last.price.basis !== 'envase' ? ` · envase ${eur(row.last.price.packagePrice)}` : ''}
            </span>
            {row.diffVsCheapestPct != null && row.diffVsCheapestPct > 0 && <span className="muted"> · +{String(row.diffVsCheapestPct).replace('.', ',')} % que el más barato</span>}
            {row.trendPct != null && row.trendPct !== 0 && (
              <span className="muted">
                {' '}
                · {row.trendPct > 0 ? '▲' : '▼'} {String(Math.abs(row.trendPct)).replace('.', ',')} % desde la primera compra
              </span>
            )}
          </button>
          {openStore === row.store &&
            [...row.history].reverse().map((h, i) => (
              <p key={i} className="muted receipt-row-detail-line">
                {shortDate(h.date)} · {h.productName} · {eur(h.price.value)} {basisLabel(h.price.basis).replace('€', '')}
              </p>
            ))}
        </div>
      ))}
      {view.rows.length > 0 && view.cheapestStore == null && <p className="muted">Solo hay precios de una tienda: todavía no se puede comparar.</p>}
      {view.note && view.rows.length > 0 && <p className="muted">{view.note}</p>}
      <p className="muted" style={{ fontSize: 12 }}>
        Son precios que habéis pagado vosotros, no ofertas de hoy.
      </p>

      {others.length > 0 && scope === 'equivalent' && (
        <div>
          <p className="muted" style={{ margin: '8px 0 2px' }}>
            Se comparan también con:
          </p>
          {others.map((m) => (
            <p key={m.product.id} className="muted" style={{ margin: '2px 0' }}>
              {m.product.displayName} ({m.link.relation === 'identical' ? 'el mismo' : 'equivalente'}){' '}
              <button type="button" className="link-button" onClick={() => void decide(m.product.id, 'different')}>
                No es equivalente
              </button>
            </p>
          ))}
        </div>
      )}

      {group.suggestions.length > 0 && (
        <div>
          <p className="muted" style={{ margin: '8px 0 2px' }}>
            ¿Es lo mismo?
          </p>
          {group.suggestions.slice(0, 4).map((m) => (
            <p key={m.product.id} style={{ margin: '4px 0' }}>
              {m.product.displayName}{' '}
              <button type="button" className="link-button" onClick={() => void decide(m.product.id, 'equivalent')}>
                Sí, equivalente
              </button>{' '}
              <button type="button" className="link-button" onClick={() => void decide(m.product.id, 'different')}>
                No
              </button>
            </p>
          ))}
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  )
}

// ─── Lista de la compra ───

export function ListPriceComparison({ items }: { items: readonly ShoppingItem[] }) {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState<{ products: Product[]; prices: ProductPrice[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || loaded) return
    Promise.all([listProducts(), listAllProductPrices()])
      .then(([products, prices]) => setLoaded({ products, prices }))
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar los precios')))
  }, [open, loaded])

  const cmpProducts = useMemo(() => (loaded ? loaded.products.map(toCmpProduct) : []), [loaded])
  const { ctx } = useEquivalenceContext(cmpProducts)
  const comparison = useMemo(
    () =>
      loaded
        ? compareShoppingList(
            items.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit })),
            cmpProducts,
            loaded.prices.map(toCmpPrice),
            ctx,
          )
        : null,
    [loaded, items, cmpProducts, ctx],
  )

  return (
    <div style={{ margin: '4px 0 10px' }}>
      <button type="button" className="link-button" data-help-id="shopping.compare-list" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        💶 {open ? 'Ocultar comparación de tiendas' : 'Comparar la lista entre tiendas'}
      </button>
      {open && (
        <div className="card" data-help-id="shopping.compare-panel" style={{ marginTop: 6 }}>
          {error && <p className="error">{error}</p>}
          {!comparison && !error && <p className="muted">Calculando con vuestros precios…</p>}
          {comparison && (
            <>
              {comparison.ranking.length === 0 && <p className="muted">{comparison.note}</p>}
              {comparison.ranking.map((r, i) => {
                const s = comparison.stores.find((x) => x.store === r.store)
                return (
                  <p key={r.store} style={{ margin: '4px 0' }}>
                    <strong>{r.store}</strong>: {eur(r.total)}
                    {i === 0 && comparison.ranking.length >= 2 && comparison.savingVsNext != null && comparison.savingVsNext > 0 && <span> · 🏷️ más barato (−{eur(comparison.savingVsNext)})</span>}
                    <br />
                    <span className="muted" style={{ fontSize: 12 }}>
                      {comparison.mode === 'full' ? `${comparison.itemCount} de ${comparison.itemCount}` : `${comparison.commonCount} de ${comparison.itemCount}`} artículos con precio
                      {s && s.covered !== (comparison.mode === 'full' ? comparison.itemCount : comparison.commonCount) ? ` (${s.covered} conocidos en esta tienda)` : ''}
                      {s?.newestDate ? ` · precios de ${shortDate(s.oldestDate ?? s.newestDate)}${s.oldestDate !== s.newestDate ? ` a ${shortDate(s.newestDate)}` : ''}` : ''}
                    </span>
                  </p>
                )
              })}
              {comparison.ranking.length > 0 && <p className="muted" style={{ fontSize: 12 }}>{comparison.note}</p>}
              {comparison.hasStale && <p className="muted">⚠️ Algunos precios tienen más de 2 meses: pueden haber cambiado.</p>}
              {comparison.stores.filter((s) => !comparison.ranking.some((r) => r.store === s.store)).map((s) => (
                <p key={s.store} className="muted" style={{ fontSize: 12, margin: '2px 0' }}>
                  {s.store}: solo {s.covered} de {comparison.itemCount} artículos con precio; no entra en la comparación.
                </p>
              ))}
              {comparison.items.some((i) => i.prices.length === 0) && (
                <details>
                  <summary className="muted">Artículos sin precio comparable</summary>
                  {comparison.items.filter((i) => i.prices.length === 0).map((i, idx) => (
                    <p key={idx} className="muted" style={{ margin: '2px 0', fontSize: 12 }}>
                      {i.item.name}: {i.reason}
                    </p>
                  ))}
                </details>
              )}
              <p className="muted" style={{ fontSize: 12 }}>
                Cálculo orientativo con lo que habéis pagado antes, no con ofertas de hoy. Incluye marcas equivalentes cuando el tamaño se puede comparar.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export { relationBetween }
