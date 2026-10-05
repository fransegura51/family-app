// «Menú del evento» → importar un menú desde una foto, la galería o un PDF. Importador GENÉRICO (el mismo para el
// menú principal, el infantil, un cóctel, una carta de bebidas, una recena o una propuesta de catering).
//
//   DOCUMENTO/FOTO → extracción → PROPUESTA estructurada → REVISIÓN de la familia → confirmación → guardado.
//
// La IA solo PROPONE: nada se guarda hasta que quien organiza revisa y confirma, y el documento original se
// conserva. Cancelar o descartar no guarda nada. No promete seguridad alimentaria.
import { useState } from 'react'
import { addEventMenuItemsBulk, saveEventFoodDocument } from '@/data/events'
import { errorMessage } from '@/domain/errorMessage'
import { canonicalSectionLabel, MENU_IMPORT_EXPLANATION } from '@/domain/eventFoodMenu'
import type { EventFoodDocumentKind } from '@/domain/types'
import { analyzeEventFoodDocument } from '@/services/eventFoodDocument'
import { showToast } from '@/state/toast'
import { FileOrPdfPicker } from '@/ui/FileOrPdfPicker'

interface ImportRow {
  id: string
  section: string
  name: string
  note: string | null
  include: boolean
}

export const IMPORT_NEEDS_HINT = 'PEPA podrá ayudarte a detectar posibles platos que convenga revisar según las necesidades alimentarias de tus invitados.'

export function EventMenuImporter({
  eventId,
  kind,
  forcedSection,
  sectionLabels,
  needsHint,
  onDone,
  onCancel,
}: {
  eventId: string
  kind: EventFoodDocumentKind
  forcedSection: string | null
  // Secciones entre las que se puede repartir lo importado (las que tiene el menú, más las del catálogo).
  sectionLabels: string[]
  // true si ya hay necesidades alimentarias registradas: se explica, sin prometer nada, para qué sirve tener el menú.
  needsHint: boolean
  onDone: (saved: number) => void
  onCancel: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [phase, setPhase] = useState<'pick' | 'reading' | 'review' | 'saving'>('pick')
  const [rows, setRows] = useState<ImportRow[]>([])
  const [extraNotes, setExtraNotes] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  async function handleFile(next: File | null) {
    setFile(next)
    if (!next) return
    setPhase('reading')
    setError(null)
    try {
      const proposal = await analyzeEventFoodDocument(next, kind)
      const flat: ImportRow[] = []
      for (const s of proposal.sections) {
        for (const d of s.dishes) {
          flat.push({ id: crypto.randomUUID(), section: forcedSection ?? canonicalSectionLabel(s.section), name: d.name, note: d.note, include: true })
        }
      }
      setRows(flat)
      setExtraNotes(proposal.extraNotes)
      if (flat.length === 0) {
        setError('No he podido leer platos en este documento. Prueba con otra foto o añádelo a mano.')
        setPhase('pick')
        return
      }
      setPhase('review')
    } catch (err) {
      setError(errorMessage(err, 'No se pudo leer el documento. Puedes añadirlo a mano.'))
      setPhase('pick')
    }
  }

  async function confirm() {
    if (!file) return
    const chosen = rows.filter((r) => r.include && r.name.trim())
    if (chosen.length === 0) return
    setPhase('saving')
    setError(null)
    try {
      const doc = await saveEventFoodDocument(eventId, file, kind)
      const count = await addEventMenuItemsBulk(
        eventId,
        chosen.map((r) => ({ name: r.name, category: r.section, notes: r.note })),
        { documentId: doc.id, imported: true },
      )
      showToast(`✓ ${count} plato${count === 1 ? '' : 's'} guardado${count === 1 ? '' : 's'} en el menú`)
      onDone(count)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar el menú'))
      setPhase('review')
    }
  }

  const chosenCount = rows.filter((r) => r.include && r.name.trim()).length

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
            Corrige nombres, cambia la sección o quita lo que no sea un plato. No se guardará nada hasta que confirmes.
          </p>
          {error && <p className="error">{error}</p>}
          {rows.map((r) => (
            <div key={r.id} className="menu-import-row">
              <input type="checkbox" checked={r.include} aria-label={`Incluir ${r.name}`} onChange={() => setRows(rows.map((x) => (x.id === r.id ? { ...x, include: !x.include } : x)))} />
              <input type="text" value={r.name} aria-label="Nombre del plato" onChange={(e) => setRows(rows.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)))} />
              {!forcedSection && (
                <select value={r.section} onChange={(e) => setRows(rows.map((x) => (x.id === r.id ? { ...x, section: e.target.value } : x)))} aria-label="Sección">
                  {sectionLabels.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                  {!sectionLabels.includes(r.section) && <option value={r.section}>{r.section}</option>}
                </select>
              )}
            </div>
          ))}
          {extraNotes.length > 0 && (
            <p className="muted" style={{ fontSize: 12 }}>
              Otras notas del documento (no se guardan como platos): {extraNotes.join(' · ')}
            </p>
          )}
          <div className="inline-fields" style={{ marginTop: 6 }}>
            <button type="button" disabled={phase === 'saving' || chosenCount === 0} onClick={confirm}>
              {phase === 'saving' ? 'Guardando…' : `Guardar ${chosenCount} platos`}
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
