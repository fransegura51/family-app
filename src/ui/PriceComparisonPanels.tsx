import { useCallback, useEffect, useMemo, useState } from 'react'
import { clearFamilyDecision, listFamilyDecisions, loadSharedEquivalences, setFamilyDecision } from '@/data/productEquivalences'
import { assignToCommon, createCommonProduct, listCommonProductsData, type CommonProductsData } from '@/data/commonProducts'
import { listAllProductPrices, listProducts, setPriceLinePack } from '@/data/products'
import { errorMessage } from '@/domain/errorMessage'
import { productSignature } from '@/domain/productIdentity'
import { describePack, type PackFormat } from '@/domain/packFormat'
import { toCmpPrice, toCmpProduct } from '@/domain/priceComparisonAdapters'
import { applyPick, CommonPickerSheet } from '@/ui/CompareScreen'
import { PackEditor } from '@/ui/PackFormatsPanel'
import {
  buildCompactComparisons,
  compareShoppingList,
  equivalentGroup,
  productPriceView,
  relationBetween,
  type CmpProduct,
  type CompactComparison,
  type DecisionRelation,
  type FamilyDecision,
  type GroupScope,
  type RelationContext,
  NO_STORE,
  type SharedEquivalence,
} from '@/domain/priceComparison'
import { basisLabel, normalizePrice } from '@/domain/productSize'
import type { Product, ProductPrice, Receipt, ShoppingItem } from '@/domain/types'

// Comparador inteligente de precios (Compras): ficha del producto y lista de la compra.
// Todo sale de las compras de ESTA familia; las equivalencias compartidas solo aportan nombres, nunca precios.
// Los precios son HISTÓRICOS (lo que se pagó), no ofertas vigentes.

