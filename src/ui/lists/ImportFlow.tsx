import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { addListItems, createList, deleteList, loadListDetail, loadListsOverview, replaceListItems, type ListsOverview } from '@/data/lists'
import { LIST_KIND_LABELS, normalizeOutline, splitDictation, splitLines, validateTitle, type ListKind, type UserList } from '@/domain/lists'
import { analyzeListImage, ListReaderUnavailableError, type ProposedLine } from '@/services/listDocument'
import { isDictationSupported, listenContinuous, type ListenSession } from '@/services/voice'
import { CropImage } from '@/ui/lists/CropImage'
import { imageFileToCanvas, openPdf, type PdfHandle } from '@/ui/lists/sourceImage'

// Importar a «Mis listas» desde una foto, un PDF, la voz o texto pegado. Todo termina en la MISMA pantalla de revisión editable;
// la IA nunca guarda nada y nunca inventa: lo dudoso se marca para que la persona lo decida. Cancelar no cambia nada.

type Step = 'source' | 'text' | 'pages' | 'crop' | 'reading' | 'review'
type Dest = 'añadir' | 'sustituir' | 'nueva' | 'otra'
interface Line {
  key: number
  text: string
  depth: 0 | 1
  uncertain: boolean
}

let lineKey = 0
const toLines = (src: { text: string; depth?: 0 | 1; uncertain?: boolean }[]): Line[] => src.map((l) => ({ key: ++lineKey, text: l.text, depth: l.depth ?? 0, uncertain: !!l.uncertain }))

