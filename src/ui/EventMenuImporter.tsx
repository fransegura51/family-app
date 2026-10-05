// «Menú del evento» → importar un menú desde una foto, la galería o un PDF. Importador GENÉRICO (el mismo para el
// menú principal, el infantil, un cóctel, una carta de bebidas, una recena o una propuesta de catering).
//
//   DOCUMENTO/FOTO → extracción → PROPUESTA → REVISIÓN de la familia → confirmación → guardado.
//
// FIDELIDAD AL DOCUMENTO ANTES QUE INTERPRETACIÓN: la propuesta llega en el ORDEN ORIGINAL del documento y la
// clasificación (tipo y sección) es solo metadato que la IA sugiere: nunca cambia el orden. Todo texto significativo
// se conserva (encabezados como «Cambio de Tercio»); lo dudoso llega DESMARCADO para decidir, no descartado. La
// persona puede corregir texto, tipo, sección, inclusión y también el orden (☰ / ▲▼) antes de guardar.
// La IA solo PROPONE: nada se guarda hasta confirmar, y el documento original se conserva. Cancelar no guarda nada.
// No promete seguridad alimentaria.
import { useState } from 'react'
import { importEventMenuItems, saveEventFoodDocument, type ImportMenuRow } from '@/data/events'
import { errorMessage } from '@/domain/errorMessage'
import { MENU_IMPORT_EXPLANATION, type ImportItemKind } from '@/domain/eventFoodMenu'
import { KIND_LABELS, moveId, type MenuPlacement } from '@/domain/eventMenuSequence'
import type { EventFoodDocumentKind } from '@/domain/types'
import { analyzeEventFoodDocument } from '@/services/eventFoodDocument'
import { showToast } from '@/state/toast'
import { AutoGrowTextarea } from '@/ui/AutoGrowTextarea'
import { FileOrPdfPicker } from '@/ui/FileOrPdfPicker'
import { useDragReorder } from '@/ui/useDragReorder'

export interface ImportRow {
  id: string
  text: string
  kind: ImportItemKind
  section: string | null
  note: string | null
  include: boolean
}

export const IMPORT_NEEDS_HINT = 'PEPA podrá ayudarte a detectar posibles platos que convenga revisar según las necesidades alimentarias de tus invitados.'
export const IMPORT_ORDER_HINT = 'Aparece en el orden del documento. Puedes corregir el texto, el tipo, la sección y el orden (☰ o ▲▼); la sección no cambia el orden.'

// Lo que se guarda: SOLO las filas marcadas con texto, en el orden en que quedaron en la revisión (el del documento o el
// que la persona corrigió). Desmarcar una fila impide guardarla. La sección solo se guarda para platos.
export function importRowsToSave(rows: ImportRow[], forcedSection: string | null): ImportMenuRow[] {
  return rows
    .filter((r) => r.include && r.text.trim())
    .map((r) => ({ text: r.text, kind: r.kind, category: r.kind === 'dish' ? (forcedSection ?? r.section) : null, notes: r.note }))
}

// «end» | «start» | «after:<id>» ↔ MenuPlacement
export function placementFromValue(value: string): MenuPlacement {
  if (value === 'start') return { type: 'start' }
  if (value.startsWith('after:')) return { type: 'after', itemId: value.slice('after:'.length) }
  return { type: 'end' }
}