const eur = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
const shortDate = (d: string) => {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

export { toCmpPrice, toCmpProduct }

/** Decisiones de la familia + equivalencias compartidas para un conjunto de productos (con recarga tras corregir). */
function useEquivalenceContext(products: readonly CmpProduct[], focusName?: string) {
  const [decisions, setDecisions] = useState<FamilyDecision[]>([])
  const [shared, setShared] = useState<SharedEquivalence[]>([])
  const [commonsData, setCommonsData] = useState<CommonProductsData>({ commons: [], members: [], skipped: [], rejected: [], available: false })
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
    // Los productos comunes de la familia también cuentan: dos artículos del mismo grupo son comparables.
    listCommonProductsData().then((c) => !cancelled && setCommonsData(c))
    return () => {
      cancelled = true
    }
    // names cambia solo cuando cambia su contenido (namesKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesKey, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  const ctx = useMemo<RelationContext>(() => ({ decisions, shared, commonOf: new Map(commonsData.members.map((m) => [m.productId, m.commonId])) }), [decisions, shared, commonsData])
  return { ctx, reload, commonsData }
}

// ─── Ficha del producto ───

export function ProductPriceComparison({
  productId,
  products,
  prices,
  onPackSaved,
  receipts,
  onViewPurchase,
  initialScope = 'identical',
  onScopeChange,
}: {
  productId: string
  products: readonly Product[]
  prices: readonly ProductPrice[]
  onPackSaved?: () => void
  /** COR-04C: tickets/compras de la familia, para saber de cuál sale cada precio. Sin ellos (o sin `onViewPurchase`) no se ofrece el enlace. */
  receipts?: readonly Pick<Receipt, 'id' | 'storagePath'>[]
  onViewPurchase?: (receiptId: string) => void
  /** COR-04F: alcance con el que se abre la ficha («Solo el mismo» / «+ Equivalentes») y aviso al cambiarlo, para poder volver a ella tal cual estaba. */
  initialScope?: GroupScope
  onScopeChange?: (scope: GroupScope) => void
}) {
  const cmpProducts = useMemo(() => products.map(toCmpProduct), [products])
  const target = cmpProducts.find((p) => p.id === productId)
  const { ctx, reload, commonsData } = useEquivalenceContext(cmpProducts, target?.displayName)
  const [pickingCommon, setPickingCommon] = useState(false)
  // COR-04D: la ficha de un producto enseña SU historial. Los equivalentes se comparan a petición («+ Equivalentes»), cada uno identificado por su nombre.
  const [scope, setScopeState] = useState<GroupScope>(initialScope)
  const setScope = (next: GroupScope) => {
    setScopeState(next)
    onScopeChange?.(next)
  }
  const [openStore, setOpenStore] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fixingPrice, setFixingPrice] = useState<string | null>(null)

  const group = useMemo(() => (target ? equivalentGroup(target, cmpProducts, ctx, scope) : { members: [], suggestions: [], confirmed: [] }), [target, cmpProducts, ctx, scope])
  const memberIds = useMemo(() => new Set(group.members.map((m) => m.product.id)), [group])
  const view = useMemo(
    () => productPriceView(group.members.map((m) => m.product), prices.filter((p) => memberIds.has(p.productId)).map(toCmpPrice)),
    [group, prices, memberIds],
  )
  if (!target) return null

  async function savePack(priceId: string, pack: PackFormat) {
    setError(null)
    try {
      await setPriceLinePack(priceId, pack)
      setFixingPrice(null)
      onPackSaved?.()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar el formato'))
    }
  }

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
  const nameOfMember = new Map(group.members.map((m) => [m.product.id, m.product.displayName]))
  // COR-04D: las solicitudes de formato y el formato guardado son SOLO de este producto (cada una, de su registro de compra exacto), aunque se comparen equivalentes.
  const ownPrices = prices.filter((p) => p.productId === productId)
  const unformatted = ownPrices
    .filter((p) => normalizePrice(toCmpPrice(p), nameOfMember.get(p.productId) ?? target.displayName).exact === false)
    .sort((a, b) => b.recordedDate.localeCompare(a.recordedDate))
    .slice(0, 5)
  const formatted = ownPrices.filter((p) => p.pack != null)
  // COR-04C: enlace a la compra original de cada registro, por identificador. «Ver ticket» si tiene foto/ticket, «Ver compra» si es una compra sin ticket; sin referencia válida, nada.
  const receiptOfPrice = new Map(prices.map((p) => [p.id, p.receiptId] as const))
  const receiptById = new Map((receipts ?? []).map((r) => [r.id, r] as const))
  const purchaseLink = (priceId: string | undefined) => {
    if (!onViewPurchase || !priceId) return null
    const rid = receiptOfPrice.get(priceId)
    const r = rid ? receiptById.get(rid) : undefined
    if (!r) return null
    return (
      <button type="button" className="link-button" style={{ fontSize: 13, padding: '0 0 0 6px' }} onClick={() => onViewPurchase(r.id)}>
        {r.storagePath ? 'Ver ticket' : 'Ver compra'}
      </button>
    )
  }
  const myCommonId = commonsData.members.find((m) => m.productId === productId)?.commonId
  const commonName = commonsData.commons.find((c) => c.id === myCommonId)?.name ?? null
  const hasAnyPrices = prices.some((p) => memberIds.has(p.productId))
  if (!hasAnyPrices && group.suggestions.length === 0) return null

  return (
    <div className="day-modal-group" data-help-id="shopping.price-compare" style={{ marginTop: 12 }}>
      <h3 className="section-title" style={{ margin: '0 0 6px' }}>
        Precio por tienda
      </h3>
      {commonsData.available && (
        <p className="muted" data-help-id="shopping.product-common" style={{ margin: '0 0 6px', fontSize: 13 }}>
          Producto común: <strong>{commonName ?? 'ninguno'}</strong>{' '}
          <button type="button" className="link-button" style={{ fontSize: 13, padding: 0 }} onClick={() => setPickingCommon(true)}>
            {commonName ? 'Cambiar' : 'Agrupar'}
          </button>
        </p>
      )}
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
            {scope === 'equivalent' && <span className="muted"> · {row.last.productName}</span>}
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
                {purchaseLink(h.priceId)}
              </p>
            ))}
        </div>
      ))}
      {view.rows.length > 0 && view.cheapestStore == null && <p className="muted">Solo hay precios de una tienda: todavía no se puede comparar.</p>}
      {view.note && view.rows.length > 0 && <p className="muted">{view.note}</p>}
      {unformatted.length > 0 && (
        <div data-help-id="shopping.price-unformatted">
          <p className="muted" style={{ margin: '8px 0 2px' }}>
            Compras sin formato conocido (no se pueden comparar). Si sabes cuánto contenía el envase, indícalo y se incluirá:
          </p>
          {unformatted.map((p) => (
            <div key={p.id} className="receipt-line-card">
              <span>
                {shortDate(p.recordedDate)} · {p.store ?? NO_STORE} · {eur(p.price)}
              </span>
              {purchaseLink(p.id)}{' '}
              {fixingPrice === p.id ? (
                <PackEditor price={p.price} onSave={(pack) => void savePack(p.id, pack)} onCancel={() => setFixingPrice(null)} />
              ) : (
                <button type="button" className="link-button" onClick={() => setFixingPrice(p.id)}>
                  Indicar formato
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {formatted.length > 0 && (
        <p className="muted" style={{ fontSize: 12, margin: '4px 0' }}>
          Formato guardado en {formatted.length} {formatted.length === 1 ? 'compra' : 'compras'}: {describePack(formatted[0].pack as PackFormat)}
          {formatted.length > 1 ? ' y otros' : ''}.
        </p>
      )}
      <p className="muted" style={{ fontSize: 12 }}>
        Son precios que habéis pagado vosotros, no ofertas de hoy.
      </p>

      {/* COR-04E: con «+ Equivalentes» se ven los precios REGISTRADOS de cada equivalente (con su nombre y su precio original), aunque todavía no tengan un formato conocido para calcular
          un precio normalizado. Son solo de lectura: «Indicar formato» y el resto de su historial se hacen en la ficha de CADA producto, así que nada se mezcla. */}
      {scope === 'equivalent' && others.length > 0 && (
        <div data-help-id="shopping.price-equivalent-records">
          <p className="muted" style={{ margin: '8px 0 2px' }}>
            Precios registrados de los equivalentes:
          </p>
          {others.map((m) => {
            const recs = prices
              .filter((p) => p.productId === m.product.id)
              .sort((a, b) => b.recordedDate.localeCompare(a.recordedDate))
              .slice(0, 5)
            if (recs.length === 0) return null
            return (
              <div key={m.product.id} className="receipt-line-card" data-product-id={m.product.id}>
                <strong style={{ fontSize: 13 }}>{m.product.displayName}</strong>
                {recs.map((p) => (
                  <p key={p.id} className="muted receipt-row-detail-line" style={{ margin: '2px 0' }}>
                    {shortDate(p.recordedDate)} · {p.store ?? NO_STORE} · {eur(p.price)}
                    {p.unit === 'kg' ? '/kg' : '/ud'}
                    {purchaseLink(p.id)}
                  </p>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {/* Equivalencias ya CONFIRMADAS (decisión de la familia o mismo producto común): se ven en cualquier alcance, no vuelven a preguntarse y se pueden retirar. */}
      {group.confirmed.length > 0 && (
        <div data-help-id="shopping.price-confirmed">
          <p className="muted" style={{ margin: '8px 0 2px' }}>
            Equivalencias confirmadas:
          </p>
          {group.confirmed.map((m) => (
            <p key={m.product.id} className="muted" style={{ margin: '2px 0' }}>
              {m.product.displayName} {m.link.source === 'common' ? '(mismo producto común)' : '(equivalente)'}{' '}
              {m.link.source === 'family' && (
                <button type="button" className="link-button" onClick={() => void decide(m.product.id, 'different')}>
                  Retirar equivalencia
                </button>
              )}
            </p>
          ))}
        </div>
      )}

      {others.filter((m) => !group.confirmed.some((c) => c.product.id === m.product.id)).length > 0 && scope === 'equivalent' && (
        <div>
          <p className="muted" style={{ margin: '8px 0 2px' }}>
            Se comparan también con:
          </p>
          {others
            .filter((m) => !group.confirmed.some((c) => c.product.id === m.product.id))
            .map((m) => (
              <p key={m.product.id} className="muted" style={{ margin: '2px 0' }}>
                {m.product.displayName} ({m.link.relation === 'identical' ? 'el mismo' : 'equivalente'}){' '}
                <button type="button" className="link-button" onClick={() => void decide(m.product.id, 'different')}>
                  No es equivalente
                </button>
              </p>
            ))}
        </div>
      )}

      {/* Posibles equivalencias: SOLO las que siguen pendientes de decidir. */}
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
      {pickingCommon && (
        <CommonPickerSheet
          article={products.find((p) => p.id === productId) ?? products[0]}
          data={{ products: [...products], prices: [...prices], commons: commonsData.commons, members: commonsData.members, skipped: commonsData.skipped, decisions: ctx.decisions ? [...ctx.decisions] : [], shared: ctx.shared ? [...ctx.shared] : [], available: true }}
          onClose={() => setPickingCommon(false)}
          onPick={(r) => {
            setPickingCommon(false)
            void applyPick({ id: productId }, r, commonsData, { assign: assignToCommon, createCommon: createCommonProduct })
              .then(reload)
              .catch((err) => setError(errorMessage(err, 'No se pudo cambiar el producto común')))
          }}
        />
      )}
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

// ─── Comparación compacta en el listado y vista general de diferencias (COMP-2) ───

const dayMonth = (d: string) => {
  const [, m, day] = d.split('-')
  return `${day}/${m}`
}

/** La comparación compacta de todos los productos con compras, calculada una vez (reutiliza las mismas equivalencias y reglas que la ficha del producto). */
export function useCompactComparisons(products: readonly Product[], prices: readonly ProductPrice[]): ReadonlyMap<string, CompactComparison> {
  const cmpProducts = useMemo(() => products.map(toCmpProduct), [products])
  const { ctx } = useEquivalenceContext(cmpProducts)
  return useMemo(() => buildCompactComparisons(cmpProducts, prices.map(toCmpPrice), ctx), [cmpProducts, prices, ctx])
}

/** Dos líneas cortas bajo el nombre del producto: dónde fue la última compra y dónde habéis pagado menos. Precios históricos, no ofertas. */
export function CompactPriceLine({ cmp }: { cmp: CompactComparison }) {
  const unit = basisLabel(cmp.basis).replace('€', '')
  return (
    <span className="muted" style={{ display: 'block', fontSize: 12, lineHeight: 1.3, whiteSpace: 'normal' }} data-help-id="shopping.price-compact">
      {cmp.last.store} · última compra ({dayMonth(cmp.last.date)})
      <br />
      {cmp.best && cmp.pctLess != null
        ? `${cmp.best.store}: ${eur(cmp.best.value)}${unit} — ${cmp.pctLess} % menos (${dayMonth(cmp.best.date)})`
        : 'Lo más barato que habéis pagado'}
    </span>
  )
}

export { relationBetween }
