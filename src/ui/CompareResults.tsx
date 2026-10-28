// «Comparar precios» · Resultados (NORM-3): dos modos al mismo nivel —Productos idénticos y Alternativas comparables— y, en cada grupo, las filas con tienda, formato, precio
// pagado, precio por unidad y fecha A LA VISTA (nada de entrar en una ficha para saber dónde sale más barato). Todo se calcula con el normalizador común del catálogo
// (domain/comparisonModes): aquí solo se muestra y se corrige, sin tocar nunca importes, cantidades ni nombres originales de las compras.
import { useMemo, useState } from 'react'
import { catalogClass } from '@/domain/catalog/classes'
import { buildComparisonGroups, COMPARE_SORTS, filterGroups, groupClassOptions, isComparable, SORT_LABEL, sortGroups, type CompareMode, type CompareSort, type ComparisonRow, type ModeGroup } from '@/domain/comparisonModes'
import type { MemberFormat } from '@/domain/commonProducts'
import { describePack, type PackFormat } from '@/domain/packFormat'
import type { PackInput } from '@/domain/productSize'
import { errorMessage } from '@/domain/errorMessage'
import { useCompareViewPrefs } from '@/state/compareViewPrefs'
import { CatalogPicker } from '@/ui/CatalogPicker'
import { eur, perUnit, relationContext, shortDate, type CompareActions, type CompareDataset, type Notice } from '@/ui/compareShared'
import { PackEditor } from '@/ui/PackFormatsPanel'

const ROWS_SHOWN = 3

export const MODE_LABEL: Record<CompareMode, string> = { identicos: 'Productos idénticos', alternativas: 'Alternativas comparables' }
const MODE_HINT: Record<CompareMode, string> = {
  identicos: 'El mismo producto en distintas tiendas, fechas y formatos.',
  alternativas: 'Productos distintos que cubren la misma necesidad (cervezas, refrescos, leches…): cada uno conserva su identidad.',
}

/** Los dos modos, al mismo nivel y siempre a la vista. */
export function ModeTabs({ mode, onMode }: { mode: CompareMode; onMode: (m: CompareMode) => void }) {
  return (
    <div className="cmp-modes" role="tablist" aria-label="Qué quieres comparar" data-help-id="compare.modes">
      {(['identicos', 'alternativas'] as const).map((m) => (
        <button key={m} type="button" role="tab" aria-selected={mode === m} className={'cmp-mode' + (mode === m ? ' cmp-mode-active' : '')} onClick={() => onMode(m)}>
          {MODE_LABEL[m]}
        </button>
      ))}
    </div>
  )
}

/** Formato de los artículos de un grupo: cuáles se conocen y cuáles faltan (confirmar lo que PEPA lee en el nombre, escribirlo o dejarlo para una compra posterior). */
function GroupFormats({ formats, actions, onError, fixing, setFixing }: { formats: MemberFormat[]; actions: CompareActions; onError: (m: string) => void; fixing: string | null; setFixing: (id: string | null) => void }) {
  const todo = formats.filter((f) => f.state !== 'confirmado')
  if (todo.length === 0) return null
  async function save(f: MemberFormat, pack: PackFormat) {
    try {
      if (!f.priceId) throw new Error('No se encuentra la compra para guardar el formato')
      await actions.setPack(f.priceId, pack)
      setFixing(null)
    } catch (err) {
      onError(errorMessage(err, 'No se pudo guardar el formato'))
    }
  }
  return (
    <div data-help-id="compare.formats" style={{ marginTop: 6 }}>
      <p className="muted" style={{ margin: '6px 0 2px', fontSize: 13 }}>
        Formato de los artículos: {formats.length - todo.length} de {formats.length} {formats.length === 1 ? 'conocido' : 'conocidos'} · para comparar por litro o kilo hace falta completar el resto (puedes hacerlo ahora o en una compra posterior)
      </p>
      {todo.map((f) => (
        <div key={f.productId} className="receipt-line-card" data-help-id="compare.unformatted">
          <span>
            <strong>{f.store}</strong> · {f.productName} · {eur(f.totalPrice)} · {shortDate(f.date)}
          </span>
          {f.note && (
            <p className="muted" style={{ margin: '2px 0', fontSize: 12 }}>
              {f.note}
            </p>
          )}
          {f.priceId &&
            (fixing === f.priceId ? (
              <PackEditor price={f.totalPrice} onSave={(pack) => void save(f, pack)} onCancel={() => setFixing(null)} />
            ) : (
              <div className="chip-row">
                {f.proposal && (
                  <button type="button" className="chip chip-active" onClick={() => void save(f, { ...(f.proposal as PackInput), source: 'nombre' })}>
                    ✓ Confirmar {describePack(f.proposal)}
                  </button>
                )}
                <button type="button" className="link-button" onClick={() => setFixing(f.priceId)}>
                  {f.proposal ? 'Cambiar formato' : 'Indicar formato'}
                </button>
              </div>
            ))}
        </div>
      ))}
    </div>
  )
}

