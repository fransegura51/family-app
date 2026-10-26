// «Comparar precios» (quinta subsección de Compras): Resultados (comparaciones por producto común) y Emparejar (agrupar artículos bajo un producto común).
// Reutiliza el comparador y las equivalencias de siempre: aquí solo se agrupan los artículos que se pueden comparar entre sí, SIN tocar nombres, precios ni formatos originales.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createCommonProduct, deleteCommonProduct, assignToCommon, listCommonProductsData, renameCommonProduct, skipPairing, unassignFromCommon, unskipPairing } from '@/data/commonProducts'
import { clearFamilyDecision, listFamilyDecisions, loadSharedEquivalences, setFamilyDecision } from '@/data/productEquivalences'
import { listAllProductPrices, listProducts, setPriceLinePack } from '@/data/products'
import { commonResult, pairingQueue, resultHeadline, similarPending, suggestCommonName, type CommonMember, type CommonProduct, type CommonResult, type Offering, type PairingItem } from '@/domain/commonProducts'
import { errorMessage } from '@/domain/errorMessage'
import { useHelpDestinations } from '@/help/destinations'
import { HelpDestMark } from '@/help/ui/HelpDest'
import { describePack, type PackFormat } from '@/domain/packFormat'
import type { DecisionRelation, FamilyDecision, RelationContext, SharedEquivalence } from '@/domain/priceComparison'
import { toCmpPrice, toCmpProduct } from '@/domain/priceComparisonAdapters'
import { basisLabel } from '@/domain/productSize'
import { productTextKey } from '@/domain/productText'
import type { Product, ProductPrice } from '@/domain/types'
import { PackEditor } from '@/ui/PackFormatsPanel'

export interface CompareDataset {
  products: Product[]
  prices: ProductPrice[]
  commons: CommonProduct[]
  members: CommonMember[]
  skipped: string[]
  decisions: FamilyDecision[]
  shared: SharedEquivalence[]
  /** false = la base aún no tiene los productos comunes (migración sin aplicar). */
  available: boolean
}

export interface CompareActions {
  assign: (productId: string, commonId: string, source: CommonMember['source']) => Promise<void>
  unassign: (productId: string) => Promise<void>
  createCommon: (name: string) => Promise<CommonProduct>
  rename: (commonId: string, name: string) => Promise<void>
  remove: (commonId: string) => Promise<void>
  skip: (productId: string) => Promise<void>
  unskip: (productId: string) => Promise<void>
  decide: (a: string, b: string, relation: DecisionRelation | null) => Promise<void>
  setPack: (priceId: string, pack: PackFormat) => Promise<void>
}

const eur = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
const eur3 = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 3 })
const shortDate = (d: string) => {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}
const unitOf = (basis: Parameters<typeof basisLabel>[0]) => basisLabel(basis).replace('€', '')
/** «0,953 €/l». */
const perUnit = (value: number, basis: Parameters<typeof basisLabel>[0]) => `${eur3(value)} €${unitOf(basis)}`

export function relationContext(data: Pick<CompareDataset, 'decisions' | 'shared' | 'members'>): RelationContext {
  return { decisions: data.decisions, shared: data.shared, commonOf: new Map(data.members.map((m) => [m.productId, m.commonId])) }
}

// ─── Aviso con «Deshacer» ───

interface Notice {
  text: string
  undo?: () => Promise<void>
}

function NoticeBar({ notice, onClose, onError }: { notice: Notice | null; onClose: () => void; onError: (m: string) => void }) {
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(onClose, 9000)
    return () => clearTimeout(t)
  }, [notice, onClose])
  if (!notice) return null
  return (
    <p className="points-badge" role="status" data-help-id="compare.notice">
      {notice.text}{' '}
      {notice.undo && (
        <button
          type="button"
          className="link-button"
          onClick={() => {
            const undo = notice.undo
            onClose()
            void undo?.().catch((err) => onError(errorMessage(err, 'No se pudo deshacer')))
          }}
        >
          Deshacer
        </button>
      )}
    </p>
  )
}

// ─── Buscador / selector de producto común ───

export type PickResult = { kind: 'common'; common: CommonProduct } | { kind: 'article'; product: Product } | { kind: 'new'; name: string }

/**
 * Agrupa `article` según lo elegido en el buscador: en un producto común existente, en uno nuevo, o junto a otro artículo (en el grupo del otro si ya lo tiene; si no, se
 * crea uno con los dos). Una sola implementación para «Emparejar», «Resultados» y la ficha del producto.
 */
