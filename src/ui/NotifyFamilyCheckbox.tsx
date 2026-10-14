import { useEffect, useState } from 'react'
import { getTaskNotifyModeCached } from '@/data/notifications'

// Casilla «Aviso a toda la familia» de Nueva/Editar tarea y Nuevo/Editar evento. Solo aparece si la familia usa el modo «Solo los miembros asignados»
// (si no, el aviso ya va a quien corresponde según el ajuste familiar) y el elemento no es privado. Desmarcada por defecto. Marcarla avisa a todos los
// miembros activos solo para ESE elemento: no cambia a quién está asignado, ni los permisos, ni la privacidad de su contenido.
export function NotifyFamilyCheckbox({
  visibility,
  checked,
  onChange,
}: {
  visibility: 'shared' | 'private'
  checked: boolean
  onChange: (value: boolean) => void
}) {
  const [mode, setMode] = useState<'all' | 'assigned' | null>(null)

  useEffect(() => {
    let cancelled = false
    getTaskNotifyModeCached().then(
      (m) => {
        if (!cancelled) setMode(m)
      },
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [])

  if (mode !== 'assigned' || visibility === 'private') return null
  return (
    <label className="checkbox-label">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      🔔 Aviso a toda la familia
    </label>
  )
}