function Row({
  row,
  group,
  icon,
  basis,
  provisional,
  reliable,
  editing,
  onToggleEdit,
  children,
}: {
  row: ComparisonRow
  group: ModeGroup
  /** Símbolo de la categoría delante del nombre (solo cuando la fila va sola en su tarjeta). */
  icon?: string
  basis: ModeGroup['result']['basis']
  provisional: boolean
  reliable: boolean
  editing: boolean
  onToggleEdit: () => void
  children?: React.ReactNode
}) {
  const showUnit = row.normalized != null && row.basis != null
  return (
    <div className={'cmp-row' + (row.cheapest ? ' cmp-row-best' : '')} data-help-id="compare.offer" data-row-state={row.state} data-origin={group.origin}>
      <div className="cmp-row-main">
        <span className="cmp-row-label" title={row.rawName}>
          {icon ? <span aria-hidden="true">{icon} </span> : null}
          {row.label}
        </span>
        <span className="cmp-row-unit">{showUnit ? <strong>{perUnit(row.normalized as number, row.basis as NonNullable<typeof row.basis>)}</strong> : <span className="muted">sin formato</span>}{row.cheapest ? ' 🏷️' : ''}</span>
      </div>
      <p className="cmp-row-sub muted">
        {row.store} · {row.packText} · paquete {eur(row.totalPrice)} · {shortDate(row.date)}
        {row.state === 'otra-unidad' ? ' · otra unidad: no se mezcla' : ''}
        {row.state === 'normalizada' && basis === 'ud' && !reliable ? ' · contenido por unidad sin confirmar' : ''}
        {row.cheapest ? (provisional ? ' · la más económica (provisional)' : ' · la más económica') : row.diffPct != null && row.diffPct > 0 ? ` · +${String(row.diffPct).replace('.', ',')} %` : ''}
        {row.sameAs.length > 0 ? ` · mismo producto que ${row.sameAs[0]}` : ''}
      </p>
      <button type="button" className="cmp-row-edit" aria-expanded={editing} aria-label={`Editar ${row.label}`} onClick={onToggleEdit}>
        {editing ? 'Cerrar' : 'Editar'}
      </button>
      {editing && children}
    </div>
  )
}

interface GroupCardProps {
  group: ModeGroup
  mode: CompareMode
  data: CompareDataset
  actions: CompareActions
  onNotice: (n: Notice) => void
  onError: (m: string) => void
  onPickGroup: (productId: string) => void
  guard: (fn: () => Promise<void>, fallback: string) => Promise<void>
}

