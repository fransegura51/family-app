// INC-06 (marcar como leído al abrir desde el aviso del móvil) e INC-14 (enlace profundo a Calendario): estructura del service worker, de la app nativa,
// del gancho de arranque, de Calendario y de las funciones de servidor. Se leen los textos de los archivos.
import { describe, expect, it } from 'vitest'
import sw from '@/sw.ts?raw'
import nativePush from '@/services/nativePush.ts?raw'
import app from '@/App.tsx?raw'
import marker from '@/ui/NotificationOpenMarker.tsx?raw'
import bell from '@/ui/NotificationBell.tsx?raw'
import data from '@/data/notifications.ts?raw'
import calendar from '@/ui/CalendarScreen.tsx?raw'
import sendUserPush from '../../supabase/functions/send-user-push/index.ts?raw'
import sendFamilyPush from '../../supabase/functions/send-family-push/index.ts?raw'
import sendDueReminders from '../../supabase/functions/send-due-reminders/index.ts?raw'
import fcmDue from '../../supabase/functions/send-due-reminders/fcm.ts?raw'
import fcmFamily from '../../supabase/functions/send-family-push/fcm.ts?raw'
import fcmUser from '../../supabase/functions/send-user-push/fcm.ts?raw'
import m260 from '../../supabase/migrations/0260_notifications_center.sql?raw'
import m261 from '../../supabase/migrations/0261_family_notification_recipients.sql?raw'
import m262 from '../../supabase/migrations/0262_daily_task_summary.sql?raw'
import m263 from '../../supabase/migrations/0263_notification_history_for_existing_alerts.sql?raw'
import { buildFcmPayload } from '../../supabase/functions/send-due-reminders/fcm'

const ID = '3b6f7a52-0d4e-4c1a-9f0e-2a7c5d8e9b10'

describe('INC-06: el id del aviso viaja del servidor al móvil', () => {
  it('la base lo guarda en el buzón y lo manda a send-user-push (clave «n»)', () => {
    expect(m260).toContain('notification_id uuid')
    expect(m260).toContain("'n', a.notification_id")
    expect(m260).toContain('insert into public.user_push_outbox (profile_id, title, body, url, tag, notification_id)')
    expect(m260).toContain('p_url, p_dedupe_key, v_id')
  })

  it('record_notifications devuelve los avisos creados para que la función de servidor lleve su id', () => {
    expect(m260).toContain('create or replace function public.record_notifications(p_items jsonb)\nreturns jsonb')
    expect(m260).toContain("'id', v_id")
  })

  it('llegadas/salidas y previsión de pagos también llevan el id de cada persona', () => {
    expect(m263).toContain('notification_ids jsonb')
    expect(m263).toContain("'notification_ids', a.notification_ids")
    expect(m263).toContain('out_notification_id uuid')
  })

  it('las tres funciones de servidor validan el id como uuid antes de mandarlo', () => {
    expect(sendUserPush).toContain('typeof input.n === "string" && UUID_RE.test(input.n)')
    expect(sendFamilyPush).toContain('UUID_RE.test(profileId) && typeof notificationId === "string" && UUID_RE.test(notificationId)')
    expect(sendDueReminders).toContain('isUuid(c.id)')
    expect(sendDueReminders).toContain('isUuid(c.out_notification_id)')
  })

  it('send-due-reminders anota la campana ANTES de enviar y manda el id del aviso de cada persona', () => {
    expect(sendDueReminders.indexOf('rpc("record_notifications"')).toBeLessThan(sendDueReminders.indexOf('await deliverPush(\n        { endpoint: r.out_endpoint'))
    expect(sendDueReminders).toContain('...(n ? { n } : {})')
  })

  it('el mensaje de Firebase (Android e iPhone) lleva «n» en los datos; las tres copias del archivo son idénticas', () => {
    expect(fcmFamily).toBe(fcmDue)
    expect(fcmUser).toBe(fcmDue)
    const payload = buildFcmPayload('token', { title: 't', body: 'b', url: '/calendario', n: ID })
    expect(payload.message.data).toEqual({ url: '/calendario', n: ID })
    expect(buildFcmPayload('token', { title: 't', body: 'b', url: '/calendario' }).message.data).toEqual({ url: '/calendario' })
  })

  it('el service worker guarda {url, n} en la notificación y al tocarla usa la función común', () => {
    expect(sw).toContain('data: { url: payload.url ?? null, n: notificationIdFromPushData(payload) }')
    expect(sw).toContain('pushEntryQuery(event.notification.data)')
  })

  it('la app nativa pasa los datos completos (url + n) a la dirección de entrada', () => {
    expect(nativePush).toContain('pushEntryUrl(import.meta.env.BASE_URL, data)')
    expect(nativePush).toContain("addListener('pushNotificationActionPerformed'")
    expect(nativePush).toContain("addListener('localNotificationActionPerformed'")
  })
})

