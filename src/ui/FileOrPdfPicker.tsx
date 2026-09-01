// Selector de archivo con dos botones separados en vez de un único
// <input> con accept mixto: en Android 13+, en cuanto el accept incluye
// "image/*", Chrome usa el selector de fotos del propio sistema en vez
// del explorador de archivos — y ese selector no tiene forma de elegir
// un PDF, aunque el accept también incluya application/pdf (bug real:
// en Android solo se podía elegir cámara/galería, nunca un archivo; en
// iPhone sí funcionaba porque ahí no existe esa restricción). Separar
// en dos inputs, cada uno con un único tipo, evita la ambigüedad: el de
// PDF nunca incluye "image/*", así que siempre abre el explorador de
// archivos normal.
import { useRef } from 'react'

export function FileOrPdfPicker({
  file,
  onChange,
}: {
  file: File | null
  onChange: (file: File | null) => void
}) {
  const photoRef = useRef<HTMLInputElement>(null)
  const pdfRef = useRef<HTMLInputElement>(null)

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
      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      <input
        ref={pdfRef}
        type="file"
        accept="application/pdf"
        style={{ display: 'none' }}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      {file && <p className="muted">Elegido: {file.name}</p>}
    </div>
  )
}
