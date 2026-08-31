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

// Componente sin UI: revisa cada 30s si algún evento con recordatorio ha
// llegado a su ventana (start_at - reminder_minutes) y dispara una
// notificación real del navegador. Solo activo mientras la app está
// abierta — ver services/notifications.ts para el porqué.
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
          const startMs = new Date(r.startAt).getTime()
          const dueAt = startMs - r.reminderMinutes * 60_000
          const key = `${r.id}:${r.startAt}`
          if (now >= dueAt && now < startMs && !shownRef.current.has(key)) {
            const time = new Date(r.startAt).toLocaleTimeString('es-ES', {
              hour: '2-digit',
              minute: '2-digit',
            })
            showNotification(r.title, `Empieza a las ${time}`)
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