function GroupCard({ group, mode, data, actions, onNotice, onError, onPickGroup, guard }: GroupCardProps) {
  const [all, setAll] = useState(false)
  const [manage, setManage] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [fixing, setFixing] = useState<string | null>(null)
  const [changingProduct, setChangingProduct] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const r = group.result
  const provisional = group.common.status === 'pending'
  const stores = new Set(group.rows.map((x) => x.store.toLowerCase())).size
  const rows = all ? group.rows : group.rows.slice(0, ROWS_SHOWN)
  const missing = group.formats.filter((f) => f.state !== 'confirmado').length
  const icon = group.classKey ? catalogClass(group.classKey)?.icon : undefined
  const productById = new Map(data.products.map((p) => [p.id, p]))
  // Un producto que PEPA reconoce y tiene una sola presentación no necesita cabecera ni explicaciones: es solo su fila (la lista se lee de un vistazo aunque haya muchos).
  const lone = group.virtual && group.rows.length === 1

  async function separate(productId: string) {
    const fromPepa = provisional
    if (fromPepa) await actions.separatePepa(productId)
    else await actions.unassign(productId)
    onNotice({ text: 'Artículo separado del grupo.', undo: () => actions.assign(productId, group.common.id, fromPepa ? 'pepa' : 'manual') })
  }

  async function removeCommon() {
    const ids = data.members.filter((m) => m.commonId === group.common.id).map((m) => m.productId)
    if (provisional) await actions.discardGroup(group.common.id, ids)
    else await actions.remove(group.common.id)
    setConfirmDelete(false)
    onNotice({
      text: `Grupo «${group.name}» eliminado. Los artículos y sus precios siguen ahí.`,
      undo: async () => {
        const again = await actions.createCommon(group.name)
        for (const id of ids) await actions.assign(id, again.id, 'manual')
      },
    })
  }

  return (
    <div className="card cmp-group" data-origin={group.origin} data-group-id={group.id} style={{ marginBottom: 8, padding: 8 }}>
      {!lone && (
        <>
      <div className="cmp-group-head">
        <strong className="cmp-group-name">
          {icon ? <span aria-hidden="true">{icon} </span> : null}
          {group.name}
        </strong>
        {provisional && <span className="cmp-badge">⏳ agrupado por PEPA</span>}
        {group.origin === 'comun' && !provisional && <span className="cmp-badge cmp-badge-quiet">grupo vuestro</span>}
      </div>
      <p className="cmp-group-sub muted">
        {group.rows.length} {group.rows.length === 1 ? 'presentación' : 'presentaciones'}
        {stores > 0 ? ` · ${stores} ${stores === 1 ? 'tienda' : 'tiendas'}` : ''} · {group.purchases} {group.purchases === 1 ? 'compra' : 'compras'}
        {mode === 'alternativas' ? ` · ${group.distinctProducts} ${group.distinctProducts === 1 ? 'producto' : 'productos distintos'}` : ''}
        {group.best && isComparable(group) ? ` · ${provisional ? 'más barata (provisional)' : 'más barata'}: ${group.best.store} ${perUnit(group.best.value, group.best.basis)}` : ''}
        {missing > 0 ? ` · ${missing} sin formato` : ''}
      </p>
        </>
      )}
      {rows.map((row) => (
        <Row key={row.key} row={row} group={group} icon={lone ? icon : undefined} basis={r.basis} provisional={provisional} reliable={r.reliable} editing={editing === row.key} onToggleEdit={() => setEditing(editing === row.key ? null : row.key)}>
          <div className="cmp-row-edit-panel">
            {row.priceId &&
              (fixing === row.priceId ? (
                <PackEditor
                  price={row.totalPrice}
                  onSave={(pack) =>
                    void guard(async () => {
                      await actions.setPack(row.priceId as string, pack)
                      setFixing(null)
                    }, 'No se pudo guardar el formato')
                  }
                  onCancel={() => setFixing(null)}
                />
              ) : (
                <div className="chip-row">
                  {group.formats.find((f) => f.productId === row.productId && f.proposal) && (
                    <button type="button" className="cmp-edit-btn primary" onClick={() => void guard(() => actions.setPack(row.priceId as string, { ...(group.formats.find((f) => f.productId === row.productId)?.proposal as PackInput), source: 'nombre' }), 'No se pudo guardar el formato')}>
                      ✓ Confirmar {describePack(group.formats.find((f) => f.productId === row.productId)?.proposal as PackInput)}
                    </button>
                  )}
                  <button type="button" className="cmp-edit-btn" onClick={() => setFixing(row.priceId)}>
                    {row.pack ? 'Cambiar formato' : 'Indicar formato'}
                  </button>
                </div>
              ))}
            <div className="chip-row">
              {actions.setCatalogKey && (
                <button type="button" className="cmp-edit-btn" onClick={() => setChangingProduct(row.productId)}>
                  Cambiar producto o variante
                </button>
              )}
              <button type="button" className="cmp-edit-btn" onClick={() => onPickGroup(row.productId)}>
                {group.origin === 'comun' ? 'Cambiar de grupo' : 'Agrupar con otro…'}
              </button>
              {group.origin === 'comun' && (
                <button type="button" className="cmp-edit-btn" onClick={() => void guard(() => separate(row.productId), 'No se pudo separar')}>
                  Separar
                </button>
              )}
            </div>
            <p className="muted" style={{ margin: '2px 0 0', fontSize: 11 }}>
              En el ticket: {row.rawName}. Editar no cambia el importe ni el nombre original.
            </p>
          </div>
        </Row>
      ))}
      {group.rows.length > ROWS_SHOWN && (
        <button type="button" className="cmp-more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? 'Ver menos' : `Ver las ${group.rows.length} presentaciones`}
        </button>
      )}
      {!lone && r.otherUnit.length > 0 && (
        <p className="muted" style={{ margin: '4px 0', fontSize: 12 }}>
          {r.otherUnit.length} {r.otherUnit.length === 1 ? 'presentación está' : 'presentaciones están'} en otra unidad y no se mezcla con el resto.
        </p>
      )}
      {!lone && r.note && group.rows.length > 1 && (
        <p className="muted" style={{ margin: '4px 0', fontSize: 12 }} role="note">
          {r.note}
        </p>
      )}

      {!lone && (
        <>
      <button type="button" className="cmp-more" aria-expanded={manage} onClick={() => setManage((v) => !v)}>
        {manage ? 'Ocultar opciones del grupo' : 'Opciones del grupo'}
      </button>
      {manage && (
        <div data-help-id="compare.group-options">
          {provisional && (
            <div className="receipt-line-card" data-help-id="compare.pending-banner">
              <p style={{ margin: '0 0 4px', fontSize: 13 }}>PEPA ha agrupado estos artículos porque parecen el mismo producto. Hasta que lo confirmes, la comparación es provisional.</p>
              <div className="chip-row">
                <button type="button" className="chip chip-active" onClick={() => void guard(async () => { await actions.confirmGroup(group.common.id); onNotice({ text: `Grupo «${group.name}» confirmado.` }) }, 'No se pudo confirmar')}>
                  ✓ Confirmar grupo
                </button>
                <button type="button" className="link-button" onClick={() => void guard(async () => { await actions.discardGroup(group.common.id, data.members.filter((m) => m.commonId === group.common.id).map((m) => m.productId)); onNotice({ text: `Grupo «${group.name}» descartado.` }) }, 'No se pudo descartar')}>
                  Descartar grupo
                </button>
              </div>
            </div>
          )}
          <GroupFormats formats={group.formats} actions={actions} onError={onError} fixing={fixing} setFixing={setFixing} />
          {!group.virtual && (
            <div className="chip-row" style={{ marginTop: 6 }}>
              {renaming != null ? (
                <>
                  <input type="text" value={renaming} maxLength={80} onChange={(e) => setRenaming(e.target.value)} aria-label="Nombre del producto común" style={{ fontSize: 16 }} />
                  <button type="button" className="chip" onClick={() => void guard(async () => { await actions.rename(group.common.id, renaming); setRenaming(null) }, 'No se pudo cambiar el nombre')}>
                    Guardar nombre
                  </button>
                </>
              ) : (
                <button type="button" className="cmp-edit-btn" onClick={() => setRenaming(group.name)}>
                  ✏️ Cambiar nombre
                </button>
              )}
              {confirmDelete ? (
                <button type="button" className="chip" onClick={() => void guard(removeCommon, 'No se pudo eliminar')}>
                  Sí, eliminar el grupo (los artículos y precios se quedan)
                </button>
              ) : (
                <button type="button" className="cmp-edit-btn" onClick={() => setConfirmDelete(true)}>
                  Eliminar grupo
                </button>
              )}
            </div>
          )}
          {group.virtual && (
            <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
              {group.origin === 'identidad' ? 'PEPA ha reconocido estos artículos como el mismo producto sin que hiciera falta emparejarlos. Si quieres un grupo propio, usa «Agrupar con otro…» en cualquier fila.' : 'Una familia de alternativas se calcula sola con lo que PEPA reconoce con seguridad.'}
            </p>
          )}
        </div>
      )}
        </>
      )}
      {changingProduct && actions.setCatalogKey && (
        <CatalogPicker
          title="Cambiar producto o variante"
          raw={productById.get(changingProduct)?.displayName}
          onClose={() => setChangingProduct(null)}
          onPick={(key) => {
            const id = changingProduct
            setChangingProduct(null)
            void guard(async () => {
              await actions.setCatalogKey?.(id, key)
              onNotice({ text: 'Producto actualizado. El nombre y las compras del ticket no se han tocado.' })
            }, 'No se pudo cambiar el producto')
          }}
        />
      )}
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
  const { mode, sort, setMode, setSort } = useCompareViewPrefs()
  const [query, setQuery] = useState('')
  const [classKey, setClassKey] = useState('')
  const [onlyComparable, setOnlyComparable] = useState(false)

  const ctx = useMemo(() => relationContext(data), [data])
  const groups = useMemo(
    () => buildComparisonGroups(mode, { products: data.products, prices: data.prices, commons: data.commons, members: data.members, skipped: data.skipped, ctx }),
    [mode, data.products, data.prices, data.commons, data.members, data.skipped, ctx],
  )
  const classes = useMemo(() => groupClassOptions(groups), [groups])
  const shown = useMemo(() => sortGroups(filterGroups(groups, { query, classKey: classKey || null, onlyComparable }), sort), [groups, query, classKey, onlyComparable, sort])

  async function guard(fn: () => Promise<void>, fallback: string) {
    try {
      await fn()
    } catch (err) {
      onError(errorMessage(err, fallback))
    }
  }

  return (
    <div data-help-id="compare.results">
      <ModeTabs mode={mode} onMode={(m) => { setMode(m); setClassKey('') }} />
      <p className="muted cmp-mode-hint">{MODE_HINT[mode]}</p>
      <div className="cmp-toolbar" data-help-id="compare.toolbar">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar producto, marca o tienda…" aria-label="Buscar en los resultados" />
        <div className="cmp-toolbar-row">
          <label className="cmp-select">
            <span>Orden</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as CompareSort)} aria-label="Ordenar los resultados">
              {COMPARE_SORTS.map((s) => (
                <option key={s} value={s}>
                  {SORT_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="cmp-select">
            <span>Categoría</span>
            <select value={classKey} onChange={(e) => setClassKey(e.target.value)} aria-label="Filtrar por categoría">
              <option value="">Todas</option>
              {classes.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name} ({c.count})
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="button" className={onlyComparable ? 'chip chip-active' : 'chip'} aria-pressed={onlyComparable} onClick={() => setOnlyComparable((v) => !v)}>
          Solo con varias opciones
        </button>
      </div>
      {groups.length === 0 && (
        <div className="card" data-help-id="compare.empty">
          {mode === 'identicos' ? (
            <>
              <p style={{ margin: 0 }}>Todavía no hay productos idénticos que comparar.</p>
              <p className="muted" style={{ margin: '4px 0 0' }}>
                Cuando guardes tickets, PEPA reconoce sola los productos que se repiten y los enseña aquí. Los que no reconoce con seguridad los puedes emparejar a mano en «Emparejar».
              </p>
            </>
          ) : (
            <>
              <p style={{ margin: 0 }}>Todavía no hay alternativas que comparar.</p>
              <p className="muted" style={{ margin: '4px 0 0' }}>Aparecerán cuando haya compras de productos reconocidos con seguridad (cervezas, refrescos, leches…) con precio.</p>
            </>
          )}
        </div>
      )}
      {groups.length > 0 && shown.length === 0 && <p className="muted">Ningún resultado coincide con la búsqueda o los filtros.</p>}
      {groups.length > 0 && (
        <p className="muted cmp-note" data-help-id="compare.note">
          Son precios que habéis pagado vosotros, con su fecha: no son ofertas de hoy. Cada fila enseña el precio del paquete y, aparte, el precio por litro, kilo o unidad, de menor a mayor: una presentación grande puede salir más barata por unidad pero exigir pagar más de una vez.
          {mode === 'alternativas' ? ' Son productos distintos: aquí se comparan, no se mezclan sus historiales.' : ''}
        </p>
      )}
      {groups.length > 0 && (
        <p className="muted cmp-count" role="status">
          {shown.length === groups.length ? `${groups.length} ${groups.length === 1 ? 'grupo' : 'grupos'}` : `${shown.length} de ${groups.length} grupos`}
        </p>
      )}
      {shown.map((g, i) => {
        const heading = sort === 'categoria' && (i === 0 || shown[i - 1].className !== g.className)
        return (
          <div key={g.id}>
            {heading && (
              <h3 className="cmp-category" data-testid="cmp-category">
                {g.classKey ? `${catalogClass(g.classKey)?.icon ?? ''} ` : ''}
                {g.className}
              </h3>
            )}
            <GroupCard group={g} mode={mode} data={data} actions={actions} onNotice={onNotice} onError={onError} onPickGroup={onPickGroup} guard={guard} />
          </div>
        )
      })}
    </div>
  )
}