export async function applyPick(
  article: Pick<Product, 'id'>,
  r: PickResult,
  data: Pick<CompareDataset, 'members' | 'commons'>,
  a: Pick<CompareActions, 'assign' | 'createCommon'>,
): Promise<void> {
  if (r.kind === 'common') return a.assign(article.id, r.common.id, 'manual')
  if (r.kind === 'new') {
    const c = await a.createCommon(r.name)
    return a.assign(article.id, c.id, 'manual')
  }
  const cid = data.members.find((m) => m.productId === r.product.id)?.commonId
  const existing = cid ? data.commons.find((x) => x.id === cid) : undefined
  const c = existing ?? (await a.createCommon(suggestCommonName(toCmpProduct(r.product))))
  await a.assign(article.id, c.id, 'manual')
  if (!existing) await a.assign(r.product.id, c.id, 'manual')
}

/**
 * Busca CUALQUIER producto común o artículo del historial (aunque PEPA no lo haya sugerido) para agrupar un artículo. Elegir un artículo ya agrupado lo une a su producto común;
 * elegir uno sin agrupar crea un producto común con los dos.
 */
export function CommonPickerSheet({
  article,
  data,
  onPick,
  onClose,
}: {
  article: Product
  data: CompareDataset
  onPick: (r: PickResult) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const q = productTextKey(query)
  const nameById = useMemo(() => new Map(data.products.map((p) => [p.id, p.displayName])), [data.products])
  const commonOf = useMemo(() => new Map(data.members.map((m) => [m.productId, m.commonId])), [data.members])
  const commonName = useMemo(() => new Map(data.commons.map((c) => [c.id, c.name])), [data.commons])
  const membersOf = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const x of data.members) m.set(x.commonId, [...(m.get(x.commonId) ?? []), nameById.get(x.productId) ?? ''])
    return m
  }, [data.members, nameById])
  const pricedIds = useMemo(() => new Set(data.prices.map((p) => p.productId)), [data.prices])

  const commons = data.commons
    .filter((c) => !q || productTextKey(c.name).includes(q) || (membersOf.get(c.id) ?? []).some((n) => productTextKey(n).includes(q)))
    .slice(0, 8)
  const articles = q
    ? data.products
        .filter((p) => p.id !== article.id && pricedIds.has(p.id) && productTextKey(p.displayName).includes(q))
        .sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'))
        .slice(0, 12)
    : []
  const exact = q && data.commons.some((c) => productTextKey(c.name) === q)
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" data-help-id="compare.picker" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            ¿Con qué se compara?
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Busca un producto común o cualquier artículo que hayáis comprado para agrupar «{article.displayName}».
        </p>
        <input type="search" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar producto o artículo…" aria-label="Buscar producto común o artículo" style={{ width: '100%' }} />
        {commons.length > 0 && (
          <>
            <p className="muted" style={{ margin: '8px 0 2px', fontSize: 12 }}>
              Productos comunes
            </p>
            {commons.map((c) => (
              <button key={c.id} type="button" className="receipt-line-card" style={{ width: '100%', textAlign: 'left' }} onClick={() => onPick({ kind: 'common', common: c })}>
                <strong>{c.name}</strong>
                <span className="muted" style={{ display: 'block', fontSize: 12 }}>
                  {(membersOf.get(c.id) ?? []).slice(0, 3).join(' · ') || 'sin artículos todavía'}
                  {(membersOf.get(c.id)?.length ?? 0) > 3 ? ` · y ${(membersOf.get(c.id)?.length ?? 0) - 3} más` : ''}
                </span>
              </button>
            ))}
          </>
        )}
        {articles.length > 0 && (
          <>
            <p className="muted" style={{ margin: '8px 0 2px', fontSize: 12 }}>
              Artículos del historial
            </p>
            {articles.map((p) => {
              const cid = commonOf.get(p.id)
              return (
                <button key={p.id} type="button" className="receipt-line-card" style={{ width: '100%', textAlign: 'left' }} onClick={() => onPick({ kind: 'article', product: p })}>
                  {p.displayName}
                  <span className="muted" style={{ display: 'block', fontSize: 12 }}>
                    {cid ? `En «${commonName.get(cid)}»: se unirá a ese grupo` : 'Sin agrupar: se creará un producto común con los dos'}
                  </span>
                </button>
              )
            })}
          </>
        )}
        <button type="button" className="link-button" style={{ marginTop: 8 }} onClick={() => onPick({ kind: 'new', name: query.trim() || suggestCommonName(toCmpProduct(article)) })}>
          ＋ Crear un producto común{query.trim() && !exact ? ` «${query.trim()}»` : ' nuevo'}
        </button>
      </div>
    </div>
  )
}