describe('INC-06: el gancho de arranque', () => {
  it('está montado dentro de la app con sesión (junto a NativeDeepLinks, dentro del enrutador)', () => {
    expect(app).toContain('<NotificationOpenMarker />')
    expect(app.indexOf('<BrowserRouter')).toBeLessThan(app.indexOf('<NotificationOpenMarker />'))
    expect(app.indexOf('<NotificationOpenMarker />')).toBeGreaterThan(app.indexOf('if (!session) return <LoginScreen />'))
  })

  it('valida el id como uuid, lo marca UNA vez, quita el parámetro sin recargar y conserva el resto', () => {
    expect(marker).toContain('notificationIdFromSearch(location.search)')
    expect(marker).toContain('handled.current.has(id)')
    expect(marker).toContain('markNotificationsRead([id])')
    expect(marker).toContain('searchWithoutParams(window.location.search, [NOTIFICATION_PARAM])')
    expect(marker).toContain('{ replace: true }')
    expect(marker).not.toContain('window.location.reload')
    expect(marker).not.toContain('window.location.assign')
  })

  it('refresca el contador de la campana con un evento, sin consulta periódica', () => {
    expect(marker).toContain('announceNotificationsChanged()')
    expect(bell).toContain('NOTIFICATIONS_CHANGED_EVENT')
    expect(bell).not.toContain('setInterval')
    expect(data).toContain("'pepa:notifications-changed'")
  })

  it('abrir Novedades de Comunidad marca los avisos agrupados (category community_digest), una vez por visita', () => {
    expect(marker).toContain("'/comunidad/novedades'")
    expect(marker).toContain('markCommunityDigestsRead()')
    expect(marker).toContain('!wasOnNews.current')
    expect(data).toContain(".eq('category', 'community_digest').is('read_at', null)")
  })

  it('solo se marca por id o por categoría, siempre los propios (la base lo impone con RLS; solo se actualiza read_at)', () => {
    expect(data).toContain(".update({ read_at: new Date().toISOString() }).in('id', ids)")
    expect(m260).toContain('grant update (read_at) on public.user_notifications to authenticated;')
  })
})

describe('INC-14: enlaces profundos a Calendario', () => {
  it('Calendario lee el enlace con la función pura y limpia la dirección sin recargar', () => {
    expect(calendar).toContain('parseCalendarDeepLink(location.search)')
    expect(calendar).toContain('searchWithoutParams(window.location.search, CALENDAR_LINK_PARAMS)')
    expect(calendar).toContain('{ replace: true }')
  })

  it('espera a tener los eventos cargados y reutiliza la tarjeta fija del día (vista Mes) y su fila de siempre', () => {
    expect(calendar).toContain('if (loading) return')
    expect(calendar).toContain("setView('Mes')")
    expect(calendar).toContain('setSelectedDate(date)')
    expect(calendar).toContain('data-agenda-event-id')
    expect(calendar).toContain('data-agenda-date')
  })

  it('si el evento no existe o no hay acceso, avisa con amabilidad (role=status) y no rompe nada', () => {
    expect(calendar).toContain('Ese evento o tarea ya no existe, o no tienes acceso a él.')
    expect(calendar).toContain('role="status"')
    expect(calendar).toContain('Este enlace no es válido.')
  })

  it('una serie se abre en la ocurrencia pedida o en la más cercana a partir de esa fecha', () => {
    expect(calendar).toContain('pickOccurrenceDate(')
    expect(calendar).toContain('expandOccurrences(ev, wanted, addDaysIso(wanted, 400), holidayDates)')
  })

  it('el resumen diario baja al bloque «Tareas» del día', () => {
    expect(calendar).toContain('data-calendar-group={group.label}')
    expect(calendar).toContain('[data-calendar-group="Tareas"]')
  })

  it('el servidor genera estas direcciones: recordatorios, asignación de tareas y resumen diario', () => {
    expect(sendDueReminders).toContain('`/calendario?evento=${eventId}&fecha=${occurrenceDate}`')
    expect(sendDueReminders).toContain('url: calendarLink(r.out_event_id, r.out_occurrence_date)')
    expect(m261).toContain("'/calendario?evento=' || new.event_id || '&fecha='")
    expect(m261).not.toMatch(/notify_user\([^)]*'\/calendario',/)
    expect(m262).toContain("'/calendario?fecha=' || v_date::text || '&tareas=1'")
  })

  it('los avisos de otras pantallas (pagos, ubicación) siguen abriendo su pantalla', () => {
    expect(m263).toContain("'/dinero'")
    expect(m263).toContain("'/ubicacion'")
  })
})

describe('INC-13: el recordatorio llega a la campana de quien no tiene móvil', () => {
  it('claim_due_reminders reparte por persona (LEFT JOIN) y reclama una sola vez a quien no tiene móvil', () => {
    expect(m261).toContain('left join push_subscriptions ps on ps.profile_id = rc.profile_id')
    expect(m261).toContain("'nosub:' || x.tag")
    expect(m261).toContain('where c.sub_id is not null')
  })

  it('la función de servidor no intenta enviar cuando no hay dirección de envío', () => {
    expect(sendDueReminders).toContain('if (!r.out_endpoint) continue')
  })
})

describe('INC-19: el resumen diario se puede probar en un día de cambio de hora', () => {
  it('la lógica recibe la hora como parámetro y la función de pg_cron solo la llama con now()', () => {
    expect(m262).toContain('create or replace function private.run_daily_task_summaries_at(p_now timestamptz)')
    expect(m262).toContain('select private.run_daily_task_summaries_at(now());')
  })
})