export function ImportFlow({ current, onClose, onFinished }: { current: UserList | null; onClose: () => void; onFinished: (targetListId: string) => void }) {
  const [step, setStep] = useState<Step>('source')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const [pdf, setPdf] = useState<PdfHandle | null>(null)
  const [page, setPage] = useState(1)
  const [lines, setLines] = useState<Line[]>([])
  const [text, setText] = useState('')
  const [listening, setListening] = useState(false)
  const [dest, setDest] = useState<Dest>(current ? 'añadir' : 'nueva')
  const [newTitle, setNewTitle] = useState('')
  const [newKind, setNewKind] = useState<ListKind>(current?.kind ?? 'tareas')
  const [otherId, setOtherId] = useState('')
  const [overview, setOverview] = useState<ListsOverview | null>(null)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [currentCount, setCurrentCount] = useState(0)
  const session = useRef<ListenSession | null>(null)
  const baseText = useRef('')
  const camRef = useRef<HTMLInputElement>(null)
  const galRef = useRef<HTMLInputElement>(null)
  const pdfRef = useRef<HTMLInputElement>(null)

  useEffect(
    () => () => {
      session.current?.stop()
      pdf?.destroy()
    },
    [pdf],
  )
  useEffect(() => {
    if (step !== 'review') return
    if (current) void loadListDetail(current.id).then((d) => setCurrentCount(d?.items.length ?? 0), () => undefined)
    void loadListsOverview().then(setOverview, () => undefined)
  }, [step, current])

  const kind: ListKind = current?.kind ?? 'tareas'

  const onImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setBusy(true)
    try {
      setCanvas(await imageFileToCanvas(file))
      setStep('crop')
    } catch {
      setError('No se ha podido abrir esa imagen. Prueba con otra foto.')
    } finally {
      setBusy(false)
    }
  }
  const onPdf = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setBusy(true)
    try {
      const handle = await openPdf(file)
      setPdf(handle)
      setPage(1)
      setCanvas(await handle.render(1))
      setStep(handle.numPages > 1 ? 'pages' : 'crop')
    } catch {
      setError('No se ha podido abrir ese PDF.')
    } finally {
      setBusy(false)
    }
  }
  const goToPage = async (n: number) => {
    if (!pdf) return
    const p = Math.min(Math.max(1, n), pdf.numPages)
    setPage(p)
    setBusy(true)
    try {
      setCanvas(await pdf.render(p))
    } catch {
      setError('No se ha podido abrir esa página.')
    } finally {
      setBusy(false)
    }
  }

  const read = async (blob: Blob) => {
    setError(null)
    setBusy(true)
    setStep('reading')
    try {
      const proposed: ProposedLine[] = await analyzeListImage(blob, kind)
      if (proposed.length === 0) {
        setError('No he podido leer ningún elemento en esa zona. Prueba a recuadrar mejor la lista o con otra foto.')
        setStep('crop')
        return
      }
      setLines(toLines(proposed))
      setStep('review')
    } catch (e) {
      setError(e instanceof ListReaderUnavailableError ? e.message : 'No se ha podido leer la imagen. Comprueba la conexión e inténtalo de nuevo.')
      setStep('crop')
    } finally {
      setBusy(false)
    }
  }

  const toggleMic = () => {
    if (listening) {
      session.current?.stop()
      session.current = null
      setListening(false)
      return
    }
    baseText.current = text.trim()
    setError(null)
    setListening(true)
    session.current = listenContinuous({
      onTranscript: (t) => setText((baseText.current ? baseText.current + ' ' : '') + t),
      onError: (m) => {
        setError(m)
        setListening(false)
      },
    })
  }
  const textToReview = () => {
    session.current?.stop()
    session.current = null
    setListening(false)
    const parts = text.includes('\n') ? splitLines(text) : splitDictation(text)
    if (parts.length === 0) {
      setError('Escribe, pega o dicta algo primero.')
      return
    }
    setError(null)
    setLines(toLines(parts.map((t) => ({ text: t }))))
    setStep('review')
  }

  const cleanLines = () => normalizeOutline(lines.map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() })).filter((l) => l.text))

  const save = async () => {
    const items = cleanLines()
    if (items.length === 0) {
      setError('No hay ningún elemento que guardar.')
      return
    }
    if (dest === 'nueva') {
      const msg = validateTitle(newTitle)
      if (msg) {
        setError(msg)
        return
      }
    }
    if (dest === 'otra' && !otherId) {
      setError('Elige la lista a la que añadirlos.')
      return
    }
    if (dest === 'sustituir' && !confirmReplace) {
      setConfirmReplace(true)
      return
    }
    setBusy(true)
    setError(null)
    let createdId: string | null = null
    try {
      let target: string
      if (dest === 'nueva') {
        const l = await createList({ title: newTitle, kind: newKind })
        createdId = l.id
        target = l.id
      } else if (dest === 'otra') target = otherId
      else target = (current as UserList).id

      if (dest === 'sustituir') {
        await replaceListItems(target, items.map((l) => ({ text: l.text, depth: l.depth })))
      } else {
        const d = await loadListDetail(target)
        const last = d?.items.reduce((m, i) => Math.max(m, i.sortOrder), 0) ?? 0
        const base = Math.max(Date.now(), last + 1000)
        const firstCol = d?.list.kind === 'comparativa' ? (d.columns[0]?.id ?? null) : null
        await addListItems(
          target,
          items.map((l, n) => ({ text: l.text, depth: l.depth, columnId: firstCol, sortOrder: base + n * 1000 })),
        )
      }
      onFinished(target)
    } catch {
      // Si se estaba creando una lista nueva y falló a medias, no se deja una lista vacía por el camino.
      if (createdId) await deleteList(createdId).catch(() => undefined)
      setError('No se ha podido guardar. No se ha cambiado nada; inténtalo de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  const others = (overview?.lists ?? []).filter((l) => !l.archivedAt && l.id !== current?.id)
  const folderName = (l: UserList) => overview?.folders.find((f) => f.id === l.folderId)?.name

  return (
    <div className="modal-overlay" onClick={busy ? undefined : onClose}>
      <div className="modal-sheet lists-import" role="dialog" aria-modal="true" aria-label="Importar a la lista" onClick={(e) => e.stopPropagation()}>
        <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => void onImage(e)} />
        <input ref={galRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => void onImage(e)} />
        <input ref={pdfRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={(e) => void onPdf(e)} />

        {step === 'source' && (
          <>
            <h3>Importar elementos</h3>
            <div className="event-list">
              <button type="button" className="link-button lists-import-opt" onClick={() => camRef.current?.click()} disabled={busy}>
                📷 Hacer foto
              </button>
              <button type="button" className="link-button lists-import-opt" onClick={() => galRef.current?.click()} disabled={busy}>
                🖼️ Elegir de la galería
              </button>
              <button type="button" className="link-button lists-import-opt" onClick={() => pdfRef.current?.click()} disabled={busy}>
                📄 Elegir PDF
              </button>
              <button type="button" className="link-button lists-import-opt" onClick={() => setStep('text')}>
                🎤 Dictar o pegar texto
              </button>
            </div>
            {error && <p className="error">{error}</p>}
            <div className="form-actions">
              <button type="button" className="link-button" onClick={onClose}>
                Cancelar
              </button>
            </div>
          </>
        )}

        {step === 'text' && (
          <>
            <h3>Dictar o pegar texto</h3>
            <p className="muted">Di o escribe varios elementos seguidos («comprar mochila, dos cuadernos y un estuche») o pega una línea por elemento. Antes de guardar los revisas.</p>
            <textarea className="lists-input lists-textarea" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribe, pega o dicta aquí" aria-label="Texto a importar" />
            <div className="form-actions">
              {isDictationSupported() && (
                <button type="button" className={listening ? 'primary-button' : 'secondary-button'} onClick={toggleMic} aria-pressed={listening}>
                  {listening ? '⏹ Parar' : '🎤 Dictar'}
                </button>
              )}
              <button type="button" className="primary-button" onClick={textToReview}>
                Continuar
              </button>
              <button type="button" className="link-button" onClick={onClose}>
                Cancelar
              </button>
            </div>
            {error && <p className="error">{error}</p>}
          </>
        )}

        {step === 'pages' && pdf && (
          <>
            <h3>Elige la página</h3>
            <p className="muted">
              Página {page} de {pdf.numPages}
            </p>
            {canvas && <img className="lists-page-preview" alt={`Página ${page}`} src={canvas.toDataURL('image/jpeg', 0.5)} />}
            <div className="form-actions">
              <button type="button" className="secondary-button" disabled={busy || page <= 1} onClick={() => void goToPage(page - 1)}>
                ‹ Anterior
              </button>
              <button type="button" className="secondary-button" disabled={busy || page >= pdf.numPages} onClick={() => void goToPage(page + 1)}>
                Siguiente ›
              </button>
              <button type="button" className="primary-button" disabled={busy} onClick={() => setStep('crop')}>
                Usar esta página
              </button>
              <button type="button" className="link-button" onClick={onClose}>
                Cancelar
              </button>
            </div>
            {error && <p className="error">{error}</p>}
          </>
        )}

        {step === 'crop' && canvas && (
          <>
            <h3>Elige qué leer</h3>
            {pdf && pdf.numPages > 1 && (
              <button type="button" className="link-button" onClick={() => setStep('pages')}>
                ‹ Cambiar de página ({page}/{pdf.numPages})
              </button>
            )}
            <CropImage source={canvas} busy={busy} onConfirm={(b) => void read(b)} onCancel={onClose} />
            {error && <p className="error">{error}</p>}
          </>
        )}

        {step === 'reading' && <p role="status">Leyendo la lista…</p>}

        {step === 'review' && (
          <>
            <h3>Revisa antes de guardar</h3>
            <p className="muted">Corrige lo que haga falta. Lo marcado con «revisar» no se leyó con seguridad.</p>
            <div className="lists-review">
              {lines.map((l) => (
                <div key={l.key} className={'lists-review-row' + (l.depth === 1 ? ' lists-review-sub' : '') + (l.uncertain ? ' lists-review-doubt' : '')}>
                  <button
                    type="button"
                    className="lists-tool"
                    onClick={() => setLines((p) => p.map((x) => (x.key === l.key ? { ...x, depth: x.depth === 1 ? 0 : 1 } : x)))}
                    aria-label={l.depth === 1 ? 'Quitar sangría' : 'Poner como subelemento'}
                    title={l.depth === 1 ? 'Quitar sangría' : 'Poner como subelemento'}
                  >
                    {l.depth === 1 ? '⇤' : '⇥'}
                  </button>
                  <input
                    className="lists-input"
                    value={l.text}
                    maxLength={1000}
                    aria-label="Elemento"
                    onChange={(e) => setLines((p) => p.map((x) => (x.key === l.key ? { ...x, text: e.target.value, uncertain: false } : x)))}
                  />
                  {l.uncertain && <span className="lists-doubt">revisar</span>}
                  <button type="button" className="lists-tool" onClick={() => setLines((p) => p.filter((x) => x.key !== l.key))} aria-label="Quitar este elemento">
                    ✕
                  </button>
                </div>
              ))}
              <button type="button" className="lists-add" onClick={() => setLines((p) => [...p, ...toLines([{ text: '' }])])}>
                ＋ Añadir línea
              </button>
            </div>

            <h4 className="lists-dest-title">¿Dónde se guardan?</h4>
            <div className="lists-dest" role="radiogroup" aria-label="Destino">
              {current && (
                <label className="lists-dest-opt">
                  <input type="radio" name="dest" checked={dest === 'añadir'} onChange={() => { setDest('añadir'); setConfirmReplace(false) }} /> Añadir a esta lista
                </label>
              )}
              {current && (
                <label className="lists-dest-opt">
                  <input type="radio" name="dest" checked={dest === 'sustituir'} onChange={() => { setDest('sustituir'); setConfirmReplace(false) }} /> Sustituir lo que hay en esta lista
                </label>
              )}
              <label className="lists-dest-opt">
                <input type="radio" name="dest" checked={dest === 'nueva'} onChange={() => { setDest('nueva'); setConfirmReplace(false) }} /> Crear una lista nueva
              </label>
              <label className="lists-dest-opt">
                <input type="radio" name="dest" checked={dest === 'otra'} onChange={() => { setDest('otra'); setConfirmReplace(false) }} /> Añadir a otra lista que ya tengo
              </label>
            </div>
            {dest === 'nueva' && (
              <div className="lists-dest-extra">
                <input className="lists-input" placeholder="Título de la lista nueva" aria-label="Título de la lista nueva" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
                <select className="lists-input" value={newKind} onChange={(e) => setNewKind(e.target.value as ListKind)} aria-label="Tipo de lista">
                  {(Object.keys(LIST_KIND_LABELS) as ListKind[]).map((k) => (
                    <option key={k} value={k}>
                      {LIST_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
                <span className="muted">Será privada.</span>
              </div>
            )}
            {dest === 'otra' && (
              <div className="lists-dest-extra">
                <select className="lists-input" value={otherId} onChange={(e) => setOtherId(e.target.value)} aria-label="Lista de destino">
                  <option value="">Elige una lista…</option>
                  {others.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title}
                      {folderName(l) ? ` (${folderName(l)})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {dest === 'sustituir' && confirmReplace && current && (
              <p className="error" role="alert">
                Se quitarán los {currentCount} elementos que hay ahora en «{current.title}» y se pondrán estos. No se puede deshacer.
              </p>
            )}
            {error && <p className="error">{error}</p>}
            <div className="form-actions">
              <button type="button" className="primary-button" onClick={() => void save()} disabled={busy}>
                {dest === 'sustituir' ? (confirmReplace ? 'Sí, sustituir' : 'Sustituir…') : 'Guardar'}
              </button>
              <button type="button" className="link-button" onClick={onClose} disabled={busy}>
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
