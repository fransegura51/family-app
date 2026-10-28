// Selector de producto del catálogo maestro, reutilizable: buscar (nombre, sinónimo, abreviatura, erratas), explorar por categorías sin escribir, elegir la variante del
// producto principal sin repetir la búsqueda y, si no existe, pedir un producto nuevo. Solo elige: quien lo usa decide qué hacer con la clave elegida.
// Pensado para el móvil: hoja pegada arriba (el teclado nunca tapa el campo ni los resultados), listas cortas con «Ver más» y controles de 44 px.
import { useMemo, useState } from 'react'
import { browseCategory, catalogCategories, catalogHitByKey, searchCatalog, type CatalogHit } from '@/domain/catalog/catalogSearch'
import { variantsOf } from '@/domain/catalog/variants'

const PAGE = 6

export function CatalogPicker({
  title = 'Elige el producto',
  raw,
  initialQuery = '',
  initialEntryKey,
  onPick,
  onClose,
  onRequestProduct,
}: {
  title?: string
  /** Texto original del ticket, para tenerlo a la vista mientras se elige. */
  raw?: string
  initialQuery?: string
  /** Producto principal ya identificado: se abre directamente en sus variantes. */
  initialEntryKey?: string
  onPick: (key: string) => void
  onClose: () => void
  /** Si existe, se ofrece «Solicitar nuevo producto» (con lo que se buscó). */
  onRequestProduct?: (searched: string) => void
}) {
  const [query, setQuery] = useState(initialQuery)
  const [category, setCategory] = useState<string | null>(null)
  const [entry, setEntry] = useState<CatalogHit | null>(() => (initialEntryKey ? (catalogHitByKey(initialEntryKey) ?? null) : null))
  const [shown, setShown] = useState(PAGE)

  const hits = useMemo(() => (query.trim() ? searchCatalog(query, 40) : []), [query])
  const categories = useMemo(() => catalogCategories(), [])
  const browse = useMemo(() => (category ? browseCategory(category) : []), [category])
  const variants = useMemo(() => (entry ? variantsOf(entry.entryKey) : []), [entry])

  function choose(hit: CatalogHit) {
    // Un producto con variantes (leche, pañales…) pregunta cuál; una variante o un producto sin variantes se elige directamente.
    if (!hit.variant && variantsOf(hit.entryKey).length > 0) {
      setEntry(hit)
      return
    }
    onPick(hit.key)
  }

  const base = entry ? (catalogHitByKey(entry.entryKey) ?? entry) : null

  return (
    <div className="modal-overlay catalog-picker-overlay" onClick={onClose}>
      <div className="modal-sheet catalog-picker-sheet" role="dialog" aria-label={title} data-help-id="catalog.picker" onClick={(e) => e.stopPropagation()}>
        <div className="catalog-picker-head">
          <h2 className="section-title" style={{ margin: 0 }}>
            {title}
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        {raw && (
          <p className="muted catalog-picker-raw">
            Ticket: <strong>{raw}</strong>
          </p>
        )}

        {base ? (
          <div className="catalog-picker-body">
            <button type="button" className="catalog-picker-back" onClick={() => setEntry(null)}>
              ← Volver
            </button>
            <p style={{ margin: '4px 0 8px' }}>
              ¿Qué tipo de <strong>{base.name}</strong> es?
            </p>
            <div className="catalog-picker-chips" role="group" aria-label={`Variantes de ${base.name}`}>
              {variants.map((v) => (
                <button key={v.key} type="button" className="chip catalog-picker-chip" onClick={() => onPick(v.key)}>
                  {v.label}
                </button>
              ))}
            </div>
            <button type="button" className="catalog-picker-plain" onClick={() => onPick(base.entryKey)}>
              Dejarlo como «{base.name}» (sin especificar)
            </button>
          </div>
        ) : (
          <>
            <input
              type="search"
              className="catalog-picker-input"
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setShown(PAGE)
                setCategory(null)
              }}
              placeholder="Busca: leche, pañales, bolsa, cerveza…"
              aria-label="Buscar el producto"
              autoComplete="off"
              enterKeyHint="search"
            />
            <div className="catalog-picker-body">
              {query.trim() ? (
                <>
                  {hits.slice(0, shown).map((h) => (
                    <button key={h.key} type="button" className="catalog-picker-hit" onClick={() => choose(h)}>
                      <strong>{h.name}</strong>
                      <span className="muted">{h.variant ? `Variante de ${catalogHitByKey(h.entryKey)?.name ?? ''} · ` : ''}{h.className}</span>
                    </button>
                  ))}
                  {hits.length > shown && (
                    <button type="button" className="catalog-picker-more" onClick={() => setShown((n) => n + PAGE)}>
                      Ver más ({hits.length - shown})
                    </button>
                  )}
                  {hits.length === 0 && <p className="muted catalog-picker-empty">No hay un producto así en el catálogo.</p>}
                </>
              ) : category ? (
                <>
                  <button type="button" className="catalog-picker-back" onClick={() => setCategory(null)}>
                    ← Categorías
                  </button>
                  {browse.map((g) => (
                    <div key={g.sub}>
                      <p className="catalog-picker-sub">{g.sub}</p>
                      {g.items.map((h) => (
                        <button key={h.key} type="button" className="catalog-picker-hit catalog-picker-hit-compact" onClick={() => choose(h)}>
                          <strong>{h.name}</strong>
                        </button>
                      ))}
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <p className="muted catalog-picker-sub">O explora por categoría</p>
                  <div className="catalog-picker-cats">
                    {categories.map((c) => (
                      <button key={c.key} type="button" className="catalog-picker-cat" onClick={() => setCategory(c.key)}>
                        <span aria-hidden="true">{c.icon}</span> {c.name.replace(/\s*\(.*\)$/, '')}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {onRequestProduct && (
          <div className="catalog-picker-foot">
            <span className="muted">¿No lo encuentras?</span>
            <button type="button" className="link-button" onClick={() => onRequestProduct(query.trim())}>
              Solicitar nuevo producto
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
