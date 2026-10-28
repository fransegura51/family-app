import { useMemo, useRef, useState } from 'react'
import { createBudgetCategory } from '@/data/finance'
import { searchCategories } from '@/domain/categorySearch'
import type { BudgetCategory } from '@/domain/types'
import { errorMessage } from '@/domain/errorMessage'
import { normalizeConcept } from '../../supabase/functions/_shared/bank/classifyMovement.ts'
import { openManager } from '@/state/managers'

// Selector de categoría compartido entre el formulario de tickets, Movimientos, Banco y el cambio rápido de categoría de cada movimiento — petición real:
// "ahora mismo es una lista eterna, quiero que se abra una lista de las categorías principales y tocándolas se desplieguen las subcategorías, así no se
// satura tanto el usuario". Dos pasos en vez de una lista plana: primero las categorías principales, tocar una con subcategorías las despliega; las que no
// tienen subcategorías (u «Otros») se eligen directamente.
//
// CAT-2 / ECO-CLASIF: además, un buscador (por nombre o por concepto: «luz», «Netflix», «gasolina»), la categoría que PEPA sugiere, las que más se usan y
// crear una categoría propia sin salir de aquí. El usuario no necesita conocer la estructura del catálogo para clasificar algo.
export function CategorySelect({
  value,
  onChange,
  categories,
  allowGeneral,
  compact,
  emptyLabel,
  flow = 'gasto',
  suggestion,
  frequent,
  open: openProp,
  onClose,
  onCreated,
  confirmCurrent,
}: {
  value: string
  onChange: (v: string) => void
  categories: BudgetCategory[]
  // Texto cuando no hay categoría elegida (p. ej. «Pendiente de clasificar» para un gasto o ticket con category NULL).
  emptyLabel?: string
  // Petición real: "el desplegable de presupuesto, el mismo que el de categorías del banco pero con la diferencia de que también se pueda elegir General" —
  // solo lo pide Nuevo presupuesto (donde value === '' significa "sin categoría concreta, cuenta todo").
  allowGeneral?: boolean
  // Petición real: "disminuye la letra de la categoría para que se ajuste todo a una línea" — al ir a media anchura (Tickets, en fila con "¿Quién?"), el
  // nombre más largo partía en dos líneas y empujaba la flecha ▼ a una tercera. Solo afecta a quien pase esta prop.
  compact?: boolean
  /** 'ingreso' elige entre las categorías de ingresos; por defecto, las de gastos. */
  flow?: 'gasto' | 'ingreso'
  /** Categoría que PEPA propone para este movimiento: sale arriba y se elige con un toque. */
  suggestion?: string | null
  /** Nombres de las categorías que más se usan (atajos). */
  frequent?: readonly string[]
  /** Modo controlado: la ventana la abren y cierran quien llama y no se pinta el botón. */
  open?: boolean
  onClose?: () => void
  /** Se avisa tras crear una categoría propia desde aquí, para que la pantalla recargue su lista. */
  onCreated?: () => void
  /** Si PEPA aplicó la categoría actual como «sugerida»: ofrece darla por buena sin cambiar nada. */
  confirmCurrent?: () => void
}) {
  const controlled = openProp !== undefined
  const [openState, setOpenState] = useState(false)
  const open = controlled ? Boolean(openProp) : openState
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Petición real: "elijo una subcategoría y me devuelve a la lista de categorías y no puedo cerrar la ventana" (iPhone) — sospecha de un "click fantasma" de
  // Safari/iOS que llega justo después de cerrarse el modal y cae sobre el botón que queda al descubierto en esa misma posición, reabriéndolo. Se ignora
  // cualquier toque que reabra el desplegable en los 400ms siguientes a haberlo cerrado.
  const closedAtRef = useRef(0)

  const groupName = flow === 'ingreso' ? 'ingresos' : 'generales'
  const pool = useMemo(() => categories.filter((c) => c.budgetGroup === groupName), [categories, groupName])
  const topLevel = pool.filter((c) => !c.parentId)
  const selected = pool.find((c) => c.name === value)
  const expandedParent = expandedId ? topLevel.find((c) => c.id === expandedId) : null
  const subcats = expandedParent ? pool.filter((c) => c.parentId === expandedParent.id) : []
  const searching = query.trim() !== ''
  const hits = useMemo(() => (searching ? searchCategories(categories, query, flow) : []), [categories, query, flow, searching])
  const suggested = suggestion ? pool.find((c) => c.name === suggestion) : undefined
  const quick = (frequent ?? []).map((n) => pool.find((c) => c.name === n)).filter((c): c is BudgetCategory => !!c && c.name !== suggested?.name)

  function reset() {
    setExpandedId(null)
    setQuery('')
    setCreating(false)
    setNewName('')
    setCreateError(null)
  }

  function pick(name: string) {
    onChange(name)
    closedAtRef.current = Date.now()
    setOpenState(false)
    reset()
    onClose?.()
  }

  function close() {
    closedAtRef.current = Date.now()
    setOpenState(false)
    reset()
    onClose?.()
  }

  function openPicker() {
    if (Date.now() - closedAtRef.current < 400) return
    setOpenState(true)
  }

  async function createOwn() {
    const name = newName.trim()
    if (name === '') {
      setCreateError('Escribe el nombre de la categoría.')
      return
    }
    if (name.length > 60) {
      setCreateError('El nombre es demasiado largo.')
      return
    }
    if (pool.some((c) => normalizeConcept(c.name) === normalizeConcept(name))) {
      setCreateError('Ya existe una categoría con ese nombre: búscala arriba.')
      return
    }
    setSaving(true)
    setCreateError(null)
    try {
      await createBudgetCategory({ name, icon: '🏷️', budgetGroup: groupName, parentId: expandedParent?.id ?? null })
      onCreated?.()
      pick(name)
    } catch (err) {
      setCreateError(errorMessage(err, 'No se pudo crear la categoría'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {!controlled && (
        <button type="button" className="category-picker-toggle" style={compact ? { fontSize: 14, padding: '10px 12px' } : undefined} onClick={openPicker}>
          <span>{selected ? `${selected.icon} ${selected.name}` : allowGeneral && !value ? '🗂️ General' : value || emptyLabel || 'Elige una categoría'}</span>
          <span className="muted">▼</span>
        </button>
      )}
      {open && (
        // Petición real: "en el iPhone, al darle a una categoría padre se cierra el desplegable y al reabrirlo se ven las subcategorías" — el panel inline
        // reflowaba la página bajo el dedo al expandir, y Safari en iOS disparaba un click fantasma sobre el botón que había quedado en esa posición. Al ser
        // una ventana emergente fija, el resto de la página ya no se mueve al expandir una categoría.
        <div className="modal-overlay" onClick={close}>
          <div className="modal-sheet" data-help-id="finance.category-picker" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="section-title" style={{ margin: 0 }}>
                {expandedParent && !searching ? `${expandedParent.icon} ${expandedParent.name}` : 'Elige una categoría'}
              </h2>
              <button type="button" className="modal-close" onClick={close}>
                ✕
              </button>
            </div>
            <input
              type="search"
              className="category-picker-search"
              data-help-id="finance.category-search"
              aria-label="Buscar categoría"
              placeholder="Buscar: luz, gasolina, Netflix…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setNewName(e.target.value)
                setCreateError(null)
              }}
              onKeyDown={(e) => {
                // Intro en el buscador no debe enviar el formulario que haya detrás.
                if (e.key === 'Enter') e.preventDefault()
              }}
            />
            <div className="category-picker-panel" style={{ maxHeight: 'none', border: 'none' }}>
              {searching ? (
                <>
                  {hits.map((h) => (
                    <button key={h.category.id} type="button" className="category-picker-row" onClick={() => pick(h.category.name)}>
                      {h.category.icon} {h.path}
                      {h.via === 'concepto' && <span className="muted"> · coincide con «{query.trim()}»</span>}
                    </button>
                  ))}
                  {hits.length === 0 && <p className="muted" style={{ padding: '8px 4px', margin: 0 }}>No hay ninguna categoría con ese nombre.</p>}
                </>
              ) : expandedParent ? (
                <>
                  <button type="button" className="link-button" style={{ padding: '6px 4px' }} onClick={() => setExpandedId(null)}>
                    ‹ Volver a categorías
                  </button>
                  <button type="button" className="category-picker-row" onClick={() => pick(expandedParent.name)}>
                    {expandedParent.icon} {expandedParent.name} <span className="muted">(sin subcategoría)</span>
                  </button>
                  {subcats.map((c) => (
                    <button key={c.id} type="button" className="category-picker-row" onClick={() => pick(c.name)}>
                      {c.icon} {c.name}
                    </button>
                  ))}
                </>
              ) : (
                <>
                  {confirmCurrent && value && (
                    <button
                      type="button"
                      className="category-picker-row category-picker-confirm"
                      onClick={() => {
                        confirmCurrent()
                        close()
                      }}
                    >
                      ✓ Dejar «{value}» <span className="muted">(la que ha puesto PEPA)</span>
                    </button>
                  )}
                  {suggested && suggested.name !== value && (
                    <button type="button" className="category-picker-row category-picker-suggestion" onClick={() => pick(suggested.name)}>
                      ⭐ {suggested.icon} {suggested.name} <span className="muted">(sugerida por PEPA)</span>
                    </button>
                  )}
                  {quick.length > 0 && (
                    <div className="category-picker-chips" aria-label="Las que más usas">
                      {quick.map((c) => (
                        <button key={c.id} type="button" className="chip" onClick={() => pick(c.name)}>
                          {c.icon} {c.name}
                        </button>
                      ))}
                    </div>
                  )}
                  {allowGeneral && (
                    <button type="button" className="category-picker-row" onClick={() => pick('')}>
                      🗂️ General <span className="muted">(todos los gastos)</span>
                    </button>
                  )}
                  {topLevel.map((c) => {
                    const hasChildren = pool.some((x) => x.parentId === c.id)
                    return (
                      <button key={c.id} type="button" className="category-picker-row" onClick={() => (hasChildren ? setExpandedId(c.id) : pick(c.name))}>
                        {c.icon} {c.name} {hasChildren && <span className="muted">›</span>}
                      </button>
                    )
                  })}
                </>
              )}
              {creating || (searching && hits.length === 0) ? (
                <div className="category-picker-create" data-help-id="finance.category-create">
                  <label>
                    {expandedParent && !searching ? `Nueva subcategoría de ${expandedParent.name}` : 'Nueva categoría propia'}
                    <input
                      type="text"
                      aria-label="Nombre de la categoría nueva"
                      value={newName}
                      maxLength={60}
                      onChange={(e) => {
                        setNewName(e.target.value)
                        setCreateError(null)
                      }}
                    />
                  </label>
                  {createError && <p className="error" style={{ margin: '4px 0 0' }}>{createError}</p>}
                  <button type="button" disabled={saving} onClick={createOwn}>
                    {saving ? 'Creando…' : `Crear «${newName.trim() || '…'}»`}
                  </button>
                </div>
              ) : (
                <button type="button" className="link-button" style={{ padding: '10px 4px', fontSize: 13 }} onClick={() => setCreating(true)}>
                  ＋ Crear categoría propia
                </button>
              )}
              <button
                type="button"
                className="link-button"
                style={{ padding: '10px 4px', fontSize: 13 }}
                onClick={() => {
                  close()
                  openManager('categorias')
                }}
              >
                ⚙️ Gestionar categorías
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
