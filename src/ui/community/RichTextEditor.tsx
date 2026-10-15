import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { MAX_BODY } from '@/domain/community'
import { charCounter, externalLinkHosts } from '@/domain/communityPostForm'
import { applyBold, applyBullets, applyItalic, applyLink, applyNumbered, safeLink, type EditResult } from '@/domain/communityRichText'
import { CommunityRichText } from '@/ui/community/CommunityRichText'
import '@/ui/community/communityEditor.css'

// Editor de texto de Pregunta, Consejo y Anécdota (y presentación de una Receta): campo GRANDE que crece al escribir (y se puede ampliar a mano), barra con
// negrita, cursiva, lista con viñetas, lista numerada y enlace, vista previa con el mismo pintado que verá el lector, contador de caracteres y aviso cuando un
// enlace sale de PEPA. El texto se guarda como texto sencillo con marcas (**negrita**, *cursiva*, «- » y «1. » en listas, [texto](https://…)): nunca HTML.
// El servidor vuelve a validar y sanear todo (migración 0265).
export function RichTextEditor({
  value,
  onChange,
  label,
  help,
  placeholder,
  maxLength = MAX_BODY,
  disabled,
  error,
}: {
  value: string
  onChange: (next: string) => void
  label: string
  help?: string
  placeholder?: string
  maxLength?: number
  disabled?: boolean
  error?: string | null
}) {
  const uid = useId()
  const areaId = `${uid}-area`
  const helpId = `${uid}-help`
  const countId = `${uid}-count`
  const errId = `${uid}-err`
  const ref = useRef<HTMLTextAreaElement>(null)
  const pendingSelection = useRef<{ start: number; end: number } | null>(null)
  const linkSelection = useRef<{ start: number; end: number }>({ start: 0, end: 0 })
  const [preview, setPreview] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkError, setLinkError] = useState<string | null>(null)

  // El campo crece con el texto (sin scroll interno ni recortes); la persona aún puede ampliarlo con el tirador.
  useEffect(() => {
    const el = ref.current
    if (!el || preview) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, 220)}px`
  }, [value, preview])

  // Tras aplicar una marca se devuelve el foco y se deja seleccionado el texto afectado, para seguir escribiendo sin tocar nada más.
  useLayoutEffect(() => {
    const sel = pendingSelection.current
    const el = ref.current
    if (!sel || !el) return
    pendingSelection.current = null
    el.focus()
    el.setSelectionRange(sel.start, sel.end)
  })

  function apply(fn: (text: string, start: number, end: number) => EditResult) {
    const el = ref.current
    if (!el || disabled) return
    const r = fn(value, el.selectionStart, el.selectionEnd)
    pendingSelection.current = { start: r.selectionStart, end: r.selectionEnd }
    onChange(r.text)
  }

  function openLink() {
    const el = ref.current
    linkSelection.current = { start: el?.selectionStart ?? value.length, end: el?.selectionEnd ?? value.length }
    setLinkUrl('')
    setLinkError(null)
    setLinkOpen(true)
  }

  function insertLink() {
    // Si falta «https://» se pone (quien escribe «www.pepa.app» se refiere a una página web).
    const raw = linkUrl.trim()
    const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`
    const ok = safeLink(candidate)
    if (!ok) {
      setLinkError('Escribe una dirección web completa de un sitio con nombre, por ejemplo https://www.ejemplo.com. No se admiten otros tipos de enlace.')
      return
    }
    const { start, end } = linkSelection.current
    const r = applyLink(value, start, end, ok.href)
    pendingSelection.current = { start: r.selectionStart, end: r.selectionEnd }
    onChange(r.text)
    setLinkOpen(false)
  }

  const counter = charCounter(value, maxLength)
  const hosts = externalLinkHosts(value)
  const tools: { key: string; label: string; icon: string; run: () => void }[] = [
    { key: 'bold', label: 'Negrita', icon: 'N', run: () => apply(applyBold) },
    { key: 'italic', label: 'Cursiva', icon: 'K', run: () => apply(applyItalic) },
    { key: 'bullets', label: 'Lista con viñetas', icon: '•', run: () => apply(applyBullets) },
    { key: 'numbered', label: 'Lista numerada', icon: '1.', run: () => apply(applyNumbered) },
    { key: 'link', label: 'Enlace', icon: '🔗', run: openLink },
  ]

  return (
    <div className="ce-field ce-editor">
      <label htmlFor={areaId} className="ce-label">
        {label}
      </label>
      {help && (
        <p id={helpId} className="muted ce-help">
          {help}
        </p>
      )}
      <div className="ce-toolbar" role="toolbar" aria-label="Formato del texto">
        {tools.map((t) => (
          <button
            key={t.key}
            type="button"
            className={'ce-tool ce-tool-' + t.key}
            aria-label={t.label}
            title={t.label}
            disabled={disabled || preview}
            // Se evita que el botón le quite la selección al campo antes de aplicar la marca.
            onMouseDown={(e) => e.preventDefault()}
            onClick={t.run}
          >
            <span aria-hidden="true">{t.icon}</span>
          </button>
        ))}
        <button type="button" className="ce-tool ce-tool-preview" aria-pressed={preview} disabled={disabled} onClick={() => setPreview((p) => !p)}>
          {preview ? 'Seguir escribiendo' : 'Vista previa'}
        </button>
      </div>

      {linkOpen && (
        <div className="ce-link-panel" role="group" aria-label="Añadir un enlace">
          <label className="ce-label" htmlFor={`${uid}-url`}>
            Dirección del enlace
          </label>
          <input
            id={`${uid}-url`}
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={linkUrl}
            placeholder="https://www.ejemplo.com"
            aria-invalid={linkError ? true : undefined}
            aria-describedby={linkError ? `${uid}-url-err` : undefined}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                insertLink()
              }
            }}
            autoFocus
          />
          {linkError && (
            <p id={`${uid}-url-err`} className="error" role="alert">
              {linkError}
            </p>
          )}
          <p className="muted ce-help">El texto que tengas seleccionado se convertirá en el enlace. Quien lo toque verá un aviso de que sale de PEPA.</p>
          <div className="ce-row">
            <button type="button" className="ce-btn ce-btn-primary" onClick={insertLink}>
              Insertar enlace
            </button>
            <button type="button" className="ce-btn ce-btn-secondary" onClick={() => setLinkOpen(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {preview ? (
        <div className="ce-preview" aria-label="Vista previa del texto" tabIndex={0}>
          {value.trim() ? <CommunityRichText text={value} /> : <p className="muted">Todavía no has escrito nada.</p>}
        </div>
      ) : (
        <textarea
          id={areaId}
          ref={ref}
          className="ce-textarea"
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={[help ? helpId : '', countId, error ? errId : ''].filter(Boolean).join(' ')}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      <div className="ce-meta">
        <span id={countId} className={'ce-counter' + (counter.over ? ' over' : counter.nearLimit ? ' near' : '')}>
          {counter.used.toLocaleString('es-ES')} de {maxLength.toLocaleString('es-ES')} caracteres
          {counter.over ? ` (te pasas ${(-counter.left).toLocaleString('es-ES')})` : ''}
        </span>
      </div>
      {hosts.length > 0 && (
        <p className="ce-external" role="note">
          🔗 {hosts.length === 1 ? 'Este enlace sale de PEPA' : 'Estos enlaces salen de PEPA'}: <strong>{hosts.join(', ')}</strong>. Quien los toque verá un aviso de que
          abre un sitio externo.
        </p>
      )}
      {error && (
        <p id={errId} className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
