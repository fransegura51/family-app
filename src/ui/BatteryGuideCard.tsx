import { detectBrand, orderedGuides } from '@/domain/batteryGuide'
import { isNativeApp } from '@/services/nativeApp'

// Solo en la app nativa de Android: cómo dejar el móvil para que los avisos y la ubicación sigan con la app cerrada (ver domain/batteryGuide.ts).
// Cada fabricante lo esconde en un sitio distinto; se enseña la marca reconocida abierta y las demás plegadas.
export function BatteryGuideCard() {
  if (!isNativeApp()) return null
  const brand = detectBrand(navigator.userAgent)
  const guides = orderedGuides(brand)
  return (
    <div className="card member-form">
      <h2>🔋 Que los avisos lleguen con la app cerrada</h2>
      <p className="muted">
        Muchos móviles Android cierran las apps en segundo plano para ahorrar batería. Si los avisos de llegada y salida solo te salen con PEPA abierta, haz
        estos ajustes una vez en este móvil. Después cierra PEPA con el botón de inicio y comprueba con «Mandarme un aviso de prueba».
      </p>
      {guides.map((guide, index) => (
        <details key={guide.brand} open={guide.brand === brand || (brand === 'other' && index === 0)} style={{ marginBottom: 6 }}>
          <summary>
            {guide.name}
            {guide.brand === brand ? ' (parece el tuyo)' : ''}
          </summary>
          <ol className="muted" style={{ paddingLeft: 20, margin: '6px 0' }}>
            {guide.steps.map((step) => (
              <li key={step} style={{ marginBottom: 6 }}>
                {step}
              </li>
            ))}
          </ol>
        </details>
      ))}
    </div>
  )
}
