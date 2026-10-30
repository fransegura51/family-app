import { AREA_META, AREA_ORDER, NOTIFICATION_TYPES, defaultPersonalCategories, type NotificationViewMode } from '@/domain/notificationAreas'
import type { NotificationPrefs } from '@/domain/notificationPrefs'

// NOT-01 / NOT-04 — «Cómo ver tus avisos» (Configuración → Avisos): dos formas de ver el panel 🔔, a elegir por persona (se guarda en el servidor: igual en todos sus dispositivos),
// qué tipos de aviso cuentan como personales en la vista por prioridad, y el aviso agrupado de movimientos nuevos del banco.
const MODES: { value: NotificationViewMode; label: string; help: string }[] = [
  { value: 'personal', label: 'Por prioridad personal', help: 'Personales arriba y Otras debajo, con lo que no has leído primero. Tú eliges qué tipos son personales.' },
  { value: 'areas', label: 'Por áreas', help: 'Agrupados por módulo (Calendario, Economía…) con su contador de no leídos. Las áreas con novedades suben arriba y salen abiertas.' },
]

export function NotificationViewPrefs({ prefs, onSave }: { prefs: NotificationPrefs; onSave: (patch: Partial<NotificationPrefs>) => void | Promise<void> }) {
  const personal = prefs.personalCategories ?? defaultPersonalCategories()

  function toggleType(category: string, on: boolean) {
    const next = on ? [...new Set([...personal, category])] : personal.filter((c) => c !== category)
    void onSave({ personalCategories: next })
  }

  return (
    <section className="notification-view-prefs" aria-labelledby="notification-view-title" data-help-id="notifications.view-mode">
      <h4 id="notification-view-title">🔔 Cómo ver tus avisos</h4>
      {MODES.map((m) => (
        <label key={m.value} className="checkbox-label">
          <input type="radio" name="notification-view-mode" checked={prefs.notificationViewMode === m.value} onChange={() => void onSave({ notificationViewMode: m.value })} />
          <span>
            <strong>{m.label}</strong>
            <br />
            <span className="muted">{m.help}</span>
          </span>
        </label>
      ))}

      {prefs.notificationViewMode === 'personal' && (
        <div data-testid="personal-types">
          <p className="muted">Marca los avisos que quieres ver como «Personales», agrupados por módulo:</p>
          {AREA_ORDER.map((area) => {
            const types = NOTIFICATION_TYPES.filter((t) => t.area === area)
            if (types.length === 0) return null
            return (
              <fieldset key={area} style={{ border: 0, margin: '4px 0', padding: 0 }}>
                <legend>
                  <strong>
                    {AREA_META[area].icon} {AREA_META[area].label}
                  </strong>
                </legend>
                {types.map((t) => (
                  <label key={t.category} className="checkbox-label">
                    <input type="checkbox" checked={personal.includes(t.category)} onChange={(e) => toggleType(t.category, e.target.checked)} />
                    {t.label}
                  </label>
                ))}
              </fieldset>
            )
          })}
          {prefs.personalCategories != null && (
            <button type="button" className="link-button" onClick={() => void onSave({ personalCategories: null })}>
              Volver a la selección de siempre
            </button>
          )}
        </div>
      )}

      <label className="checkbox-label" data-help-id="notifications.bank-import">
        <input type="checkbox" checked={prefs.bankImportEnabled} onChange={(e) => void onSave({ bankImportEnabled: e.target.checked })} />
        Avisarme de los movimientos nuevos del banco (un solo aviso por tanda)
      </label>
    </section>
  )
}
