// Selector de archivo con varios botones separados en vez de un único
// <input> con accept mixto: en Android 13+, en cuanto el accept incluye
// "image/*", Chrome usa el selector de fotos del propio sistema en vez
// del explorador de archivos — y ese selector no tiene forma de elegir
// un PDF, aunque el accept también incluya application/pdf (bug real:
// en Android solo se podía elegir cámara/galería, nunca un archivo; en
// iPhone sí funcionaba porque ahí no existe esa restricción). Separar
// en inputs independientes, cada uno con un único tipo, evita la
// ambigüedad: el de PDF nunca incluye "image/*", así que siempre abre
// el explorador de archivos normal.
//
// Corrección real (petición explícita, auditoría previa): en Android, ese mismo accept="image/*" sin
// capture abre el Photos Picker del sistema (solo galería) — a diferencia de iOS, que siempre ofrece su
// propia hoja con Hacer foto/Fototeca/Archivo. Android se quedaba sin una vía directa y predecible a la
// cámara. Se añade un TERCER input, independiente, exclusivo para cámara (accept="image/*"
// capture="environment"), que fuerza la cámara trasera en ambas plataformas — nunca sustituye al de
// galería, que se queda exactamente igual (sin capture, Photos Picker intacto en Android).
//
// Los tres inputs entregan el File al MISMO onChange — el resto del pipeline (OCR, subida, conciliación de
// gastos...) nunca sabe ni necesita saber de qué botón vino. Con `sheetTitle` se presenta como un pequeño
// bottom sheet de 3 opciones (Hacer foto/Galería/PDF) reutilizando el patrón modal-overlay/modal-sheet ya
// existente (mismo que StoreQuestionSheet); sin `sheetTitle` (Previsión de pagos, Documentos — no piden
// cámara) el componente se queda EXACTAMENTE como estaba, 2 botones (Foto/PDF), sin tocar su
// comportamiento ni acoplar el texto de Tickets a esos otros usos.
import { type ChangeEvent, useRef, useState } from 'react'

function FileSourceSheet({
  title,
  onPickCamera,
  onPickGallery,
  onPickPdf,
  onCancel,
}: {
  title: string
  onPickCamera: () => void
  onPickGallery: () => void
  onPickPdf: () => void
  onCancel: () => void
}) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 8px' }}>{title}</h3>
        <div className="event-list">
          <button type="button" className="link-button" style={{ display: 'block', width: '100%', textAlign: 'left' }} onClick={onPickCamera}>
            📷 Hacer foto
          </button>
          <button type="button" className="link-button" style={{ display: 'block', width: '100%', textAlign: 'left' }} onClick={onPickGallery}>
            🖼️ Elegir de la galería
          </button>
          <button type="button" className="link-button" style={{ display: 'block', width: '100%', textAlign: 'left' }} onClick={onPickPdf}>
            📄 Elegir PDF
          </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" className="link-button" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

export function FileOrPdfPicker({
  file,
  onChange,
  sheetTitle,
}: {
  file: File | null
  onChange: (file: File | null) => void
  // Opcional — cuando se indica, el selector se presenta como bottom sheet de 3 opciones con cámara
  // directa. Sin él, comportamiento idéntico al de siempre (2 botones, sin cámara) — así Previsión de
  // pagos/Documentos no cambian ni de UI ni de textos por este cambio pensado para Tickets.
  sheetTitle?: string
}) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const photoRef = useRef<HTMLInputElement>(null)
  const pdfRef = useRef<HTMLInputElement>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  // Mismo handler, carácter a carácter, en los tres inputs — es lo que garantiza que da igual de dónde
  // venga el File: el resto del formulario (OCR, subida, todo lo posterior) recibe exactamente lo mismo.
  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    onChange(e.target.files?.[0] ?? null)
  }

  const hiddenInputs = (
    <>
      {sheetTitle && <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFile} />}
      <input ref={photoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
      <input ref={pdfRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={handleFile} />
    </>
  )

  if (sheetTitle) {
    return (
      <div>
        {/* FIX REAL (prompt maestro, Bloque B5): un nombre de archivo largo y sin espacios (típico de
            una foto de cámara, "IMG_20261009_224512.jpg") no tiene dónde partir la línea — sin
            overflow/ellipsis se salía de la pantalla en móvil en vez de cortarse con "…" visible. */}
        <button type="button" className="link-button" style={{ maxWidth: '100%', overflow: 'hidden' }} onClick={() => setSheetOpen(true)}>
          {file ? (
            <span style={{ display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>
              📎 {file.name}
            </span>
          ) : (
            '+ Añadir foto o PDF'
          )}
        </button>
        {hiddenInputs}
        {sheetOpen && (
          <FileSourceSheet
            title={sheetTitle}
            onPickCamera={() => {
              setSheetOpen(false)
              cameraRef.current?.click()
            }}
            onPickGallery={() => {
              setSheetOpen(false)
              photoRef.current?.click()
            }}
            onPickPdf={() => {
              setSheetOpen(false)
              pdfRef.current?.click()
            }}
            onCancel={() => setSheetOpen(false)}
          />
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="inline-fields">
        <button type="button" className="link-button" onClick={() => photoRef.current?.click()}>
          📷 Foto
        </button>
        <button type="button" className="link-button" onClick={() => pdfRef.current?.click()}>
          📄 PDF
        </button>
      </div>
      {hiddenInputs}
      {file && <p className="muted">Elegido: {file.name}</p>}
    </div>
  )
}
