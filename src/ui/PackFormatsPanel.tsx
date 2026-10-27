// Formato del envase al registrar una compra (COMP-2/COMP-3): la persona tiene los productos delante y puede decir cuánto contiene cada uno (6 latas × 330 ml), a mano o
// fotografiando el envase. Todo es OPCIONAL y no bloquea el guardado. Cada línea lleva un acceso discreto; el apartado plegado pregunta primero lo que sirve para comparar
// (el producto ya se compró en otra tienda), reconoce solo lo que el nombre o las compras anteriores dicen con seguridad y permite completar TODOS los artículos del ticket.
import { useMemo, useRef, useState } from 'react'
import { describePack, otherStorePrices, parsePackInput, resolveLinePack, unitPriceText, PACK_SOURCE_LABELS, needsAnswer, type DraftPackLine, type PackFormat, type PackHistoryLine } from '@/domain/packFormat'
import { suggestionFromReading, type PackPhotoReading } from '@/domain/packPhoto'
import { toCmpPrice, toCmpProduct } from '@/domain/priceComparisonAdapters'
import { PACK_UNITS } from '@/domain/productSize'
import type { Product, ProductPrice } from '@/domain/types'
import { MAX_PACKAGE_PHOTOS, analyzePackagePhotos } from '@/services/packagePhoto'
import { FileSourceSheet } from '@/ui/FileOrPdfPicker'

