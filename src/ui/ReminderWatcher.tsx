import { useEffect, useRef } from 'react'
import { listActiveReminders, listEventCompletions, listUpcomingEvents } from '@/data/calendar'
import { expandOccurrences } from '@/domain/calendar'
import { showNotification } from '@/services/notifications'

const SHOWN_KEY = 'family-app:shown-reminders'
const NAG_KEY = 'family-app:nag-reminders'
const CHECK_INTERVAL_MS = 30_000
// Cada cuánto se repite el aviso de "todavía no lo has hecho" mientras
// siga sin marcarse — ni tan seguido que agobie, ni tan espaciado que
// se olvide (petición real: "que me vuelva a salir un aviso... así,
// hasta que le dé a hecho").
const NAG_INTERVAL_MS = 30 * 60 * 1000

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

function loadNagTimes(): Record<string, number> {
  try {
    const raw = localStorage.getItem(NAG_KEY)
    return raw ? (JSON.parse(raw) as Record<string, number>) : {}
  } catch {
    return {}
  }
}

function saveNagTimes(times: Record<string, number>) {
  try {
    localStorage.setItem(NAG_KEY, JSON.stringify(times))
  } catch {
    // no crítico — en el peor caso se repite algún aviso de más.
  }
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Componente sin UI: revisa cada 30s dos cosas.
// 1. Recordatorios normales de un evento (start_at - minutes_before),
//    una sola vez, como antes.
// 2. Eventos de HOY con hora ya pasada y todavía sin marcar como
//    hechos — se avisa cada NAG_INTERVAL_MS mientras sigan sin
//    marcarse (petición real: antes, pasada la hora, no se volvía a
//    avisar nunca más aunque no se hubiera hecho — "si tenía bajar la
//    basura a las cinco y son las seis, no me dice que tengo que
//    bajar la basura"). Antes esto miraba tareas y eventos por
//    separado; ahora una tarea es un evento, así que basta con mirar
//    el calendario.
// Solo activo mientras la app está abierta — ver services/notifications.ts
// para el porqué.
export function ReminderWatcher() {
  const shownRef = useRef<Set<string>>(loadShown())
  const nagTimesRef = useRef<Record<string, number>>(loadNagTimes())

  useEffect(() => {
    let cancelled = false

    async function checkReminders() {
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
    }

    async function checkOverdueUndone() {
      const today = todayStr()
      const now = new Date()
      const nowMinutes = now.getHours() * 60 + now.getMinutes()
      const nowMs = now.getTime()

      const [events, eventCompletions] = await Promise.all([listUpcomingEvents(), listEventCompletions()])
      if (cancelled) return

      function shouldNag(key: string): boolean {
        const last = nagTimesRef.current[key]
        return last == null || nowMs - last >= NAG_INTERVAL_MS
      }
      function markNagged(key: string) {
        nagTimesRef.current[key] = nowMs
      }

      let changed = false

      for (const ev of events) {
        if (ev.allDay) continue
        if (!expandOccurrences(ev, today, today).includes(today)) continue
        const evMinutes = new Date(ev.startAt).getHours() * 60 + new Date(ev.startAt).getMinutes()
        if (evMinutes >= nowMinutes) continue
        const done = eventCompletions.some((c) => c.eventId === ev.id && c.occurrenceDate === today)
        if (done) continue
        const key = `event:${ev.id}:${today}`
        if (!shouldNag(key)) continue
        const time = new Date(ev.startAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        showNotification('Todavía pendiente', `${ev.title} — era a las ${time}`)
        markNagged(key)
        changed = true
      }

      if (changed) saveNagTimes(nagTimesRef.current)
    }

    async function check() {
      try {
        await checkReminders()
        await checkOverdueUndone()
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
