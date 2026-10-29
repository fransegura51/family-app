import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { addParticipants, groupsErrorMessage, listParticipants, loadGroupsHome, updateParticipant } from '@/data/groups'
import { findDuplicates, findInternalDuplicates, interpretTable, parseParticipantsText, type DuplicateInfo, type ImportResult, type ImportRow } from '@/domain/participantImport'
import { activeParticipants, groupTitle, participantName, type GroupItem, type Participant } from '@/domain/groups'
import { emitHelpEvent } from '@/help/tours/helpBus'
import { analyzeParticipantsImage, ParticipantsReaderUnavailableError } from '@/services/participantsDocument'
import { decodeCsv, readXlsx, SpreadsheetError, spreadsheetKind } from '@/services/spreadsheet'
import { imageFileToCanvas, openPdf } from '@/ui/lists/sourceImage'
import { GroupSheet } from '@/ui/groups/GroupSheet'

type Step = 'source' | 'paste' | 'groups' | 'reading' | 'review'
type Action = 'crear' | 'completar' | 'omitir'
interface Line {
  row: ImportRow
  include: boolean
  reviewed: boolean
  action: Action
  matchId: string | null
}

const MAX_PDF_PAGES = 8

function canvasToBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo preparar la imagen'))), 'image/jpeg', 0.88))
}

/**
 * Importar participantes: foto, galería, PDF, Excel/CSV, texto pegado u otro grupo. Siempre pasa por una VISTA PREVIA editable: nada se guarda hasta confirmar, lo dudoso pide
 * revisión, los duplicados ofrecen completar la ficha existente (sin fusionar nada solos) y no se inventa ningún dato.
 */
