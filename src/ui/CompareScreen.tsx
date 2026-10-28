// «Comparar precios» (quinta subsección de Compras): Resultados (comparaciones por producto común) y Emparejar (agrupar artículos bajo un producto común).
// Reutiliza el comparador y las equivalencias de siempre: aquí solo se agrupan los artículos que se pueden comparar entre sí, SIN tocar nombres, precios ni formatos originales.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { confirmCommon, createCommonProduct, deleteCommonProduct, assignToCommon, discardPendingCommon, listCommonProductsData, renameCommonProduct, runAutoGrouping, separateFromPepaGroup, skipPairing, unassignFromCommon, unskipPairing } from '@/data/commonProducts'
import { clearFamilyDecision, listFamilyDecisions, loadSharedEquivalences, setFamilyDecision } from '@/data/productEquivalences'
import { listAllProductPrices, listProducts, setPriceLinePack, setProductCatalogKey } from '@/data/products'
import { planAutoGrouping } from '@/domain/autoGrouping'
import { articleStats, pairingQueue, similarPending, suggestCommonName, type CommonMember, type CommonProduct, type PairingItem } from '@/domain/commonProducts'
import { autoComparableIds } from '@/domain/comparisonModes'
import { errorMessage } from '@/domain/errorMessage'
import { useHelpDestinations } from '@/help/destinations'
import { HelpDestMark } from '@/help/ui/HelpDest'
import { describePack } from '@/domain/packFormat'
import { toCmpPrice, toCmpProduct } from '@/domain/priceComparisonAdapters'
import { productTextKey } from '@/domain/productText'
import type { Product } from '@/domain/types'
import { ResultsView } from '@/ui/CompareResults'
import { eur, relationContext, type CompareActions, type CompareDataset, type Notice } from '@/ui/compareShared'

export type { CompareActions, CompareDataset } from '@/ui/compareShared'
export { relationContext } from '@/ui/compareShared'
export { ResultsView } from '@/ui/CompareResults'

