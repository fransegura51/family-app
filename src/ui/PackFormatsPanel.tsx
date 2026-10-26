// Formato del envase al registrar una compra (COMP-2): la persona tiene los productos delante y puede decir cuánto contiene cada uno (6 latas × 330 ml).
// Todo es OPCIONAL y no bloquea el guardado. Solo se pregunta lo que sirve para comparar (el producto ya se compró en otra tienda); lo que el nombre o las compras
// anteriores ya dicen con seguridad se aplica solo, y el resto queda en un apartado plegado por si se quiere completar.
import { useMemo, useState } from 'react'
import { describePack, otherStorePrices, parsePackInput, resolveLinePack, unitPriceText, PACK_SOURCE_LABELS, needsAnswer, type DraftPackLine, type PackFormat, type PackHistoryLine } from '@/domain/packFormat'
import { PACK_UNITS } from '@/domain/productSize'
import { toCmpPrice, toCmpProduct } from '@/domain/priceComparisonAdapters'
import type { Product, ProductPrice } from '@/domain/types'

const eur = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
const shortDate = (d: string) => {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

export const PACK_EXPLANATION = 'Para comparar bien los precios entre tiendas, necesitamos saber cuánto contiene cada envase. Si lo completas ahora, PEPA lo recordará para futuras compras.'

/** Editor compacto de un formato: nº de envases × cantidad de cada uno + unidad. Muestra el total y el precio por kg / l / ud al momento. */
export function PackEditor({ price, initial, onSave, onCancel, label = 'Guardar formato' }: { price: number; initial?: PackFormat | null; onSave: (pack: PackFormat) => void; onCancel?: () => void; label?: string }) {
  const [count, setCount] = useState(initial ? String(initial.count) : '1')
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [unit, setUnit] = useState<string>(initial?.unit ?? 'g')
  const pack = parsePackInput(count, amount, unit)
  const per = pack ? unitPriceText(price, pack) : null
  return (
    <div style={{ marginTop: 4 }}>
      <div className="inline-fields" style={{ alignItems: 'center' }}>
        <input type="number" min={1} step="any" inputMode="decimal" style={{ width: 64 }} value={count} onChange={(e) => setCount(e.target.value)} aria-label="Número de envases o unidades" />
        <span aria-hidden="true">×</span>
        <input type="number" min={0} step="any" inputMode="decimal" style={{ width: 84 }} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Cantidad" aria-label="Cantidad de cada envase" />
        <select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unidad del envase">
          {PACK_UNITS.map((u) => (
            <option key={u} value={u}>
              {u === 'ud' ? 'unidades' : u}
            </option>
          ))}
        </select>
      </div>
      {pack && (
        <p className="muted" style={{ margin: '2px 0', fontSize: 12 }}>
          {describePack(pack)}
          {per ? ` · ${per}` : ''}
        </p>
      )}
      <div className="form-actions" style={{ marginTop: 4 }}>
        <button type="button" disabled={!pack} onClick={() => pack && onSave(pack)}>
          {label}
        </button>
        {onCancel && (
          <button type="button" className="link-button" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </div>
  )
}

export interface PanelLine extends DraftPackLine {
  quantity: string
}

interface Props {
  lines: readonly PanelLine[]
  store: string
  products: readonly Product[]
  prices: readonly ProductPrice[]
  productIdFor: (name: string) => string | null
  onPack: (index: number, pack: PackFormat | null | undefined) => void
  /** Corrige el formato de una compra anterior (otra tienda) cuyo formato falta. */
  onFixPast?: (priceId: string, pack: PackFormat) => Promise<void> | void
}

export function PackFormatsPanel({ lines, store, products, prices, productIdFor, onPack, onFixPast }: Props) {
  const [open, setOpen] = useState(false)
  const [showOthers, setShowOthers] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const [fixing, setFixing] = useState<string | null>(null)

  const cmpProducts = useMemo(() => products.map(toCmpProduct), [products])
  const cmpPrices = useMemo(() => prices.map(toCmpPrice), [prices])
  const historyByProduct = useMemo(() => {
    const m = new Map<string, PackHistoryLine[]>()
    for (const p of prices) {
      const list = m.get(p.productId) ?? []
      list.push({ price: p.price, pack: p.pack ?? null, recordedDate: p.recordedDate })
      m.set(p.productId, list)
    }
    return m
  }, [prices])

  const rows = useMemo(
    () =>
      lines
        .map((line, index) => {
          if (!line.name.trim() || !(Number(line.unitPrice) > 0)) return null
          const pid = productIdFor(line.name)
          const resolved = resolveLinePack(line, pid ? (historyByProduct.get(pid) ?? []) : [])
          if (resolved.status.kind === 'peso') return null
          const target = pid ? (cmpProducts.find((p) => p.id === pid) ?? null) : null
          const others = needsAnswer(resolved.status) || line.pack !== undefined ? otherStorePrices(target, store, cmpProducts, cmpPrices) : []
          return { line, index, ...resolved, others }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null),
    [lines, store, productIdFor, historyByProduct, cmpProducts, cmpPrices],
  )

  const auto = rows.filter((r) => (r.status.kind === 'nombre' || r.status.kind === 'recordado') && r.line.pack === undefined)
  const ask = rows.filter((r) => needsAnswer(r.status) && r.line.pack === undefined && r.others.length > 0)
  const decided = rows.filter((r) => r.line.pack !== undefined && r.line.pack !== null)
  const optional = rows.filter((r) => needsAnswer(r.status) && r.line.pack === undefined && r.others.length === 0)
  if (rows.length === 0) return null
  const pending = ask.length

  function renderRow(r: (typeof rows)[number], withOthers: boolean) {
    const price = Number(r.line.unitPrice)
    const editingThis = editing === r.index
    return (
      <div key={r.index} className="receipt-line-card" data-help-id="shopping.pack-row">
        <strong style={{ fontSize: 14 }}>{r.line.name}</strong> <span className="muted">· {eur(price)}</span>
        {withOthers &&
          r.others.slice(0, 2).map((o) => (
            <p key={o.store} className="muted" style={{ margin: '2px 0', fontSize: 12 }}>
              Antes en {o.store} ({shortDate(o.date)}): {eur(o.price)}
              {o.pack ? ` · ${describePack(o.pack)}` : o.normalized.exact ? '' : ' · sin formato'}
            </p>
          ))}
        {r.status.kind === 'confirmar' && !editingThis && (
          <>
            <p style={{ margin: '4px 0' }}>{r.status.reason}</p>
            <div className="chip-row">
              <button type="button" className="chip" onClick={() => onPack(r.index, { ...(r.status as { pack: PackFormat }).pack, source: 'recordado' })}>
                Sí, el mismo
              </button>
              <button type="button" className="chip" onClick={() => setEditing(r.index)}>
                Cambiar
              </button>
              <button type="button" className="chip" onClick={() => onPack(r.index, null)}>
                Ahora no
              </button>
            </div>
          </>
        )}
        {r.status.kind === 'falta' && !editingThis && (
          <div className="chip-row" style={{ marginTop: 4 }}>
            <button type="button" className="chip" onClick={() => setEditing(r.index)}>
              Indicar cuánto contiene
            </button>
            <button type="button" className="chip" onClick={() => onPack(r.index, null)}>
              Ahora no
            </button>
          </div>
        )}
        {editingThis && (
          <PackEditor
            price={price}
            initial={r.line.pack ?? (r.status.kind === 'confirmar' ? r.status.pack : null)}
            onSave={(pack) => {
              onPack(r.index, pack)
              setEditing(null)
            }}
            onCancel={() => setEditing(null)}
          />
        )}
        {withOthers &&
          onFixPast &&
          r.others
            .filter((o) => !o.normalized.exact && o.priceId)
            .slice(0, 1)
            .map((o) => (
              <div key={`fix-${o.priceId}`} style={{ marginTop: 4 }}>
                {fixing === o.priceId ? (
                  <>
                    <p className="muted" style={{ margin: 0, fontSize: 12 }}>
                      ¿Cuánto contenía lo que compraste en {o.store}?
                    </p>
                    <PackEditor price={o.price} onSave={(pack) => void Promise.resolve(onFixPast(o.priceId as string, pack)).then(() => setFixing(null))} onCancel={() => setFixing(null)} />
                  </>
                ) : (
                  <button type="button" className="link-button" style={{ fontSize: 12, padding: 0 }} onClick={() => setFixing(o.priceId)}>
                    Indicar el formato de la compra de {o.store}
                  </button>
                )}
              </div>
            ))}
      </div>
    )
  }

  return (
    <div style={{ marginTop: 8 }} data-help-id="shopping.pack-formats">
      <button type="button" className="link-button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        📏 Comparar precios entre tiendas{pending > 0 ? ` · ${pending} ${pending === 1 ? 'producto' : 'productos'} por completar` : ''} {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="card" style={{ marginTop: 6, padding: 8 }}>
          <p className="muted" style={{ margin: '0 0 6px', fontSize: 13 }}>{PACK_EXPLANATION}</p>
          {ask.length > 0 ? ask.slice(0, 8).map((r) => renderRow(r, true)) : <p className="muted" style={{ margin: '0 0 6px' }}>Nada que preguntar ahora: ninguno de estos productos se ha comprado en otra tienda.</p>}
          {ask.length > 8 && <p className="muted" style={{ margin: 0, fontSize: 12 }}>Y {ask.length - 8} más. Los demás se pueden completar luego desde el producto.</p>}
          {decided.length > 0 && (
            <ul className="muted" style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12 }}>
              {decided.map((r) => (
                <li key={r.index}>
                  {r.line.name}: {describePack(r.line.pack as PackFormat)}
                  {unitPriceText(Number(r.line.unitPrice), r.line.pack as PackFormat) ? ` · ${unitPriceText(Number(r.line.unitPrice), r.line.pack as PackFormat)}` : ''}
                  {' '}
                  <button type="button" className="link-button" style={{ fontSize: 12, padding: 0 }} onClick={() => onPack(r.index, undefined)}>
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}
          {auto.length > 0 && (
            <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
              ✓ {auto.length} {auto.length === 1 ? 'formato reconocido' : 'formatos reconocidos'} solos ({auto.slice(0, 3).map((r) => `${r.line.name}: ${describePack((r.status as { pack: PackFormat }).pack)} — ${PACK_SOURCE_LABELS[(r.status as { pack: PackFormat }).pack.source]}`).join('; ')}
              {auto.length > 3 ? '…' : ''}).
            </p>
          )}
          {optional.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <button type="button" className="link-button" style={{ fontSize: 12, padding: 0 }} aria-expanded={showOthers} onClick={() => setShowOthers((v) => !v)}>
                Completar otros productos (opcional, {optional.length}) {showOthers ? '▾' : '▸'}
              </button>
              {showOthers && optional.slice(0, 30).map((r) => renderRow(r, false))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