const eur = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
const shortDate = (d: string) => {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

export const PACK_EXPLANATION = 'Estos datos nos ayudan a comparar correctamente los precios entre tiendas, incluso cuando compras formatos diferentes.'

/**
 * Editor compacto de un formato: nº de envases × cantidad de cada uno + unidad. Muestra el total y el precio por kg / l / ud al momento. Con «Fotografiar envase» se
 * rellena desde la etiqueta (una a tres fotos, que NO se guardan): siempre se revisa y se pulsa «Guardar formato».
 */
export function PackEditor({
  price,
  initial,
  onSave,
  onCancel,
  label = 'Guardar formato',
  allowPhoto = true,
  analyze = analyzePackagePhotos,
  onReading,
}: {
  price: number
  initial?: PackFormat | null
  onSave: (pack: PackFormat) => void
  onCancel?: () => void
  label?: string
  allowPhoto?: boolean
  analyze?: (files: File[]) => Promise<PackPhotoReading>
  /** Lo que se lee de la foto (nombre, marca, código de barras): solo ayuda, para guardarlo aparte si la persona confirma. */
  onReading?: (reading: PackPhotoReading) => void
}) {
  const [count, setCount] = useState(initial ? String(initial.count) : '1')
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [unit, setUnit] = useState<string>(initial?.unit ?? 'g')
  const [photoState, setPhotoState] = useState<{ busy: boolean; message: string | null; error: boolean }>({ busy: false, message: null, error: false })
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [basket, setBasket] = useState<File[]>([])
  const pack = parsePackInput(count, amount, unit)
  const per = pack ? unitPriceText(price, pack) : null

  async function read(files: File[]) {
    if (files.length === 0) return
    setPhotoState({ busy: true, message: null, error: false })
    try {
      const reading = await analyze(files)
      const s = suggestionFromReading(reading)
      if (s.fill) {
        setCount(s.fill.count)
        setAmount(s.fill.amount)
        setUnit(s.fill.unit)
      }
      onReading?.(reading)
      setBasket([])
      setPhotoState({ busy: false, message: s.message, error: s.fill == null })
    } catch (err) {
      setPhotoState({ busy: false, message: err instanceof Error ? err.message : 'No se pudo leer el envase. Escribe el formato a mano.', error: true })
    }
  }

  // Cámara, galería y archivos entregan aquí sus fotos (hasta MAX_PACKAGE_PHOTOS por lectura). Con una sola foto se espera a que la persona decida si añade otra (frontal y
  // etiqueta); con varias a la vez, o al completar el máximo, se lee sin más.
  function handleFiles(list: FileList | null, input: HTMLInputElement | null) {
    const picked = [...(list ?? [])].filter((f) => f.type.startsWith('image/') || /.(jpe?g|png|webp|heic|heif)$/i.test(f.name))
    if (input) input.value = ''
    if (picked.length === 0) return
    const next = [...basket, ...picked].slice(0, MAX_PACKAGE_PHOTOS)
    setBasket(next)
    setPhotoState({ busy: false, message: null, error: false })
    if (picked.length > 1 || next.length >= MAX_PACKAGE_PHOTOS) void read(next)
  }

  return (
    <div style={{ marginTop: 4 }}>
      <div className="inline-fields pack-editor-fields" style={{ alignItems: 'flex-end' }} data-help-id="shopping.pack-fields">
        <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, gap: 2 }}>
          N.º de envases
          <input type="number" min={1} step="any" inputMode="decimal" style={{ width: 72 }} value={count} onChange={(e) => setCount(e.target.value)} aria-label="Número de envases o unidades" />
        </label>
        <span aria-hidden="true" style={{ paddingBottom: 12 }}>
          ×
        </span>
        <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, gap: 2 }}>
          Cantidad por envase
          <input type="number" min={0} step="any" inputMode="decimal" style={{ width: 104 }} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Ej. 330" aria-label="Cantidad de cada envase" />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, gap: 2 }}>
          Unidad de medida
          <select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unidad del envase">
            {PACK_UNITS.map((u) => (
              <option key={u} value={u}>
                {u === 'ud' ? 'unidades' : u}
              </option>
            ))}
          </select>
        </label>
      </div>
      {pack && (
        <p className="muted" style={{ margin: '2px 0', fontSize: 12 }}>
          {describePack(pack)}
          {per ? ` · ${per}` : ''}
        </p>
      )}
      {allowPhoto && (
        <div style={{ margin: '2px 0' }}>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden aria-label="Hacer foto del envase" onChange={(e) => handleFiles(e.target.files, e.target)} />
          <input ref={galleryRef} type="file" accept="image/*" multiple hidden aria-label="Fotos del envase" data-help-id="shopping.pack-photo-input" onChange={(e) => handleFiles(e.target.files, e.target)} />
          <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.webp,.heic,.heif" hidden aria-label="Archivo de imagen del envase" onChange={(e) => handleFiles(e.target.files, e.target)} />
          <button type="button" className="link-button" style={{ fontSize: 13, padding: 0 }} disabled={photoState.busy} data-help-id="shopping.pack-photo" onClick={() => setSheetOpen(true)}>
            {photoState.busy ? 'Leyendo el envase…' : basket.length > 0 ? '📷 Añadir otra foto' : '📷 Fotografiar envase'}
          </button>
          {basket.length > 0 && !photoState.busy && (
            <span style={{ fontSize: 12, marginLeft: 8 }}>
              {basket.length === 1 ? '1 foto lista' : `${basket.length} fotos listas`} ·{' '}
              <button type="button" className="link-button" style={{ fontSize: 12, padding: 0 }} onClick={() => void read(basket)}>
                Leer envase
              </button>{' '}
              ·{' '}
              <button type="button" className="link-button" style={{ fontSize: 12, padding: 0 }} onClick={() => setBasket([])}>
                Quitar fotos
              </button>
            </span>
          )}
          {photoState.message && (
            <p className={photoState.error ? 'error' : 'muted'} role="status" style={{ margin: '2px 0', fontSize: 12 }}>
              {photoState.message}
            </p>
          )}
          {!photoState.message && !photoState.busy && basket.length === 0 && (
            <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>
              hasta {MAX_PACKAGE_PHOTOS} fotos (frontal y etiqueta); no se guardan
            </span>
          )}
          {sheetOpen && (
            <FileSourceSheet
              title="Fotografiar envase"
              fileLabel="📁 Elegir archivo"
              onPickCamera={() => {
                setSheetOpen(false)
                cameraRef.current?.click()
              }}
              onPickGallery={() => {
                setSheetOpen(false)
                galleryRef.current?.click()
              }}
              onPickPdf={() => {
                setSheetOpen(false)
                fileRef.current?.click()
              }}
              onCancel={() => setSheetOpen(false)}
            />
          )}
        </div>
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

/** Acceso discreto en cada línea del ticket: «📏 Formato del envase» o el formato ya conocido. Abre el editor justo debajo de la línea. */
export function LineFormatControl({
  line,
  history,
  onPack,
  onReading,
  analyze,
}: {
  line: PanelLine
  history: readonly PackHistoryLine[]
  onPack: (pack: PackFormat | null | undefined) => void
  onReading?: (reading: PackPhotoReading) => void
  analyze?: (files: File[]) => Promise<PackPhotoReading>
}) {
  const [open, setOpen] = useState(false)
  const price = Number(line.unitPrice)
  if (!line.name.trim() || !(price > 0)) return null
  const r = resolveLinePack(line, history)
  if (r.status.kind === 'peso') return null
  const known = r.pack
  return (
    <div style={{ marginTop: 2 }} data-help-id="shopping.pack-line">
      <button type="button" className="link-button" style={{ fontSize: 12, padding: 0 }} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        📏 {known ? `${describePack(known)}${known.source === 'nombre' || known.source === 'recordado' ? ' ✓' : ''}` : 'Formato del envase'}
      </button>
      {open && (
        <div className="card" style={{ marginTop: 4, padding: 8 }}>
          <p className="muted" style={{ margin: '0 0 4px', fontSize: 12 }}>{PACK_EXPLANATION}</p>
          {known && <p className="muted" style={{ margin: '0 0 4px', fontSize: 12 }}>{PACK_SOURCE_LABELS[known.source][0].toUpperCase() + PACK_SOURCE_LABELS[known.source].slice(1)}.</p>}
          {r.status.kind === 'confirmar' && line.pack === undefined && <p style={{ margin: '0 0 4px' }}>{r.status.reason}</p>}
          <PackEditor
            price={price}
            initial={known ?? (r.status.kind === 'confirmar' ? r.status.pack : null)}
            analyze={analyze}
            onReading={onReading}
            onSave={(pack) => {
              onPack(pack)
              setOpen(false)
            }}
            onCancel={() => setOpen(false)}
          />
          <div className="chip-row" style={{ marginTop: 4 }}>
            <button type="button" className="link-button" style={{ fontSize: 12, padding: 0 }} onClick={() => { onPack(null); setOpen(false) }}>
              Ahora no
            </button>
            {line.pack !== undefined && (
              <button type="button" className="link-button" style={{ fontSize: 12, padding: 0 }} onClick={() => { onPack(undefined); setOpen(false) }}>
                Quitar lo indicado
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
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
  onReading?: (index: number, reading: PackPhotoReading) => void
  analyze?: (files: File[]) => Promise<PackPhotoReading>
  /** Producto común de cada artículo agrupado: si el artículo está en un grupo con formatos por completar, se pregunta aunque el grupo sea de la misma tienda. */
  commonOf?: ReadonlyMap<string, string>
}

export function PackFormatsPanel({ lines, store, products, prices, productIdFor, onPack, onFixPast, onReading, analyze, commonOf }: Props) {
  const [open, setOpen] = useState(false)
  const [all, setAll] = useState(false)
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
          const others = otherStorePrices(target, store, cmpProducts, cmpPrices, { commonOf })
          const inGroup = !!pid && !!commonOf?.has(pid)
          return { line, index, ...resolved, others, inGroup }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null),
    [lines, store, productIdFor, historyByProduct, cmpProducts, cmpPrices, commonOf],
  )
  if (rows.length === 0) return null

  const missing = rows.filter((r) => r.pack == null).length
  // Lo que más sirve para comparar: productos que ya se compraron en otra tienda y siguen sin formato.
  const ask = rows.filter((r) => needsAnswer(r.status) && r.line.pack === undefined && (r.others.length > 0 || r.inGroup))
  const recognized = rows.filter((r) => (r.status.kind === 'nombre' || r.status.kind === 'recordado') && r.line.pack === undefined)

  function renderEditor(r: (typeof rows)[number]) {
    return (
      <PackEditor
        price={Number(r.line.unitPrice)}
        initial={r.pack ?? (r.status.kind === 'confirmar' ? r.status.pack : null)}
        analyze={analyze}
        onReading={(reading) => onReading?.(r.index, reading)}
        onSave={(pack) => {
          onPack(r.index, pack)
          setEditing(null)
        }}
        onCancel={() => setEditing(null)}
      />
    )
  }

  function renderPriority(r: (typeof rows)[number]) {
    const price = Number(r.line.unitPrice)
    const editingThis = editing === r.index
    return (
      <div key={r.index} className="receipt-line-card" data-help-id="shopping.pack-row">
        <strong style={{ fontSize: 14 }}>{r.line.name}</strong> <span className="muted">· {eur(price)}</span>
        {r.others.slice(0, 2).map((o) => (
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
        {editingThis && renderEditor(r)}
        {onFixPast &&
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
                    <PackEditor price={o.price} allowPhoto={false} onSave={(pack) => void Promise.resolve(onFixPast(o.priceId as string, pack)).then(() => setFixing(null))} onCancel={() => setFixing(null)} />
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
        📏 Formatos del envase{missing > 0 ? ` · ${missing} sin indicar` : ' · todos indicados'} {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="card" style={{ marginTop: 6, padding: 8 }}>
          <p className="muted" style={{ margin: '0 0 6px', fontSize: 13 }}>{PACK_EXPLANATION} Es opcional: puedes dejarlo («Ahora no») y completarlo otro día desde el producto.</p>
          {ask.length > 0 && (
            <>
              <p style={{ margin: '0 0 2px', fontSize: 13 }}>
                <strong>Útiles para comparar</strong> (ya los comprasteis en otra tienda):
              </p>
              {ask.slice(0, 8).map(renderPriority)}
            </>
          )}
          {recognized.length > 0 && (
            <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
              ✓ {recognized.length} {recognized.length === 1 ? 'formato reconocido' : 'formatos reconocidos'} solos ({recognized.slice(0, 3).map((r) => `${r.line.name}: ${describePack(r.pack as PackFormat)} — ${PACK_SOURCE_LABELS[(r.pack as PackFormat).source]}`).join('; ')}
              {recognized.length > 3 ? '…' : ''}).
            </p>
          )}
          <button type="button" className="chip" style={{ marginTop: 8 }} aria-expanded={all} data-help-id="shopping.pack-all" onClick={() => setAll((v) => !v)}>
            Completar formatos de todos los artículos {all ? '▾' : '▸'}
          </button>
          {all && (
            <div style={{ marginTop: 6 }}>
              {rows.map((r) => (
                <div key={r.index} className="receipt-line-card" data-help-id="shopping.pack-all-row">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span>{r.line.name}</span>
                    <span className="muted" style={{ whiteSpace: 'nowrap' }}>{eur(Number(r.line.unitPrice))}</span>
                  </div>
                  {editing === r.index ? (
                    renderEditor(r)
                  ) : (
                    <button type="button" className="link-button" style={{ fontSize: 12, padding: 0 }} onClick={() => setEditing(r.index)}>
                      {r.pack ? `✓ ${describePack(r.pack)} · cambiar` : 'Indicar formato'}
                    </button>
                  )}
                </div>
              ))}
              <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                Los que no completes se guardan igual, sin formato.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