export function EventMenuImporter({
  eventId,
  kind,
  forcedSection,
  sectionLabels,
  existing,
  needsHint,
  onDone,
  onCancel,
}: {
  eventId: string
  kind: EventFoodDocumentKind
  forcedSection: string | null
  // Secciones entre las que se puede clasificar lo importado.
  sectionLabels: string[]
  // Elementos que YA hay en el menú, en su orden (para elegir dónde se añade lo nuevo). Nunca se reordenan.
  existing: { id: string; label: string }[]
  // true si ya hay necesidades alimentarias registradas: se explica, sin prometer nada, para qué sirve tener el menú.
  needsHint: boolean
  onDone: (saved: number) => void
  onCancel: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [phase, setPhase] = useState<'pick' | 'reading' | 'review' | 'saving'>('pick')
  const [rows, setRows] = useState<ImportRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [placement, setPlacement] = useState('end')
  const drag = useDragReorder(
    rows.map((r) => r.id),
    (ids) => setRows((prev) => ids.map((id) => prev.find((r) => r.id === id) as ImportRow)),
  )

  async function handleFile(next: File | null) {
    setFile(next)
    if (!next) return
    setPhase('reading')
    setError(null)
    try {
      const proposal = await analyzeEventFoodDocument(next, kind)
      // El ORDEN de la propuesta es el del documento: se conserva tal cual, sin agrupar por sección.
      const flat: ImportRow[] = proposal.items.map((item) => ({ id: crypto.randomUUID(), text: item.text, kind: item.kind, section: forcedSection ?? item.section, note: item.note, include: item.include }))
      setRows(flat)
      if (flat.length === 0) {
        setError('No he podido leer nada en este documento. Prueba con otra foto o añádelo a mano.')
        setPhase('pick')
        return
      }
      setPhase('review')
    } catch (err) {
      setError(errorMessage(err, 'No se pudo leer el documento. Puedes añadirlo a mano.'))
      setPhase('pick')
    }
  }

  function update(id: string, patch: Partial<ImportRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function move(id: string, delta: -1 | 1) {
    const ids = moveId(
      rows.map((r) => r.id),
      id,
      delta,
    )
    drag.setOrder(ids)
    setRows(ids.map((i) => rows.find((r) => r.id === i) as ImportRow))
  }

  async function confirm() {
    if (!file) return
    const chosen = importRowsToSave(rows, forcedSection)
    if (chosen.length === 0) return
    setPhase('saving')
    setError(null)
    try {
      const doc = await saveEventFoodDocument(eventId, file, kind)
      const { count } = await importEventMenuItems(eventId, chosen, { documentId: doc.id, placement: placementFromValue(placement) })
      showToast(`✓ ${count} elemento${count === 1 ? '' : 's'} guardado${count === 1 ? '' : 's'} en el menú`)
      onDone(count)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar el menú'))
      setPhase('review')
    }
  }

  const chosenCount = rows.filter((r) => r.include && r.text.trim()).length
  const rowById = new Map(rows.map((r) => [r.id, r]))
  const ordered = drag.order.filter((id) => rowById.has(id))

  return (
    <div className="card" style={{ padding: 8, marginTop: 6 }}>
      {phase === 'pick' && (
        <>
          <p style={{ fontSize: 13, margin: '0 0 6px' }}>{MENU_IMPORT_EXPLANATION}</p>
          {needsHint && (
            <p className="muted" style={{ fontSize: 12, margin: '0 0 6px' }}>
              {IMPORT_NEEDS_HINT}
            </p>
          )}
          {error && <p className="error">{error}</p>}
          <FileOrPdfPicker file={file} onChange={handleFile} sheetTitle="Añadir el menú" />
          <button type="button" className="link-button" onClick={onCancel} style={{ marginTop: 6 }}>
            Cancelar
          </button>
        </>
      )}
      {phase === 'reading' && <p className="muted">Leyendo el documento… PEPA solo propone: tú lo revisas antes de guardar.</p>}
      {(phase === 'review' || phase === 'saving') && (
        <>
          <strong style={{ fontSize: 14 }}>Revisa lo que PEPA ha entendido</strong>
          <p className="muted" style={{ fontSize: 12, margin: '2px 0 6px' }}>
            {IMPORT_ORDER_HINT} No se guardará nada hasta que confirmes.
          </p>
          {error && <p className="error">{error}</p>}
          {existing.length > 0 && (
            <label className="menu-import-placement">
              Dónde añadirlo (lo que ya tienes no se mueve)
              <select value={placement} onChange={(e) => setPlacement(e.target.value)} disabled={phase === 'saving'}>
                <option value="end">Al final del menú</option>
                <option value="start">Al principio del menú</option>
                {existing.map((e) => (
                  <option key={e.id} value={`after:${e.id}`}>
                    Después de «{e.label.length > 40 ? `${e.label.slice(0, 40)}…` : e.label}»
                  </option>
                ))}
              </select>
            </label>
          )}
          {ordered.map((id, index) => {
            const r = rowById.get(id) as ImportRow
            const dragging = drag.draggingId === id
            return (
              <div key={id} data-reorder-row className={'menu-import-row' + (r.include ? '' : ' menu-import-off') + (dragging ? ' dayplan-row-dragging' : '')} style={dragging ? { transform: `translateY(${drag.dragOffset}px)` } : undefined}>
                <div className="menu-import-main">
                  <span className="drag-handle" style={{ touchAction: 'none' }} role="button" aria-label={`Arrastrar «${r.text}» para reordenar`} {...drag.handleProps(id)}>
                    ☰
                  </span>
                  <input type="checkbox" checked={r.include} aria-label={`Incluir ${r.text}`} onChange={() => update(id, { include: !r.include })} />
                  <AutoGrowTextarea value={r.text} ariaLabel="Texto del elemento" onChange={(text) => update(id, { text })} disabled={phase === 'saving'} />
                </div>
                <div className="menu-import-meta">
                  <select value={r.kind} aria-label="Tipo" onChange={(e) => update(id, { kind: e.target.value as ImportItemKind })}>
                    {(Object.keys(KIND_LABELS) as ImportItemKind[]).map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABELS[k]}
                      </option>
                    ))}
                  </select>
                  {r.kind === 'dish' && !forcedSection && (
                    <select value={r.section ?? ''} aria-label="Sección" onChange={(e) => update(id, { section: e.target.value || null })}>
                      <option value="">Sin sección</option>
                      {sectionLabels.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                      {r.section && !sectionLabels.includes(r.section) && <option value={r.section}>{r.section}</option>}
                    </select>
                  )}
                  <button type="button" className="icon-button" aria-label={`Subir «${r.text}»`} disabled={index === 0} onClick={() => move(id, -1)}>
                    ▲
                  </button>
                  <button type="button" className="icon-button" aria-label={`Bajar «${r.text}»`} disabled={index === ordered.length - 1} onClick={() => move(id, 1)}>
                    ▼
                  </button>
                </div>
              </div>
            )
          })}
          <div className="inline-fields" style={{ marginTop: 6 }}>
            <button type="button" disabled={phase === 'saving' || chosenCount === 0} onClick={confirm}>
              {phase === 'saving' ? 'Guardando…' : `Guardar ${chosenCount} elemento${chosenCount === 1 ? '' : 's'}`}
            </button>
            <button type="button" className="link-button" disabled={phase === 'saving'} onClick={onCancel}>
              Descartar
            </button>
          </div>
        </>
      )}
    </div>
  )
}
