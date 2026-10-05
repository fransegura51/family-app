// Identidad y texto de los avisos de recordatorio de Calendario. Los usan los DOS productores de un aviso: el
// servidor (Web Push, send-due-reminders, con la app cerrada) y el cliente (ReminderWatcher, solo como
// reserva — ver su cabecera). Tener una única definición evita que digan cosas distintas.
//
// Zona horaria: Europe/Madrid, igual que claim_due_reminders() en la base (migración 0197). No hay
// configuración de zona por familia en esta fase.

import type { ReminderAnchor } from '@/domain/reminders'

export const REMINDER_TZ = 'Europe/Madrid'

// Etiqueta de notificación: identifica «este recordatorio de esta ocurrencia de este evento» y NADA más.
// Evento + fecha de la ocurrencia + ancla (empieza/termina) + minutos de antelación: así, dos recordatorios
// legítimos del mismo evento (p. ej. 1 día antes y 1 hora antes) tienen etiquetas distintas y no se
// confunden, y el mismo recordatorio visto por el servidor y por el cliente tiene la MISMA etiqueta.
export function reminderTag(eventId: string, occurrenceDate: string, anchor: ReminderAnchor, minutesBefore: number): string {
  return `reminder:${eventId}:${occurrenceDate}:${anchor}:${minutesBefore}`
}

export interface MadridParts {
  date: string // YYYY-MM-DD en Madrid
  time: string // HH:MM en Madrid
}

const madridFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: REMINDER_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

// Fecha y hora de un instante vistas desde Madrid, con independencia de la zona del dispositivo o del
// servidor (Deno y los navegadores en otra zona darían otra hora con toLocaleTimeString sin zona).
export function madridParts(instant: Date | string | number): MadridParts {
  const parts: Record<string, string> = {}
  for (const p of madridFormat.formatToParts(new Date(instant))) parts[p.type] = p.value
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` }
}

export function daysBetweenDates(fromDate: string, toDate: string): number {
  const ms = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)))
  return Math.round((ms(toDate) - ms(fromDate)) / 86_400_000)
}

// Margen que el aviso local de reserva espera, en un dispositivo dado de alta para Web Push, a que llegue el aviso
// del servidor (el cron corre cada minuto y el push tarda segundos). Pasado el margen sin recibo, se asume que el
// servidor no ha avisado AQUÍ (suscripción caducada, no es destinatario del evento…) y avisa la app.
export const PUSH_GRACE_MS = 2 * 60_000

export type LocalReminderAction = 'skip' | 'wait' | 'show' | 'mark'

// Un único productor efectivo por recordatorio y dispositivo (no se puede confiar en la etiqueta para esto: iOS no
// reemplaza por etiqueta de forma fiable):
// - dispositivo SIN alta de Web Push → el único que puede avisar es la app abierta: 'show'.
// - dispositivo CON alta → el productor es el servidor. Si ya llegó su aviso (recibo) → 'mark' (se anota y la app
//   NO muestra nada). Si aún no ha llegado → 'wait' durante el margen; agotado, la app avisa ('show') para no
//   perder el recordatorio.
export function localReminderAction(a: {
  nowMs: number
  dueAtMs: number
  anchorMs: number
  alreadyHandled: boolean
  hasPushSubscription: boolean
  pushReceived: boolean
}): LocalReminderAction {
  if (a.alreadyHandled || a.nowMs < a.dueAtMs || a.nowMs >= a.anchorMs) return 'skip'
  if (!a.hasPushSubscription) return 'show'
  if (a.pushReceived) return 'mark'
  return a.nowMs < a.dueAtMs + PUSH_GRACE_MS ? 'wait' : 'show'
}

// <reminder-body> — este bloque está copiado TAL CUAL en supabase/functions/send-due-reminders/index.ts
// (el empaquetado de Edge Functions no resuelve imports hacia ../src). Un test compara ambos textos.
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function dayPhrase(localDate: string, dayOffset: number): string {
  if (dayOffset <= 0) return ''
  if (dayOffset === 1) return 'mañana'
  const d = new Date(Date.UTC(Number(localDate.slice(0, 4)), Number(localDate.slice(5, 7)) - 1, Number(localDate.slice(8, 10))))
  return `el ${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]}`
}

export function reminderBody(args: { anchor: 'start' | 'end'; allDay: boolean; localDate: string; localTime: string; dayOffset: number }): string {
  const day = dayPhrase(args.localDate, args.dayOffset)
  // Un evento «de todo el día» no tiene hora propia (la interna es solo técnica): nunca se dice una hora.
  if (args.allDay) {
    if (args.dayOffset <= 0) return 'Hoy, todo el día'
    return `${day.charAt(0).toUpperCase()}${day.slice(1)}, todo el día`
  }
  const verb = args.anchor === 'end' ? 'Termina' : 'Empieza'
  return day ? `${verb} ${day} a las ${args.localTime}` : `${verb} a las ${args.localTime}`
}
// </reminder-body>
