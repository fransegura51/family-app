import { useEffect, useRef } from 'react'
import { listActiveReminders } from '@/data/calendar'
import { showNotification } from '@/services/notifications'

const SHOWN_KEY = 'family-app:shown-reminders'
const CHECK_INTERVAL_MS = 30_000

function loadShown(): Set<string> {
  try {
    const raw = localStorage.getItem(SHOWN_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function saveShown(ids: Set<string>) {
  try {
    localStorage.setItem(SHOWN_KEY, JSON.stringify([...ids]))
  } catch {
    // localStorage no disponible (privado/bloqueado): los recordatorios
    // seguirán funcionando, solo puede repetirse alguna notificación.
  }
}

// Componente sin UI: revisa cada 30s si algún recordatorio de un evento
// (puede haber varios por evento) ha llegado a su ventana
// (start_at - minutes_before) y dispara una notificación real del
// navegador. Solo activo mientras la app está abierta — ver
// services/notifications.ts para el porqué.
export function ReminderWatcher() {
  const shownRef = useRef<Set<string>>(loadShown())

  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        const reminders = await listActiveReminders()
        if (cancelled) return
        const now = Date.now()

        for (const r of reminders) {
          const anchorMs = new Date(r.anchorAt).getTime()
          const dueAt = anchorMs - r.reminderMinutes * 60_000
          const key = `${r.id}:${r.anchorAt}:${r.anchor}:${r.reminderMinutes}`
          if (now >= dueAt && now < anchorMs && !shownRef.current.has(key)) {
            const time = new Date(r.anchorAt).toLocaleTimeString('es-ES', {
              hour: '2-digit',
              minute: '2-digit',
            })
            const body = r.anchor === 'end' ? `Termina a las ${time}` : `Empieza a las ${time}`
            showNotification(r.title, body)
            shownRef.current.add(key)
            saveShown(shownRef.current)
          }
        }
      } catch {
        // Un fallo puntual de red no debe interrumpir el resto de la app.
      }
    }

    check()
    const interval = setInterval(check, CHECK_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  return null
}
