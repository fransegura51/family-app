import { useEffect, useState } from 'react'
import { isIosApp, isNativeApp } from '@/services/nativeApp'

// Solo en la app nativa de Android: avisa si falta el permiso de ubicación «Permitir siempre». Sin él, cuando Android reinicia el servicio de ubicación
// con la app cerrada (de noche, por ahorro de batería), este se queda sin posición y los avisos de llegada no salen hasta abrir PEPA.
export function BackgroundLocationCard() {
  const applicable = isNativeApp() && !isIosApp()
  const [granted, setGranted] = useState<boolean | null>(null)

  useEffect(() => {
    if (!applicable) return
    let alive = true
    const check = () => {
      void import('@/services/nativeLocation')
        .then((m) => m.hasBackgroundLocationPermission())
        .then((ok) => {
          if (alive) setGranted(ok)
        })
        .catch(() => undefined)
    }
    check()
    // Al volver de los ajustes del móvil se comprueba otra vez.
    document.addEventListener('visibilitychange', check)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', check)
    }
  }, [applicable])

  if (!applicable || granted !== false) return null
  return (
    <div className="card member-form">
      <h2>📍 Falta un permiso para los avisos con la app cerrada</h2>
      <p className="muted">
        Para que los avisos de llegada y salida lleguen con PEPA cerrada, la ubicación tiene que estar en «Permitir todo el tiempo». Ahora mismo, si Android
        reinicia PEPA en segundo plano, deja de recibir tu posición y los avisos llegan tarde, al abrirla.
      </p>
      <ol className="muted" style={{ paddingLeft: 20, margin: '6px 0' }}>
        <li>Toca «Abrir ajustes de PEPA».</li>
        <li>Entra en «Permisos» y luego en «Ubicación».</li>
        <li>Elige «Permitir todo el tiempo» (y deja activada «Usar ubicación precisa»).</li>
        <li>Vuelve a PEPA: este aviso desaparece solo.</li>
      </ol>
      <button type="button" className="btn" onClick={() => void import('@/services/nativeLocation').then((m) => m.openLocationSettings()).catch(() => undefined)}>
        Abrir ajustes de PEPA
      </button>
    </div>
  )
}