// ─── Aviso con «Deshacer» ───

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
              <label key={p.id} className="cmp-check-row">
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
  // Lo que PEPA ya reconoce con seguridad se compara solo (Resultados → Productos idénticos): aquí queda lo ambiguo o desconocido.
  const auto = useMemo(() => autoComparableIds(data.products), [data.products])
  const queue = useMemo(() => pairingQueue(cmpProducts, cmpPrices, data.commons, data.members, skipped, ctx, { query, stores, exclude: auto }), [cmpProducts, cmpPrices, data.commons, data.members, skipped, ctx, query, stores, auto])
  const totalPending = useMemo(() => pairingQueue(cmpProducts, cmpPrices, data.commons, data.members, skipped, ctx, { exclude: auto }).length, [cmpProducts, cmpPrices, data.commons, data.members, skipped, ctx, auto])
  const autoCount = useMemo(() => {
    const grouped = new Set(data.members.map((m) => m.productId))
    const priced = new Set(data.prices.map((p) => p.productId))
    return [...auto].filter((id) => priced.has(id) && !grouped.has(id) && !skipped.has(id)).length
  }, [auto, data.members, data.prices, skipped])
  const productById = useMemo(() => new Map(data.products.map((p) => [p.id, p])), [data.products])
  const storeList = useMemo(() => {
    const count = new Map<string, number>()
    for (const p of data.prices) if (p.store?.trim()) count.set(p.store.trim(), (count.get(p.store.trim()) ?? 0) + 1)
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([s]) => s)
  }, [data.prices])
  const safe = queue.filter((i) => i.suggestions[0]?.automatic)
  const pendingCommonIds = useMemo(() => new Set(data.commons.filter((c) => c.status === 'pending').map((c) => c.id)), [data.commons])
  const pepaCount = data.members.filter((m) => pendingCommonIds.has(m.commonId)).length
  const confirmedCount = data.members.length - pepaCount

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
    .filter((c) => c.status !== 'pending')
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
        <strong>{confirmedCount}</strong> {confirmedCount === 1 ? 'confirmado' : 'confirmados'} por vosotros · <strong>{pepaCount}</strong> agrupados por PEPA, pendientes de revisar · <strong>{totalPending}</strong> pendientes de emparejar. No hace falta terminar: puedes dejarlo y seguir otro día.
        {autoCount > 0 ? ` ${autoCount} ${autoCount === 1 ? 'artículo se compara' : 'artículos se comparan'} solos, porque PEPA los reconoce con seguridad (míralos en Resultados).` : ''}
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
        <div key={item.article.id} className="card cmp-pair" data-help-id="compare.pairing-card">
          <div className="cmp-pair-head">
            <strong className="cmp-pair-name">{item.article.displayName}</strong>
            <span className="muted cmp-pair-meta">
              {item.stats.lastStore ?? 'Sin tienda'} · {eur(item.stats.lastPrice)}
              {item.stats.pack ? ` · ${describePack(item.stats.pack)}` : ''} · {item.stats.lines} {item.stats.lines === 1 ? 'compra' : 'compras'}
            </span>
          </div>
          {item.suggestions.length > 0 && (
            <div className="cmp-pair-suggestions">
              {item.suggestions.map((s) => (
                <button key={s.common.id} type="button" className="chip" onClick={() => void guard(() => assign(item, s.common, 'sugerido'), 'No se pudo agrupar')} title={s.reason}>
                  → {s.common.name}
                  {s.relation === 'identical' ? ' (mismo producto)' : ''}
                </button>
              ))}
              <span className="muted cmp-pair-reason">{item.suggestions[0].reason}</span>
            </div>
          )}
          <div className="cmp-pair-actions">
            <button type="button" className="cmp-edit-btn" onClick={() => setPicking(item)}>
              🔎 Buscar otro
            </button>
            <button type="button" className="cmp-edit-btn" onClick={() => setCreating({ item, name: item.newName })}>
              ＋ Crear producto común
            </button>
            <button type="button" className="cmp-edit-btn" onClick={() => void guard(async () => { await actions.skip(item.article.id); onNotice({ text: `«${item.article.displayName}» no se emparejará.`, undo: () => actions.unskip(item.article.id) }) }, 'No se pudo guardar')}>
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
          Confirmados ({confirmedCount}) {showDone ? '▾' : '▸'}
        </button>
        {showDone && (
          <div className="card" style={{ marginTop: 4 }}>
            {memberRows.length === 0 && <p className="muted">Todavía no has confirmado ninguno.</p>}
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

// ─── Revisar lo que ha agrupado PEPA ───

/**
 * Agrupaciones que PEPA ha propuesto a partir del historial, pendientes de revisar: primero las que juntan tiendas distintas (las que permiten comparar). Cada grupo se confirma,
 * se corrige (renombrar, separar un artículo) o se descarta. Nada de esto cuenta como confirmado hasta que la persona lo acepta. Debajo, lo que PEPA ve parecido a los grupos
 * que la familia ya confirmó: ahí NO añade nada sola, lo añade la persona.
 */
export function ReviewView({
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
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [limit, setLimit] = useState(10)
  const productById = useMemo(() => new Map(data.products.map((p) => [p.id, p])), [data.products])
  const cmpPrices = useMemo(() => data.prices.map((p) => ({ ...toCmpPrice(p), quantity: Number(p.quantity) > 0 ? Number(p.quantity) : 1 })), [data.prices])
  const stats = useMemo(() => articleStats(cmpPrices), [cmpPrices])
  const groups = useMemo(() => {
    return data.commons
      .filter((c) => c.status === 'pending')
      .map((c) => {
        const items = data.members.filter((m) => m.commonId === c.id).map((m) => productById.get(m.productId)).filter((p): p is Product => !!p)
        const stores = [...new Set(items.flatMap((p) => stats.get(p.id)?.stores ?? []))]
        return { c, items, stores }
      })
      .filter((g) => g.items.length > 0)
      .sort((a, b) => b.stores.length - a.stores.length || b.items.length - a.items.length || a.c.name.localeCompare(b.c.name, 'es'))
  }, [data.commons, data.members, productById, stats])
  const forMine = useMemo(() => {
    const plan = planAutoGrouping({
      products: data.products.map(toCmpProduct),
      prices: cmpPrices,
      commons: data.commons.map((c) => ({ ...c, status: c.status ?? 'confirmed' })),
      members: data.members,
      skippedIds: new Set(data.skipped),
      rejectedIds: new Set(data.rejected ?? []),
      ctx: relationContext(data),
    })
    return plan.forConfirmed
  }, [data, cmpPrices])

  async function guard(fn: () => Promise<void>, fallback: string) {
    try {
      await fn()
    } catch (err) {
      onError(errorMessage(err, fallback))
    }
  }

  async function confirm(g: (typeof groups)[number]) {
    await actions.confirmGroup(g.c.id)
    onNotice({ text: `Grupo «${g.c.name}» confirmado.` })
  }

  async function confirmMulti() {
    const multi = groups.filter((g) => g.stores.length > 1)
    for (const g of multi) await actions.confirmGroup(g.c.id)
    onNotice({ text: `${multi.length} ${multi.length === 1 ? 'grupo confirmado' : 'grupos confirmados'}.` })
  }

  async function discard(g: (typeof groups)[number]) {
    await actions.discardGroup(g.c.id, g.items.map((p) => p.id))
    onNotice({ text: `Grupo «${g.c.name}» descartado. Los artículos y sus precios siguen ahí y PEPA no lo volverá a proponer.` })
  }

  if (!data.available) {
    return (
      <p className="muted" data-help-id="compare.unavailable">
        Los productos comunes aún no están disponibles en tu cuenta.
      </p>
    )
  }
  const multiCount = groups.filter((g) => g.stores.length > 1).length
  return (
    <div data-help-id="compare.review">
      <p className="muted" style={{ marginTop: 0 }}>
        PEPA ha revisado vuestro historial y propone estos grupos de artículos que parecen el mismo producto. Hasta que los confirméis, en Resultados se enseñan como provisionales. No hace falta revisarlos todos.
      </p>
      {groups.length === 0 && <p className="muted">No hay agrupaciones de PEPA pendientes de revisar.</p>}
      {multiCount > 1 && (
        <button type="button" className="chip" style={{ marginBottom: 6 }} onClick={() => void guard(confirmMulti, 'No se pudieron confirmar')}>
          ✓ Confirmar los {multiCount} grupos con varias tiendas
        </button>
      )}
      {groups.slice(0, limit).map((g) => (
        <div key={g.c.id} className="card" style={{ marginBottom: 8, padding: 8 }} data-help-id="compare.review-group">
          <strong>{g.c.name}</strong>
          <p className="muted" style={{ margin: '2px 0', fontSize: 12 }}>
            {g.items.length} {g.items.length === 1 ? 'artículo' : 'artículos'} · {g.stores.length > 0 ? g.stores.join(' y ') : 'sin tienda'} · agrupado por PEPA, pendiente de revisar
          </p>
          {g.items.map((p) => (
            <p key={p.id} style={{ margin: '2px 0', fontSize: 14 }}>
              {p.displayName}
              <span className="muted" style={{ fontSize: 12 }}>
                {' '}
                · {stats.get(p.id)?.lastStore ?? 'Sin tienda'} · {eur(stats.get(p.id)?.lastPrice ?? 0)}
              </span>{' '}
              <button type="button" className="link-button" style={{ fontSize: 12, padding: 0 }} aria-label={`Separar ${p.displayName}`} onClick={() => void guard(async () => { await actions.separatePepa(p.id); onNotice({ text: `«${p.displayName}» separado de «${g.c.name}». PEPA no se lo volverá a proponer.` }) }, 'No se pudo separar')}>
                ✕ Separar
              </button>
            </p>
          ))}
          <div className="chip-row" style={{ marginTop: 4 }}>
            {renaming?.id === g.c.id ? (
              <>
                <input type="text" value={renaming.name} maxLength={80} onChange={(e) => setRenaming({ id: g.c.id, name: e.target.value })} aria-label="Nombre del producto común" />
                <button type="button" className="chip" onClick={() => void guard(async () => { await actions.rename(g.c.id, renaming.name); setRenaming(null) }, 'No se pudo cambiar el nombre')}>
                  Guardar nombre
                </button>
              </>
            ) : (
              <>
                <button type="button" className="chip chip-active" onClick={() => void guard(() => confirm(g), 'No se pudo confirmar')}>
                  ✓ Confirmar grupo
                </button>
                <button type="button" className="link-button" onClick={() => setRenaming({ id: g.c.id, name: g.c.name })}>
                  ✏️ Cambiar nombre
                </button>
                <button type="button" className="link-button" onClick={() => void guard(() => discard(g), 'No se pudo descartar')}>
                  Descartar grupo
                </button>
              </>
            )}
          </div>
        </div>
      ))}
      {groups.length > limit && (
        <button type="button" className="link-button" onClick={() => setLimit((l) => l + 15)}>
          Ver más ({groups.length - limit})
        </button>
      )}

      {forMine.length > 0 && (
        <div data-help-id="compare.review-mine" style={{ marginTop: 10 }}>
          <strong>Para tus grupos</strong>
          <p className="muted" style={{ margin: '2px 0 6px', fontSize: 12 }}>
            PEPA no cambia los grupos que ya habéis confirmado. Estos artículos se parecen a los de vuestros grupos: añádelos si quieres.
          </p>
          {forMine.map((f) => (
            <div key={f.commonId} className="card" style={{ marginBottom: 8, padding: 8 }}>
              <strong>{f.commonName}</strong>
              {f.productIds.map((id) => {
                const p = productById.get(id)
                return p ? (
                  <p key={id} style={{ margin: '2px 0', fontSize: 14 }}>
                    {p.displayName}{' '}
                    <button type="button" className="link-button" style={{ fontSize: 12, padding: 0 }} aria-label={`Añadir ${p.displayName} a ${f.commonName}`} onClick={() => void guard(async () => { await actions.assign(id, f.commonId, 'sugerido'); onNotice({ text: `«${p.displayName}» añadido a «${f.commonName}».`, undo: () => actions.unassign(id) }) }, 'No se pudo añadir')}>
                      ＋ Añadir
                    </button>
                  </p>
                ) : null
              })}
              {f.productIds.length > 1 && (
                <button type="button" className="chip" onClick={() => void guard(async () => { for (const id of f.productIds) await actions.assign(id, f.commonId, 'sugerido'); onNotice({ text: `${f.productIds.length} artículos añadidos a «${f.commonName}».`, undo: async () => { for (const id of f.productIds) await actions.unassign(id) } }) }, 'No se pudo añadir')}>
                  ＋ Añadir los {f.productIds.length}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Contenedor: carga los datos y arma las acciones ───

export function ComparePricesTab() {
  const [view, setView] = useState<'resultados' | 'emparejar' | 'revisar'>('resultados')
  const autoRan = useRef(false)
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
      setData({ products, prices, commons: cd.commons, members: cd.members, skipped: cd.skipped, rejected: cd.rejected, decisions, shared, available: cd.available })
      setError(null)
    } catch (err) {
      setError(errorMessage(err, 'No se pudieron cargar los precios'))
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  // Al volver a la pantalla (tras guardar un ticket en otro momento, o desde otro dispositivo) se vuelven a leer los datos: lo recién identificado aparece sin recargar la app.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reload])

  // PEPA agrupa sola lo que es claramente el mismo producto, una vez al abrir (idempotente: no duplica ni resucita lo descartado). Es una propuesta: queda pendiente de revisar.
  useEffect(() => {
    if (!data || !data.available || autoRan.current) return
    autoRan.current = true
    void runAutoGrouping().then((o) => {
      if (o && o.grouped > 0) {
        setNotice({ text: `PEPA ha agrupado ${o.grouped} ${o.grouped === 1 ? 'artículo' : 'artículos'} que parecen el mismo producto. Están pendientes de revisar en «Revisar PEPA».` })
        void reload()
      }
    })
  }, [data, reload])

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
      confirmGroup: (id) => then(() => confirmCommon(id))(),
      discardGroup: (id, ids) => then(() => discardPendingCommon(id, ids))(),
      separatePepa: (id) => then(() => separateFromPepaGroup(id))(),
      unskip: (id) => then(() => unskipPairing(id))(),
      decide: (a, b, relation) => then(() => (relation == null ? clearFamilyDecision(a, b) : setFamilyDecision(a, b, relation)))(),
      setPack: (priceId, pack) => then(() => setPriceLinePack(priceId, pack))(),
      setCatalogKey: (productId, key) => then(() => setProductCatalogKey(productId, key))(),
    }
  }, [reload])

  if (!data)
    return (
      <>
        {view === 'resultados' ? <HelpDestMark id="compras.comparar" /> : <HelpDestMark id="compras.comparar.emparejar" />}
        <p className="muted">{error ?? 'Cargando precios…'}</p>
      </>
    )

  const pending = pairingPending(data)
  const toReview = data.commons.filter((c) => c.status === 'pending' && data.members.some((m) => m.commonId === c.id)).length
  const articleToMove = pickGroupFor ? data.products.find((p) => p.id === pickGroupFor) : null

  return (
    <div data-help-id="compare.tab">
      {view === 'resultados' ? <HelpDestMark id="compras.comparar" /> : <HelpDestMark id="compras.comparar.emparejar" />}
      <div className="chip-row" role="group" aria-label="Comparar precios" data-help-id="compare.tabs" style={{ marginBottom: 8 }}>
        <button type="button" className={view === 'resultados' ? 'chip chip-active' : 'chip'} aria-pressed={view === 'resultados'} onClick={() => setView('resultados')}>
          Resultados
        </button>
        <button type="button" className={view === 'emparejar' ? 'chip chip-active' : 'chip'} aria-pressed={view === 'emparejar'} onClick={() => setView('emparejar')}>
          Emparejar{pending > 0 ? ` (${pending})` : ''}
        </button>
        {(toReview > 0 || view === 'revisar') && (
          <button type="button" className={view === 'revisar' ? 'chip chip-active' : 'chip'} aria-pressed={view === 'revisar'} data-help-id="compare.review-tab" onClick={() => setView('revisar')}>
            Revisar PEPA{toReview > 0 ? ` (${toReview})` : ''}
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      <NoticeBar notice={notice} onClose={() => setNotice(null)} onError={setError} />
      {view === 'resultados' ? (
        <ResultsView data={data} actions={actions} onNotice={setNotice} onError={setError} onPickGroup={setPickGroupFor} />
      ) : view === 'revisar' ? (
        <ReviewView data={data} actions={actions} onNotice={setNotice} onError={setError} />
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
  const auto = autoComparableIds(data.products)
  const memberIds = new Set(data.members.map((m) => m.productId))
  const skipped = new Set(data.skipped)
  const priced = new Set(data.prices.map((p) => p.productId))
  let n = 0
  for (const p of data.products) if (priced.has(p.id) && !memberIds.has(p.id) && !skipped.has(p.id) && !auto.has(p.id)) n += 1
  return n
}