/** Crear un producto común: nombre editable y, si hay artículos parecidos sin agrupar, marcar cuáles se unen también. */
export function CreateCommonSheet({
  title,
  initialName,
  similar,
  onConfirm,
  onClose,
}: {
  title: string
  initialName: string
  similar: Product[]
  onConfirm: (name: string, alsoIds: string[]) => void
  onClose: () => void
}) {
  const [name, setName] = useState(initialName)
  const [also, setAlso] = useState<Set<string>>(new Set())
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" data-help-id="compare.create" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Nuevo producto común
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          {title}
        </p>
        <label>
          Nombre del producto común
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </label>
        {similar.length > 0 && (
          <>
            <p className="muted" style={{ margin: '8px 0 2px', fontSize: 13 }}>
              ¿Se compara también con estos? (marca los que quieras)
            </p>
            {similar.map((p) => (
              <label key={p.id} className="inline-fields" style={{ alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={also.has(p.id)}
                  onChange={(e) =>
                    setAlso((prev) => {
                      const next = new Set(prev)
                      if (e.target.checked) next.add(p.id)
                      else next.delete(p.id)
                      return next
                    })
                  }
                />
                <span>{p.displayName}</span>
              </label>
            ))}
          </>
        )}
        <div className="form-actions" style={{ marginTop: 8 }}>
          <button type="button" disabled={!name.trim()} onClick={() => onConfirm(name, [...also])}>
            Crear y agrupar
          </button>
          <button type="button" className="link-button" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Resultados ───

function OfferRow({
  offer,
  basis,
  onChange,
  onSeparate,
}: {
  offer: Offering
  basis: NonNullable<CommonResult['basis']>
  onChange: () => void
  onSeparate: () => void
}) {
  const per = perUnit(offer.normalized.value, basis)
  return (
    <div className="receipt-line-card" data-help-id="compare.offer">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span>
          <strong>{offer.store}</strong> · {offer.productName}
        </span>
        <span style={{ whiteSpace: 'nowrap' }}>
          <strong>{per}</strong>
          {offer.cheapest ? ' 🏷️' : ''}
        </span>
      </div>
      <p className="muted" style={{ margin: '2px 0', fontSize: 12 }}>
        {offer.pack ? `${describePack(offer.pack)} · ` : ''}paquete {eur(offer.totalPrice)} · {shortDate(offer.date)}
        {offer.cheapest ? ' · la más económica' : offer.diffPct != null && offer.diffPct > 0 ? ` · +${String(offer.diffPct).replace('.', ',')} %` : ''}
        {offer.sameAs.length > 0 ? ` · mismo producto que ${offer.sameAs[0]}` : ''}
      </p>
      <div className="chip-row">
        <button type="button" className="link-button" style={{ fontSize: 12, padding: 0 }} onClick={onChange}>
          Cambiar de grupo
        </button>
        <button type="button" className="link-button" style={{ fontSize: 12, padding: 0 }} onClick={onSeparate}>
          Separar
        </button>
      </div>
    </div>
  )
}

export function ResultsView({
  data,
  actions,
  onNotice,
  onError,
  onPickGroup,
}: {
  data: CompareDataset
  actions: CompareActions
  onNotice: (n: Notice) => void
  onError: (m: string) => void
  onPickGroup: (productId: string) => void
}) {
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [fixing, setFixing] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const ctx = useMemo(() => relationContext(data), [data])
  const cmpProducts = useMemo(() => data.products.map(toCmpProduct), [data.products])
  const results = useMemo(() => {
    const membersBy = new Map<string, string[]>()
    for (const m of data.members) membersBy.set(m.commonId, [...(membersBy.get(m.commonId) ?? []), m.productId])
    const pricesBy = new Map<string, ReturnType<typeof toCmpPrice>[]>()
    for (const p of data.prices) {
      const list = pricesBy.get(p.productId) ?? []
      list.push(toCmpPrice(p))
      pricesBy.set(p.productId, list)
    }
    return data.commons
      .map((c) => {
        const ids = membersBy.get(c.id) ?? []
        const prods = cmpProducts.filter((p) => ids.includes(p.id))
        return commonResult(c, prods, ids.flatMap((id) => pricesBy.get(id) ?? []), ctx)
      })
      .sort((a, b) => (resultHeadline(b)?.extraPct ?? -1) - (resultHeadline(a)?.extraPct ?? -1) || a.common.name.localeCompare(b.common.name, 'es'))
  }, [data, cmpProducts, ctx])

  const q = productTextKey(query)
  const shown = results.filter((r) => !q || productTextKey(r.common.name).includes(q) || [...r.offers, ...r.unformatted, ...r.otherUnit].some((o) => productTextKey(o.productName).includes(q) || productTextKey(o.store).includes(q)))

  async function guard(fn: () => Promise<void>, fallback: string) {
    try {
      await fn()
    } catch (err) {
      onError(errorMessage(err, fallback))
    }
  }

  if (data.commons.length === 0) {
    return (
      <div className="card" data-help-id="compare.empty">
        <p style={{ margin: 0 }}>Todavía no hay productos comunes.</p>
        <p className="muted" style={{ margin: '4px 0 0' }}>
          En «Emparejar» agrupas los artículos que se pueden comparar (por ejemplo, las leches semidesnatadas de cada tienda) y aquí verás cuál sale más barata por litro, por kilo o por unidad.
        </p>
      </div>
    )
  }

  return (
    <div data-help-id="compare.results">
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar producto, artículo o tienda…" aria-label="Buscar en los resultados" style={{ width: '100%', marginBottom: 6 }} />
      {shown.length === 0 && <p className="muted">Ningún producto común coincide.</p>}
      {shown.map((r) => {
        const open = openId === r.common.id
        const head = resultHeadline(r)
        return (
          <div key={r.common.id} className="card" style={{ marginBottom: 8, padding: 8 }}>
            <button type="button" className="receipt-row-summary" style={{ width: '100%', textAlign: 'left' }} aria-expanded={open} onClick={() => setOpenId(open ? null : r.common.id)}>
              <strong>{r.common.name}</strong> {open ? '▾' : '▸'}
              <br />
              <span className="muted" style={{ fontSize: 13 }}>
                {r.offers.length + r.unformatted.length + r.otherUnit.length} {r.offers.length + r.unformatted.length + r.otherUnit.length === 1 ? 'presentación' : 'presentaciones'}
                {r.storeCount > 0 ? ` · ${r.storeCount} ${r.storeCount === 1 ? 'tienda' : 'tiendas'}` : ''}
                {head ? ` · más barata: ${head.store} ${perUnit(head.value, head.basis)}` : r.unformatted.length > 0 ? ' · faltan formatos' : ''}
              </span>
            </button>
            {open && (
              <div style={{ marginTop: 6 }}>
                {r.offers.map((o) => (
                  <OfferRow key={`${o.productId}|${o.store}|${o.date}|${o.pack ? describePack(o.pack) : ''}`} offer={o} basis={r.basis!} onChange={() => onPickGroup(o.productId)} onSeparate={() => void guard(() => separate(o.productId, r.common.id), 'No se pudo separar')} />
                ))}
                {r.offers.length > 0 && (
                  <p className="muted" style={{ margin: '2px 0 6px', fontSize: 12 }}>
                    Ordenado por precio {perUnit(0, r.basis!).replace('0,00 ', '')} (menor a mayor). El precio del paquete se enseña aparte: una presentación grande puede salir más barata por unidad pero exigir pagar más de una vez.
                  </p>
                )}
                {r.unformatted.length > 0 && (
                  <div data-help-id="compare.unformatted">
                    <p className="muted" style={{ margin: '6px 0 2px', fontSize: 13 }}>
                      Sin formato conocido (no se compara hasta indicarlo):
                    </p>
                    {r.unformatted.map((o) => (
                      <div key={`${o.productId}|${o.store}|${o.date}`} className="receipt-line-card">
                        <span>
                          <strong>{o.store}</strong> · {o.productName} · {eur(o.totalPrice)} · {shortDate(o.date)}
                        </span>{' '}
                        {o.priceId &&
                          (fixing === o.priceId ? (
                            <PackEditor
                              price={o.totalPrice}
                              onSave={(pack) => void guard(async () => { await actions.setPack(o.priceId as string, pack); setFixing(null) }, 'No se pudo guardar el formato')}
                              onCancel={() => setFixing(null)}
                            />
                          ) : (
                            <button type="button" className="link-button" onClick={() => setFixing(o.priceId)}>
                              Indicar formato
                            </button>
                          ))}
                      </div>
                    ))}
                  </div>
                )}
                {r.otherUnit.length > 0 && (
                  <p className="muted" style={{ margin: '6px 0', fontSize: 12 }}>
                    {r.otherUnit.length} {r.otherUnit.length === 1 ? 'presentación está' : 'presentaciones están'} en otra unidad ({r.otherUnit.map((o) => `${o.store}: ${perUnit(o.normalized.value, o.normalized.basis)}`).join('; ')}) y no se mezcla.
                  </p>
                )}
                {r.note && (
                  <p className="muted" style={{ margin: '6px 0', fontSize: 12 }} role="note">
                    {r.note}
                  </p>
                )}
                <p className="muted" style={{ margin: '6px 0', fontSize: 12 }}>
                  Son precios que habéis pagado vosotros, con su fecha: no son ofertas de hoy.
                </p>
                <div className="chip-row">
                  {renaming?.id === r.common.id ? (
                    <>
                      <input type="text" value={renaming.name} maxLength={80} onChange={(e) => setRenaming({ id: r.common.id, name: e.target.value })} aria-label="Nombre del producto común" />
                      <button type="button" className="chip" onClick={() => void guard(async () => { await actions.rename(r.common.id, renaming.name); setRenaming(null) }, 'No se pudo cambiar el nombre')}>
                        Guardar nombre
                      </button>
                    </>
                  ) : (
                    <button type="button" className="link-button" onClick={() => setRenaming({ id: r.common.id, name: r.common.name })}>
                      ✏️ Cambiar nombre
                    </button>
                  )}
                  {confirmDelete === r.common.id ? (
                    <button type="button" className="chip" onClick={() => void guard(() => removeCommon(r), 'No se pudo eliminar')}>
                      Sí, eliminar el grupo (los artículos y precios se quedan)
                    </button>
                  ) : (
                    <button type="button" className="link-button" onClick={() => setConfirmDelete(r.common.id)}>
                      Eliminar grupo
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  async function separate(productId: string, commonId: string) {
    await actions.unassign(productId)
    onNotice({ text: 'Artículo separado del grupo.', undo: () => actions.assign(productId, commonId, 'manual') })
  }

  async function removeCommon(r: CommonResult) {
    const ids = data.members.filter((m) => m.commonId === r.common.id).map((m) => m.productId)
    await actions.remove(r.common.id)
    setConfirmDelete(null)
    onNotice({
      text: `Grupo «${r.common.name}» eliminado. Los artículos y sus precios siguen ahí.`,
      undo: async () => {
        const again = await actions.createCommon(r.common.name)
        for (const id of ids) await actions.assign(id, again.id, 'manual')
      },
    })
  }
}

// ─── Emparejar ───

export function PairingView({
  data,
  actions,
  onNotice,
  onError,
}: {
  data: CompareDataset
  actions: CompareActions
  onNotice: (n: Notice) => void
  onError: (m: string) => void
}) {
  const [query, setQuery] = useState('')
  const [stores, setStores] = useState<string[]>([])
  const [limit, setLimit] = useState(10)
  const [picking, setPicking] = useState<PairingItem | null>(null)
  const [creating, setCreating] = useState<{ item: PairingItem; name: string; first?: Product } | null>(null)
  const [showDone, setShowDone] = useState(false)
  const [showSkipped, setShowSkipped] = useState(false)

  const ctx = useMemo(() => relationContext(data), [data])
  const cmpProducts = useMemo(() => data.products.map(toCmpProduct), [data.products])
  const cmpPrices = useMemo(() => data.prices.map((p) => ({ ...toCmpPrice(p), quantity: Number(p.quantity) > 0 ? Number(p.quantity) : 1 })), [data.prices])
  const skipped = useMemo(() => new Set(data.skipped), [data.skipped])
  const queue = useMemo(() => pairingQueue(cmpProducts, cmpPrices, data.commons, data.members, skipped, ctx, { query, stores }), [cmpProducts, cmpPrices, data.commons, data.members, skipped, ctx, query, stores])
  const totalPending = useMemo(() => pairingQueue(cmpProducts, cmpPrices, data.commons, data.members, skipped, ctx).length, [cmpProducts, cmpPrices, data.commons, data.members, skipped, ctx])
  const productById = useMemo(() => new Map(data.products.map((p) => [p.id, p])), [data.products])
  const storeList = useMemo(() => {
    const count = new Map<string, number>()
    for (const p of data.prices) if (p.store?.trim()) count.set(p.store.trim(), (count.get(p.store.trim()) ?? 0) + 1)
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([s]) => s)
  }, [data.prices])
  const safe = queue.filter((i) => i.suggestions[0]?.automatic)

  async function guard(fn: () => Promise<void>, fallback: string) {
    try {
      await fn()
    } catch (err) {
      onError(errorMessage(err, fallback))
    }
  }

  async function assign(item: PairingItem, common: CommonProduct, source: CommonMember['source']) {
    await actions.assign(item.article.id, common.id, source)
    onNotice({ text: `«${item.article.displayName}» agrupado en «${common.name}».`, undo: () => actions.unassign(item.article.id) })
  }

  async function createWith(item: PairingItem, name: string, alsoIds: string[], first?: Product) {
    const common = await actions.createCommon(name)
    const ids = [item.article.id, ...(first ? [first.id] : []), ...alsoIds]
    for (const id of ids) await actions.assign(id, common.id, 'manual')
    setCreating(null)
    onNotice({
      text: `Producto común «${common.name}» creado con ${ids.length} ${ids.length === 1 ? 'artículo' : 'artículos'}.`,
      undo: async () => {
        for (const id of ids) await actions.unassign(id)
        await actions.remove(common.id)
      },
    })
  }

  async function handlePick(item: PairingItem, r: PickResult) {
    setPicking(null)
    if (r.kind === 'common') return assign(item, r.common, 'manual')
    if (r.kind === 'article') {
      const cid = data.members.find((m) => m.productId === r.product.id)?.commonId
      const common = cid ? data.commons.find((c) => c.id === cid) : undefined
      if (common) return assign(item, common, 'manual')
      return void setCreating({ item, name: suggestCommonName(toCmpProduct(r.product)), first: r.product })
    }
    setCreating({ item, name: r.name })
  }

  async function acceptSafe() {
    let n = 0
    for (const i of safe) {
      await actions.assign(i.article.id, i.suggestions[0].common.id, 'auto')
      n += 1
    }
    onNotice({
      text: `${n} ${n === 1 ? 'artículo agrupado' : 'artículos agrupados'} (eran idénticos a otro ya agrupado).`,
      undo: async () => {
        for (const i of safe) await actions.unassign(i.article.id)
      },
    })
  }

  const memberRows = data.commons
    .map((c) => ({ c, items: data.members.filter((m) => m.commonId === c.id).map((m) => productById.get(m.productId)).filter((p): p is Product => !!p) }))
    .filter((x) => x.items.length > 0)

  if (!data.available) {
    return (
      <p className="muted" data-help-id="compare.unavailable">
        Los productos comunes aún no están disponibles en tu cuenta. Cuando lo estén podrás agrupar aquí los artículos que se comparan entre sí.
      </p>
    )
  }

  return (
    <div data-help-id="compare.pairing">
      <p className="muted" style={{ marginTop: 0 }}>
        {totalPending} {totalPending === 1 ? 'artículo' : 'artículos'} por agrupar · {data.members.length} ya agrupados. No hace falta terminar: puedes dejarlo y seguir otro día.
      </p>
      <div className="inline-fields">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar artículo o tienda…" aria-label="Buscar artículos por emparejar" style={{ flex: 1 }} />
      </div>
      {storeList.length > 1 && (
        <div className="chip-row" role="group" aria-label="Filtrar por tienda" style={{ margin: '6px 0' }}>
          {storeList.map((s) => {
            const on = stores.includes(s)
            return (
              <button key={s} type="button" aria-pressed={on} className={on ? 'chip chip-active' : 'chip'} onClick={() => setStores((prev) => (on ? prev.filter((x) => x !== s) : [...prev, s]))}>
                {s}
              </button>
            )
          })}
        </div>
      )}
      {safe.length > 0 && (
        <button type="button" className="chip" style={{ marginBottom: 6 }} onClick={() => void guard(acceptSafe, 'No se pudo agrupar')}>
          ✓ Aceptar las {safe.length} sugerencias seguras (idénticos a un artículo ya agrupado)
        </button>
      )}
      {queue.length === 0 && <p className="muted">{totalPending === 0 ? 'No queda ningún artículo por agrupar. 🎉' : 'Ningún artículo coincide con ese filtro.'}</p>}
      {queue.slice(0, limit).map((item) => (
        <div key={item.article.id} className="card" style={{ marginBottom: 8, padding: 8 }} data-help-id="compare.pairing-card">
          <strong>{item.article.displayName}</strong>
          <p className="muted" style={{ margin: '2px 0', fontSize: 12 }}>
            {item.stats.lastStore ?? 'Sin tienda'} · {eur(item.stats.lastPrice)}
            {item.stats.pack ? ` · ${describePack(item.stats.pack)}` : ''} · {item.stats.lines} {item.stats.lines === 1 ? 'compra' : 'compras'}
          </p>
          {item.suggestions.map((s) => (
            <button key={s.common.id} type="button" className="chip" style={{ margin: '2px 4px 2px 0' }} onClick={() => void guard(() => assign(item, s.common, 'sugerido'), 'No se pudo agrupar')} title={s.reason}>
              → {s.common.name}
              {s.relation === 'identical' ? ' (mismo producto)' : ''}
            </button>
          ))}
          {item.suggestions[0] && (
            <p className="muted" style={{ margin: '2px 0', fontSize: 12 }}>
              {item.suggestions[0].reason}
            </p>
          )}
          <div className="chip-row" style={{ marginTop: 4 }}>
            <button type="button" className="link-button" onClick={() => setPicking(item)}>
              🔎 Buscar otro
            </button>
            <button type="button" className="link-button" onClick={() => setCreating({ item, name: item.newName })}>
              ＋ Crear producto común
            </button>
            <button type="button" className="link-button" onClick={() => void guard(async () => { await actions.skip(item.article.id); onNotice({ text: `«${item.article.displayName}» no se emparejará.`, undo: () => actions.unskip(item.article.id) }) }, 'No se pudo guardar')}>
              No emparejar
            </button>
          </div>
        </div>
      ))}
      {queue.length > limit && (
        <button type="button" className="link-button" onClick={() => setLimit((l) => l + 15)}>
          Ver más ({queue.length - limit})
        </button>
      )}

      <div style={{ marginTop: 10 }}>
        <button type="button" className="link-button" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)}>
          Agrupados ({data.members.length}) {showDone ? '▾' : '▸'}
        </button>
        {showDone && (
          <div className="card" style={{ marginTop: 4 }}>
            {memberRows.length === 0 && <p className="muted">Todavía no has agrupado ninguno.</p>}
            {memberRows.map(({ c, items }) => (
              <div key={c.id} style={{ marginBottom: 6 }}>
                <strong>{c.name}</strong>
                {items.map((p) => (
                  <p key={p.id} className="muted" style={{ margin: '2px 0', fontSize: 13 }}>
                    {p.displayName}{' '}
                    <button type="button" className="link-button" style={{ fontSize: 12, padding: 0 }} aria-label={`Separar ${p.displayName}`} onClick={() => void guard(async () => { await actions.unassign(p.id); onNotice({ text: `«${p.displayName}» separado de «${c.name}».`, undo: () => actions.assign(p.id, c.id, 'manual') }) }, 'No se pudo separar')}>
                      ✕ Separar
                    </button>
                  </p>
                ))}
              </div>
            ))}
          </div>
        )}
        {data.skipped.length > 0 && (
          <>
            <br />
            <button type="button" className="link-button" aria-expanded={showSkipped} onClick={() => setShowSkipped((v) => !v)}>
              No emparejados ({data.skipped.length}) {showSkipped ? '▾' : '▸'}
            </button>
            {showSkipped && (
              <div className="card" style={{ marginTop: 4 }}>
                {data.skipped.map((id) => (
                  <p key={id} className="muted" style={{ margin: '2px 0', fontSize: 13 }}>
                    {productById.get(id)?.displayName ?? '?'}{' '}
                    <button type="button" className="link-button" style={{ fontSize: 12, padding: 0 }} onClick={() => void guard(() => actions.unskip(id), 'No se pudo recuperar')}>
                      Volver a la cola
                    </button>
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {picking && <CommonPickerSheet article={productById.get(picking.article.id) ?? data.products[0]} data={data} onPick={(r) => void guard(() => handlePick(picking, r), 'No se pudo agrupar')} onClose={() => setPicking(null)} />}
      {creating && (
        <CreateCommonSheet
          title={`Se creará con «${creating.item.article.displayName}»${creating.first ? ` y «${creating.first.displayName}»` : ''}.`}
          initialName={creating.name}
          similar={similarPending(creating.item.article, queue.map((i) => i.article), ctx)
            .map((p) => productById.get(p.id))
            .filter((p): p is Product => !!p && p.id !== creating.first?.id)}
          onConfirm={(name, also) => void guard(() => createWith(creating.item, name, also, creating.first), 'No se pudo crear')}
          onClose={() => setCreating(null)}
        />
      )}
    </div>
  )
}

// ─── Contenedor: carga los datos y arma las acciones ───

export function ComparePricesTab() {
  const [view, setView] = useState<'resultados' | 'emparejar'>('resultados')
  const [data, setData] = useState<CompareDataset | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [pickGroupFor, setPickGroupFor] = useState<string | null>(null)
  // «Llévame» y los tutoriales: cada vista se abre por su nombre.
  useHelpDestinations({ 'compras.comparar': () => setView('resultados'), 'compras.comparar.emparejar': () => setView('emparejar') })

  const reload = useCallback(async () => {
    try {
      const [products, prices, cd, decisions] = await Promise.all([listProducts(), listAllProductPrices(), listCommonProductsData(), listFamilyDecisions()])
      const priced = new Set(prices.map((p) => p.productId))
      const names = products.filter((p) => priced.has(p.id)).slice(0, 100).map((p) => p.displayName)
      const shared = await loadSharedEquivalences(names)
      setData({ products, prices, commons: cd.commons, members: cd.members, skipped: cd.skipped, decisions, shared, available: cd.available })
      setError(null)
    } catch (err) {
      setError(errorMessage(err, 'No se pudieron cargar los precios'))
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const actions: CompareActions = useMemo(() => {
    const then = (fn: () => Promise<unknown>) => async () => {
      await fn()
      await reload()
    }
    return {
      assign: (productId, commonId, source) => then(() => assignToCommon(productId, commonId, source))(),
      unassign: (productId) => then(() => unassignFromCommon(productId))(),
      createCommon: async (name) => {
        const c = await createCommonProduct(name)
        await reload()
        return c
      },
      rename: (id, name) => then(() => renameCommonProduct(id, name))(),
      remove: (id) => then(() => deleteCommonProduct(id))(),
      skip: (id) => then(() => skipPairing(id))(),
      unskip: (id) => then(() => unskipPairing(id))(),
      decide: (a, b, relation) => then(() => (relation == null ? clearFamilyDecision(a, b) : setFamilyDecision(a, b, relation)))(),
      setPack: (priceId, pack) => then(() => setPriceLinePack(priceId, pack))(),
    }
  }, [reload])

  if (!data)
    return (
      <>
        <HelpDestMark id={view === 'resultados' ? 'compras.comparar' : 'compras.comparar.emparejar'} />
        <p className="muted">{error ?? 'Cargando precios…'}</p>
      </>
    )

  const pending = pairingPending(data)
  const articleToMove = pickGroupFor ? data.products.find((p) => p.id === pickGroupFor) : null

  return (
    <div data-help-id="compare.tab">
      <HelpDestMark id={view === 'resultados' ? 'compras.comparar' : 'compras.comparar.emparejar'} />
      <div className="chip-row" role="group" aria-label="Comparar precios" data-help-id="compare.tabs" style={{ marginBottom: 8 }}>
        <button type="button" className={view === 'resultados' ? 'chip chip-active' : 'chip'} aria-pressed={view === 'resultados'} onClick={() => setView('resultados')}>
          Resultados
        </button>
        <button type="button" className={view === 'emparejar' ? 'chip chip-active' : 'chip'} aria-pressed={view === 'emparejar'} onClick={() => setView('emparejar')}>
          Emparejar{pending > 0 ? ` (${pending})` : ''}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <NoticeBar notice={notice} onClose={() => setNotice(null)} onError={setError} />
      {view === 'resultados' ? (
        <ResultsView data={data} actions={actions} onNotice={setNotice} onError={setError} onPickGroup={setPickGroupFor} />
      ) : (
        <PairingView data={data} actions={actions} onNotice={setNotice} onError={setError} />
      )}
      {articleToMove && (
        <CommonPickerSheet
          article={articleToMove}
          data={data}
          onClose={() => setPickGroupFor(null)}
          onPick={(r) => {
            setPickGroupFor(null)
            void applyPick(articleToMove, r, data, actions).catch((err) => setError(errorMessage(err, 'No se pudo cambiar el grupo')))
          }}
        />
      )}
    </div>
  )
}

function pairingPending(data: CompareDataset): number {
  const memberIds = new Set(data.members.map((m) => m.productId))
  const skipped = new Set(data.skipped)
  const priced = new Set(data.prices.map((p) => p.productId))
  let n = 0
  for (const p of data.products) if (priced.has(p.id) && !memberIds.has(p.id) && !skipped.has(p.id)) n += 1
  return n
}
