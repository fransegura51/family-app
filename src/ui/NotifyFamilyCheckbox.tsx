import { useEffect, useState } from 'react'
import { getNotifyModesCached } from '@/data/notifications'
import { resolveNotifyMode } from '@/domain/eventRecipients'

// Casilla «Aviso a toda la familia» de Nueva/Editar tarea y Nuevo/Editar evento. Solo aparece si la familia usa el modo «Solo los miembros asignados»
// (si no, el aviso ya va a quien corresponde según el ajuste familiar) y el elemento no es privado. Desmarcada por defecto. Marcarla avisa a todos los
// miembros activos solo para ESE elemento: no cambia a quién está asignado, ni los permisos, ni la privacidad de su contenido.
export function NotifyFamilyCheckbox({
  kind,
  visibility,
  checked,
  onChange,
}: {
  // NOT-03: tareas y eventos tienen cada uno su ajuste; la casilla sale según el del tipo que se está creando o editando.
  kind: 'event' | 'task'
  visibility: 'shared' | 'private'
  checked: boolean
  onChange: (value: boolean) => void
}) {
  const [mode, setMode] = useState<'all' | 'assigned' | null>(null)

  useEffect(() => {
    let cancelled = false
    getNotifyModesCached().then(
      (m) => {
        if (!cancelled) setMode(resolveNotifyMode(kind, kind === 'task' ? m.task : m.event))
      },
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [kind])

  if (mode !== 'assigned' || visibility === 'private') return null
  return (
    <label className="checkbox-label" data-help-id="calendar.notify-family">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      🔔 Aviso a toda la familia
    </label>
  )
}
