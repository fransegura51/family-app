import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { ITEM_TEXT_MAX, RICH_COLORS, RICH_COLOR_NAMES, applyFormat, clearFormat, parseRich, richOrNull, type RichColorName, type RichSpan } from '@/domain/lists'
import { getSelectionOffsets, readSpans, renderSpans, setSelectionOffsets } from '@/ui/lists/richDom'

// Edición de un elemento: texto con formato limitado (negrita, color de una paleta pequeña, sangría). La barra solo existe
// mientras se edita y va pegada al teclado. Todo el formato sale de los `spans` del dominio; el DOM solo es el medio de teclear.

export interface EditorResult {
  text: string
  rich: string | null
}

const plainOf = (spans: RichSpan[]) => spans.map((s) => s.text).join('')

// Quita espacios sobrantes de los extremos y limita la longitud, sin perder el formato del resto.
export function trimAndLimit(spans: RichSpan[], max = ITEM_TEXT_MAX): RichSpan[] {
  let out = spans.map((s) => ({ ...s }))
  while (out.length && !out[0].text.trimStart()) out.shift()
  if (out.length) out[0].text = out[0].text.trimStart()
  while (out.length && !out[out.length - 1].text.trimEnd()) out.pop()
  if (out.length) out[out.length - 1].text = out[out.length - 1].text.trimEnd()
  let left = max
  out = out.flatMap((s) => {
    if (left <= 0) return []
    const t = s.text.slice(0, left)
    left -= t.length
    return [{ ...s, text: t }]
  })
  return out
}

export function resultOf(spans: RichSpan[]): EditorResult | null {
  const clean = trimAndLimit(spans)
  const text = plainOf(clean)
  if (!text.trim()) return null
  return { text, rich: richOrNull(clean) }
}

// Si no hay nada seleccionado, el formato se aplica a la palabra donde está el cursor.
function targetRange(plain: string, from: number, to: number): [number, number] | null {
  if (to > from) return [from, to]
  let a = from
  let b = from
  while (a > 0 && !/\s/.test(plain[a - 1])) a--
  while (b < plain.length && !/\s/.test(plain[b])) b++
  return b > a ? [a, b] : null
}

function coveredBy(spans: RichSpan[], from: number, to: number, pred: (s: RichSpan) => boolean): boolean {
  let pos = 0
  let any = false
  for (const s of spans) {
    const a = Math.max(from, pos)
    const b = Math.min(to, pos + s.text.length)
    if (b > a) {
      any = true
      if (!pred(s)) return false
    }
    pos += s.text.length
  }
  return any
}