export function ParticipantImport({ group, existing, onClose, onDone }: { group: GroupItem; existing: Participant[]; onClose: () => void; onDone: (createdIds: string[]) => void }) {
  const [step, setStep] = useState<Step>('source')
  const [text, setText] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [notices, setNotices] = useState<string[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  const [progress, setProgress] = useState('')
  const [saving, setSaving] = useState(false)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const pdfRef = useRef<HTMLInputElement>(null)
  const sheetRef = useRef<HTMLInputElement>(null)

  const start = (result: ImportResult) => {
    const internal = findInternalDuplicates(result.rows)
    const dups = findDuplicates(result.rows, existing)
    const next: Line[] = result.rows.map((row) => {
      const d = dups.find((x) => x.rowKey === row.key)
      let action: Action = 'crear'
      let matchId: string | null = null
      if (d) {
        if (d.matches.length === 1) {
          matchId = d.matches[0].id
          action = Object.keys(d.patch).length > 0 ? 'completar' : 'omitir'
        } else action = 'omitir'
      }
      return { row, include: !internal.has(row.key), reviewed: row.doubts.length === 0, action, matchId }
    })
    setLines(next)
    setNotices([...result.notices, ...(internal.size ? [`${internal.size} fila(s) repetida(s) dentro del archivo: las he dejado sin marcar.`] : [])])
    setStep('review')
    setProblem(null)
  }

  const fail = (e: unknown) => {
    setStep('source')
    if (e instanceof ParticipantsReaderUnavailableError) setProblem('La lectura de fotos y PDF no está disponible ahora mismo. Puedes pegar el texto o subir un Excel/CSV.')
    else if (e instanceof SpreadsheetError) setProblem(e.message)
    else setProblem(groupsErrorMessage(e, 'No se ha podido leer el archivo.'))
  }

  const readImageFile = async (file: File) => {
    setStep('reading')
    setProgress('Leyendo la lista…')
    try {
      const blob = await canvasToBlob(await imageFileToCanvas(file))
      start(await analyzeParticipantsImage(blob))
    } catch (e) {
      fail(e)
    }
  }
  const readPdfFile = async (file: File) => {
    setStep('reading')
    let pdf: Awaited<ReturnType<typeof openPdf>> | null = null
    try {
      pdf = await openPdf(file)
      const pages = Math.min(pdf.numPages, MAX_PDF_PAGES)
      const rows: ImportRow[] = []
      const nts: string[] = []
      for (let p = 1; p <= pages; p++) {
        setProgress(`Leyendo la página ${p} de ${pages}…`)
        const r = await analyzeParticipantsImage(await canvasToBlob(await pdf.render(p)))
        rows.push(...r.rows)
        nts.push(...r.notices)
      }
      if (pdf.numPages > MAX_PDF_PAGES) nts.push(`Solo he leído las ${MAX_PDF_PAGES} primeras páginas de ${pdf.numPages}.`)
      start({ rows, notices: nts })
    } catch (e) {
      fail(e)
    } finally {
      pdf?.destroy()
    }
  }
  const readSheetFile = async (file: File) => {
    setStep('reading')
    setProgress('Abriendo el archivo…')
    try {
      const kind = spreadsheetKind(file)
      if (kind === 'unsupported') throw new SpreadsheetError('Ese formato antiguo no se puede abrir. Guárdalo como Excel (.xlsx) o CSV y vuelve a probar.')
      const buffer = await file.arrayBuffer()
      start(kind === 'xlsx' ? interpretTable(await readXlsx(buffer)) : parseParticipantsText(decodeCsv(buffer)))
    } catch (e) {
      fail(e)
    }
  }
  const onPicked = (handler: (f: File) => Promise<void>) => (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) void handler(f)
  }

  const duplicates: DuplicateInfo[] = useMemo(() => findDuplicates(lines.map((l) => l.row), existing), [lines, existing])
  const setLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.row.key === key ? { ...l, ...patch } : l)))
  const setRow = (key: string, patch: Partial<ImportRow>) => setLines((ls) => ls.map((l) => (l.row.key === key ? { ...l, row: { ...l.row, ...patch } } : l)))

  const active = lines.filter((l) => l.include && l.action !== 'omitir')
  const pendingReview = active.filter((l) => !l.reviewed)
  const toCreate = active.filter((l) => l.action === 'crear' && l.row.name.trim())
  const toComplete = active.filter((l) => l.action === 'completar' && l.matchId)

  const confirm = async () => {
    if (saving) return
    setSaving(true)
    try {
      const created = await addParticipants(
        group.id,
        toCreate.map((l) => ({ name: l.row.name, surname: l.row.surname, guardianName: l.row.guardianName, phone: l.row.phone, email: l.row.email })),
      )
      for (const l of toComplete) {
        const d = duplicates.find((x) => x.rowKey === l.row.key)
        const m = d?.matches.find((x) => x.id === l.matchId)
        if (!m) continue
        await updateParticipant(m.id, {
          surname: m.surname ? undefined : l.row.surname,
          guardianName: m.guardianName ? undefined : l.row.guardianName,
          phone: m.phone ? undefined : l.row.phone,
          email: m.email ? undefined : l.row.email,
        })
      }
      emitHelpEvent('grupos.participants-imported') // las fichas YA están guardadas
      onDone(created)
    } catch (e) {
      setProblem(groupsErrorMessage(e))
      setSaving(false)
    }
  }

  // ---------------------------------------------------------------------------------------------- otro grupo
  const [groups, setGroups] = useState<GroupItem[] | null>(null)
  useEffect(() => {
    if (step !== 'groups' || groups) return
    loadGroupsHome()
      .then((d) => setGroups(d.groups.filter((g) => g.id !== group.id)))
      .catch((e) => setProblem(groupsErrorMessage(e)))
  }, [step, groups, group.id])
  const fromGroup = async (g: GroupItem) => {
    setStep('reading')
    setProgress('Leyendo los participantes…')
    try {
      const people = activeParticipants(await listParticipants(g.id))
      start({
        rows: people.map((p, i) => ({ key: `grp-${i}`, name: participantName(p), surname: null, guardianName: p.guardianName, phone: p.phone, email: p.email, doubts: [] })),
        notices: [],
      })
    } catch (e) {
      fail(e)
    }
  }

  if (step === 'source')
    return (
      <GroupSheet title="Importar participantes" onClose={onClose}>
        <p className="muted">Elige de dónde sacar la lista. Antes de guardar nada verás una vista previa para revisarla.</p>
        <div style={{ display: 'grid', gap: 8 }}>
          <button type="button" className="grp-big-button" onClick={() => cameraRef.current?.click()} data-help-id="grupos.importar-foto">
            <span>📷 Hacer una foto</span>
            <span aria-hidden="true">›</span>
          </button>
          <button type="button" className="grp-big-button" onClick={() => galleryRef.current?.click()}>
            <span>🖼️ Elegir de la galería</span>
            <span aria-hidden="true">›</span>
          </button>
          <button type="button" className="grp-big-button" onClick={() => pdfRef.current?.click()}>
            <span>📄 Un PDF</span>
            <span aria-hidden="true">›</span>
          </button>
          <button type="button" className="grp-big-button" onClick={() => sheetRef.current?.click()} data-help-id="grupos.importar-excel">
            <span>📊 Excel o CSV</span>
            <span aria-hidden="true">›</span>
          </button>
          <button type="button" className="grp-big-button" onClick={() => setStep('paste')} data-help-id="grupos.importar-texto">
            <span>📋 Pegar texto</span>
            <span aria-hidden="true">›</span>
          </button>
          <button type="button" className="grp-big-button" onClick={() => setStep('groups')}>
            <span>👥 De otro de mis grupos</span>
            <span aria-hidden="true">›</span>
          </button>
        </div>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onPicked(readImageFile)} />
        <input ref={galleryRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onPicked(readImageFile)} />
        <input ref={pdfRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={onPicked(readPdfFile)} />
        <input ref={sheetRef} type="file" accept=".xlsx,.xlsm,.csv,.tsv,.txt,.xls" style={{ display: 'none' }} onChange={onPicked(readSheetFile)} />
        {problem && <p className="error">{problem}</p>}
      </GroupSheet>
    )

  if (step === 'paste')
    return (
      <GroupSheet title="Pegar texto" onClose={onClose}>
        <p className="muted">Un participante por línea. Si tiene madre/padre y teléfono, sepáralos con tabulador, «;» o coma (o pega directamente desde Excel). Por ejemplo: «Eric García; Jennifer; 612 345 678».</p>
        <textarea className="grp-input grp-textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder={'Eric García\tJennifer\t612 345 678\nLucía Martínez\tAna\t623 456 789'} aria-label="Texto con los participantes" autoFocus />
        <div className="form-actions">
          <button type="button" className="primary-button" disabled={!text.trim()} onClick={() => start(parseParticipantsText(text))}>
            Ver vista previa
          </button>
          <button type="button" className="link-button" onClick={() => setStep('source')}>
            Atrás
          </button>
        </div>
      </GroupSheet>
    )

  if (step === 'groups')
    return (
      <GroupSheet title="Copiar de otro grupo" onClose={onClose}>
        {!groups && !problem && <p className="muted">Cargando…</p>}
        {groups?.length === 0 && <p className="muted">No tienes otros grupos.</p>}
        {groups?.map((g) => (
          <button key={g.id} type="button" className="grp-row" onClick={() => void fromGroup(g)}>
            <span aria-hidden="true">👥</span>
            <span className="grp-row-main">
              <span className="grp-row-title">{groupTitle(g)}</span>
            </span>
          </button>
        ))}
        {problem && <p className="error">{problem}</p>}
        <button type="button" className="link-button" onClick={() => setStep('source')}>
          Atrás
        </button>
      </GroupSheet>
    )

  if (step === 'reading')
    return (
      <GroupSheet title="Leyendo…" onClose={() => undefined}>
        <p aria-live="polite">{progress}</p>
        <p className="muted">Esto puede tardar unos segundos.</p>
      </GroupSheet>
    )

  return (
    <GroupSheet title="Revisa antes de importar" onClose={onClose} wide>
      {notices.map((n) => (
        <div key={n} className="grp-banner grp-banner-info">
          {n}
        </div>
      ))}
      {lines.length === 0 && <p>No he encontrado ninguna persona en ese archivo.</p>}
      {lines.map((l) => {
        const d = duplicates.find((x) => x.rowKey === l.row.key)
        const doubtful = l.row.doubts.length > 0 && !l.reviewed
        return (
          <div key={l.row.key} className={'grp-import-row' + (l.row.doubts.length > 0 ? ' grp-import-row-doubt' : '')} data-help-id={l === lines[0] ? 'grupos.importar-fila' : undefined}>
            <label className="grp-check-row">
              <input type="checkbox" checked={l.include} onChange={(e) => setLine(l.row.key, { include: e.target.checked })} />
              <strong>{l.row.name || '(sin nombre)'}</strong>
            </label>
            <div className="grp-field-row">
              <label className="grp-field">
                <span>Nombre</span>
                <input className="grp-input" value={l.row.name} onChange={(e) => setRow(l.row.key, { name: e.target.value })} />
              </label>
              <label className="grp-field">
                <span>Teléfono</span>
                <input className="grp-input" inputMode="tel" value={l.row.phone ?? ''} onChange={(e) => setRow(l.row.key, { phone: e.target.value || null })} />
              </label>
            </div>
            <div className="grp-field-row">
              <label className="grp-field">
                <span>Madre/padre</span>
                <input className="grp-input" value={l.row.guardianName ?? ''} onChange={(e) => setRow(l.row.key, { guardianName: e.target.value || null })} />
              </label>
              <label className="grp-field">
                <span>Correo</span>
                <input className="grp-input" inputMode="email" value={l.row.email ?? ''} onChange={(e) => setRow(l.row.key, { email: e.target.value || null })} />
              </label>
            </div>
            {l.row.doubts.map((x) => (
              <p key={x} className="grp-doubt">
                ⚠️ {x}
              </p>
            ))}
            {l.row.doubts.length > 0 && l.include && (
              <button type="button" className="link-button" onClick={() => setLine(l.row.key, { reviewed: !l.reviewed })}>
                {l.reviewed ? '✓ Revisada (tocar para deshacer)' : 'Está bien así: marcar como revisada'}
              </button>
            )}
            {d && l.include && (
              <div className="grp-banner" style={{ marginBottom: 0 }}>
                <p style={{ margin: '0 0 6px' }}>
                  {d.matches.length === 1 ? (
                    <>
                      Ya hay una ficha con {d.kind === 'telefono' ? 'ese nombre y teléfono' : 'ese nombre'}: <strong>{participantName(d.matches[0])}</strong>.
                    </>
                  ) : (
                    <>Hay {d.matches.length} fichas con ese nombre. Elige cuál completar o crea una nueva.</>
                  )}
                </p>
                {d.conflicts.map((c) => (
                  <p key={c} className="grp-doubt">
                    {c}
                  </p>
                ))}
                <div className="grp-chips">
                  {d.matches.length === 1 && Object.keys(d.patch).length > 0 && (
                    <button type="button" className={'chip' + (l.action === 'completar' ? ' chip-active' : '')} onClick={() => setLine(l.row.key, { action: 'completar', matchId: d.matches[0].id })}>
                      Completar la ficha ({Object.keys(d.patch).length === 1 ? '1 dato' : `${Object.keys(d.patch).length} datos`})
                    </button>
                  )}
                  {d.matches.length > 1 &&
                    d.matches.map((m) => (
                      <button key={m.id} type="button" className={'chip' + (l.action === 'completar' && l.matchId === m.id ? ' chip-active' : '')} onClick={() => setLine(l.row.key, { action: 'completar', matchId: m.id })}>
                        Completar «{participantName(m)}» {m.phone ?? ''}
                      </button>
                    ))}
                  <button type="button" className={'chip' + (l.action === 'crear' ? ' chip-active' : '')} onClick={() => setLine(l.row.key, { action: 'crear', matchId: null })}>
                    Crear otra ficha
                  </button>
                  <button type="button" className={'chip' + (l.action === 'omitir' ? ' chip-active' : '')} onClick={() => setLine(l.row.key, { action: 'omitir' })}>
                    No importar
                  </button>
                </div>
              </div>
            )}
            {doubtful && l.include && <p className="muted" style={{ margin: '4px 0 0' }}>Revísala para poder importar.</p>}
          </div>
        )
      })}
      {problem && <p className="error">{problem}</p>}
      <div className="grp-sticky-bar">
        <button type="button" className="primary-button" disabled={saving || pendingReview.length > 0 || toCreate.length + toComplete.length === 0} onClick={() => void confirm()} data-help-id="grupos.importar-confirmar">
          {toCreate.length > 0 ? `Importar ${toCreate.length} ${toCreate.length === 1 ? 'persona' : 'personas'}` : 'Guardar cambios'}
          {toComplete.length > 0 ? ` y completar ${toComplete.length}` : ''}
        </button>
        <button type="button" className="link-button" onClick={onClose}>
          Cancelar
        </button>
      </div>
      {pendingReview.length > 0 && <p className="muted">Faltan {pendingReview.length} fila(s) por revisar (o desmárcalas).</p>}
    </GroupSheet>
  )
}
