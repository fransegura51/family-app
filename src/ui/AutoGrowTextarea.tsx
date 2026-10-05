// Campo de texto que crece con su contenido: en móvil se puede LEER el texto completo sin scroll horizontal ni
// recortes (un <input> de una línea corta los nombres largos). Sin dependencias.
import { useEffect, useRef } from 'react'

export function AutoGrowTextarea({
  value,
  onChange,
  ariaLabel,
  disabled,
  className = '',
}: {
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  disabled?: boolean
  className?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return <textarea ref={ref} rows={1} className={`autogrow ${className}`.trim()} value={value} disabled={disabled} aria-label={ariaLabel} onChange={(e) => onChange(e.target.value)} />
}