export function ItemEditor({
  initialRich,
  initialText,
  canIndent,
  canOutdent,
  onIndent,
  onOutdent,
  onCommit,
  onEnter,
  onCancel,
  placeholder,
}: {
  initialRich: string | null
  initialText: string
  canIndent: boolean
  canOutdent: boolean
  onIndent: () => void
  onOutdent: () => void
  /** Se llama al terminar de editar (salir del campo). `null` = quedó vacío. */
  onCommit: (r: EditorResult | null) => void
  /** Intro: guardar y empezar otro elemento debajo. */
  onEnter: (r: EditorResult | null) => void
  onCancel: () => void
  placeholder: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const finished = useRef(false)
  const [empty, setEmpty] = useState(!initialText)
  const [showColors, setShowColors] = useState(false)
  const [kb, setKb] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    renderSpans(el, initialRich ? parseRich(initialRich) : [{ text: initialText, bold: false, color: null }])
    el.focus()
    const len = el.textContent?.length ?? 0
    setSelectionOffsets(el, len, len)
    // La barra sube con el teclado (visualViewport): así nunca queda tapada en iPhone ni Android.
    const vv = window.visualViewport
    if (!vv) return
    const update = () => setKb(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
    // Solo al abrir el editor: el texto lo lleva el propio elemento mientras se teclea.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const current = () => (ref.current ? readSpans(ref.current) : [])
  const finish = (kind: 'commit' | 'enter' | 'cancel') => {
    if (finished.current) return
    finished.current = true
    const r = resultOf(current())
    if (kind === 'cancel') onCancel()
    else if (kind === 'enter') onEnter(r)
    else onCommit(r)
  }

  const format = (change: { bold?: boolean; color?: RichColorName | null } | 'clear') => {
    const el = ref.current
    if (!el) return
    const spans = current()
    const sel = getSelectionOffsets(el) ?? { from: 0, to: 0 }
    const range = targetRange(plainOf(spans), sel.from, sel.to)
    if (!range) return
    const next =
      change === 'clear'
        ? clearFormat(spans, range[0], range[1])
        : change.bold !== undefined
          ? applyFormat(spans, range[0], range[1], { bold: !coveredBy(spans, range[0], range[1], (s) => s.bold) })
          : applyFormat(spans, range[0], range[1], change)
    renderSpans(el, next)
    setSelectionOffsets(el, sel.from, sel.to)
    setShowColors(false)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      finish('enter')
    } else if (e.key === 'Escape') {
      e.preventDefault()
      finish('cancel')
    } else if (e.key === 'Backspace' && !ref.current?.textContent) {
      e.preventDefault()
      finish('cancel')
    }
  }
  const onPaste = (e: ClipboardEvent) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain').replace(/[\r\n]+/g, ' ')
    document.execCommand('insertText', false, text)
  }

  // Los botones de la barra no deben quitar el foco del texto (si no, se cierra el teclado y se pierde la selección).
  const keepFocus = (e: { preventDefault: () => void }) => e.preventDefault()

  return (
    <>
      <div
        ref={ref}
        className="lists-editor"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label="Texto del elemento"
        aria-multiline="false"
        data-placeholder={placeholder}
        data-empty={empty ? 'true' : 'false'}
        autoCapitalize="sentences"
        spellCheck
        enterKeyHint="next"
        onInput={() => setEmpty(!ref.current?.textContent)}
        onKeyDown={onKeyDown}
        onBeforeInput={(e) => {
          if ((e.nativeEvent as InputEvent).inputType === 'insertParagraph') {
            e.preventDefault()
            finish('enter')
          }
        }}
        onPaste={onPaste}
        onBlur={() => finish('commit')}
        data-help-id="listas.editor"
      />
      <div className="lists-toolbar" style={{ bottom: kb }} onPointerDown={keepFocus} onMouseDown={keepFocus} role="toolbar" aria-label="Formato del texto">
        <button type="button" className="lists-tool lists-tool-bold" onClick={() => format({ bold: true })} aria-label="Negrita" title="Negrita">
          <b>N</b>
        </button>
        <button type="button" className={'lists-tool' + (showColors ? ' lists-tool-on' : '')} onClick={() => setShowColors((v) => !v)} aria-label="Color" aria-expanded={showColors} title="Color">
          <span className="lists-color-dot" style={{ background: 'conic-gradient(#d64545, #e8801f, #2f9d6a, #3b6fd4, #8a4fc7, #d64545)' }} />
        </button>
        {showColors && (
          <span className="lists-colors">
            {RICH_COLOR_NAMES.map((c) => (
              <button key={c} type="button" className="lists-color" style={{ background: RICH_COLORS[c] }} onClick={() => format({ color: c })} aria-label={`Color ${c}`} />
            ))}
          </span>
        )}
        <button type="button" className="lists-tool" onClick={() => format('clear')} aria-label="Quitar formato" title="Quitar formato">
          Tx
        </button>
        <span className="lists-tool-sep" />
        <button type="button" className="lists-tool" disabled={!canOutdent} onClick={onOutdent} aria-label="Disminuir sangría" title="Disminuir sangría">
          ⇤
        </button>
        <button type="button" className="lists-tool" disabled={!canIndent} onClick={onIndent} aria-label="Aumentar sangría" title="Aumentar sangría">
          ⇥
        </button>
        <span className="lists-tool-fill" />
        <button type="button" className="lists-tool lists-tool-done" onClick={() => finish('commit')} aria-label="Terminar de editar">
          Listo
        </button>
      </div>
    </>
  )
}

