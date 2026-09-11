import { useState } from 'react'

// Último recurso cuando el menú "compartir con quién" del sistema no
// funciona — comprobado real: falla en algunos Android (el navegador
// dice que puede compartir el archivo, pero al intentarlo de verdad lo
// deniega — ni WhatsApp ni la mayoría de apps aceptan un .vcf/.ics por
// ese camino) y en ordenador (el portapapeles del navegador también
// puede fallar). En vez de depender de esas APIs del navegador, esto
// deja el texto ya escrito para copiarlo a mano (con el método más
// compatible, no solo el moderno) o mandarlo directo por WhatsApp/email
// — nunca deja a la familia sin ninguna forma de compartir.
export function ShareFallbackModal({ title, text, onClose }: { title: string; text: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  function markCopied() {
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  async function handleCopy() {
    // document.execCommand('copy') es más viejo, pero funciona en
    // algunos sitios donde el permiso del portapapeles moderno
    // (navigator.clipboard) se deniega — probar los dos, no solo uno.
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      if (ok) {
        markCopied()
        return
      }
    } catch {
      // sigue al intento moderno de abajo
    }
    try {
      await navigator.clipboard?.writeText(text)
      markCopied()
    } catch {
      // Ninguno de los dos ha podido — el cuadro de texto de abajo
      // sigue ahí para seleccionar y copiar a mano con el dedo.
    }
  }

  const encoded = encodeURIComponent(text)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Compartir
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <p className="muted" style={{ fontSize: 13 }}>
          El menú de compartir del teléfono no ha funcionado aquí — copia el texto o mándalo directo:
        </p>
        <textarea
          readOnly
          value={text}
          rows={6}
          className="share-fallback-textarea"
          onClick={(e) => (e.target as HTMLTextAreaElement).select()}
        />
        <div className="form-actions" style={{ marginTop: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={handleCopy}>
            {copied ? '✓ Copiado' : '📋 Copiar texto'}
          </button>
          <a className="link-button" href={`https://wa.me/?text=${encoded}`} target="_blank" rel="noreferrer">
            💬 WhatsApp
          </a>
          <a className="link-button" href={`mailto:?subject=${encodeURIComponent(title)}&body=${encoded}`}>
            ✉️ Email
          </a>
        </div>
      </div>
    </div>
  )
}
