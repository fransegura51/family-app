import { useEffect, useState } from 'react'
import { getPermissionState, hasPushSubscription, isNotificationsDisabledByUser } from '@/services/notifications'
import { timezoneLabel, type NotificationPrefs } from '@/domain/notificationPrefs'
import { TimeSelect24 } from '@/ui/TimeSelect24'

// «Avisos de tareas» (Configuración → Avisos): dos resúmenes diarios INDEPENDIENTES de las tareas pendientes de la persona, cada uno con su interruptor y su hora
// (24 h, en su zona horaria; se ajusta sola con los cambios de hora). Se guardan en el servidor, por persona: valen en todos sus dispositivos y no dependen de los demás
// miembros de la familia. Solo gobiernan estos resúmenes: los recordatorios de cada tarea o evento no cambian. Nunca se envía un aviso vacío.
// Si las notificaciones de ESTE móvil están desactivadas se dice, pero no se pide ningún permiso aquí (eso se hace en «Avisos en este móvil»).
export function TaskSummaryPrefs({ prefs, onSave }: { prefs: NotificationPrefs; onSave: (patch: Partial<NotificationPrefs>) => void | Promise<void> }) {
  const pushOff = usePushOff()
  return (
    <section className="task-summary-prefs" aria-labelledby="task-summary-title">
      <h4 id="task-summary-title">✅ Avisos de tareas</h4>
      <p className="muted">
        Un resumen diario de las tareas que tienes pendientes. Los dos avisos son independientes y solo se envían si hay tareas (nunca un aviso vacío). La hora es la de tu
        zona horaria ({timezoneLabel(prefs.timezone)}) y se ajusta sola con los cambios de hora.
      </p>

      <label className="checkbox-label" data-help-id="notifications.task-overdue">
        <input type="checkbox" checked={prefs.taskOverdueEnabled} onChange={(e) => void onSave({ taskOverdueEnabled: e.target.checked })} />
        Avisarme de las tareas atrasadas
      </label>
      {prefs.taskOverdueEnabled && (
        <>
          <TimeSelect24 label="Hora del aviso de tareas atrasadas" value={prefs.taskOverdueTime} onChange={(v) => void onSave({ taskOverdueTime: v })} helpId="notifications.task-overdue-time" />
          <p className="muted task-summary-help">Un resumen de las tareas vencidas que siguen pendientes.</p>
        </>
      )}

      <label className="checkbox-label" data-help-id="notifications.task-today">
        <input type="checkbox" checked={prefs.taskTodayEnabled} onChange={(e) => void onSave({ taskTodayEnabled: e.target.checked })} />
        Avisarme de las tareas de hoy
      </label>
      {prefs.taskTodayEnabled && (
        <>
          <TimeSelect24 label="Hora del aviso de tareas de hoy" value={prefs.taskTodayTime} onChange={(v) => void onSave({ taskTodayTime: v })} helpId="notifications.task-today-time" />
          <p className="muted task-summary-help">Un resumen de las tareas de hoy que todavía no están hechas.</p>
        </>
      )}

      {pushOff && (prefs.taskOverdueEnabled || prefs.taskTodayEnabled) && (
        <p className="community-notice" role="status">
          Las notificaciones de este móvil están desactivadas: verás los resúmenes en la campana 🔔 de Inicio, pero no te llegará el aviso al móvil. Puedes activarlas en «Avisos
          en este móvil», más arriba.
        </p>
      )}
      <p className="muted task-summary-help">Los recordatorios de cada tarea o evento no cambian: estas opciones solo controlan estos dos resúmenes.</p>
    </section>
  )
}

// ¿Están desactivadas (o sin permiso) las notificaciones de este móvil? Solo se LEE el estado; null mientras no se sabe (no se enseña nada).
function usePushOff(): boolean {
  const [off, setOff] = useState(false)
  useEffect(() => {
    let cancelled = false
    hasPushSubscription().then(
      (subscribed) => {
        if (cancelled) return
        const permission = getPermissionState()
        setOff(isNotificationsDisabledByUser() || permission !== 'granted' || subscribed !== true)
      },
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [])
  return off
}
