// Avisos de tareas (Configuración → Avisos): dos avisos independientes con interruptor y hora de 24 h. Se pinta el componente y se leen los fuentes.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs } from '@/domain/notificationPrefs'
import { splitTime, TimeSelect24 } from '@/ui/TimeSelect24'
import { TaskSummaryPrefs } from '@/ui/TaskSummaryPrefs'
import cardSrc from '@/ui/NotificationPrefsCard.tsx?raw'
import prefsSrc from '@/ui/TaskSummaryPrefs.tsx?raw'
import dataSrc from '@/data/notifications.ts?raw'

const html = (prefs: Partial<NotificationPrefs> = {}) => renderToStaticMarkup(<TaskSummaryPrefs prefs={{ ...DEFAULT_NOTIFICATION_PREFS, ...prefs }} onSave={() => undefined} />)

describe('selector de hora de 24 horas', () => {
  it('lee «HH:MM» y rechaza lo raro (vuelve a 08:00)', () => {
    expect(splitTime('21:30')).toEqual({ h: '21', m: '30' })
    expect(splitTime('09:05:00')).toEqual({ h: '09', m: '05' })
    expect(splitTime('24:00')).toEqual({ h: '08', m: '00' })
    expect(splitTime('')).toEqual({ h: '08', m: '00' })
  })

  it('ofrece las 24 horas (00-23) y los 60 minutos (00-59), sin AM/PM', () => {
    const out = renderToStaticMarkup(<TimeSelect24 label="Hora" value="07:45" onChange={() => undefined} />)
    expect((out.match(/<option/g) ?? []).length).toBe(24 + 60)
    expect(out).toContain('<option value="23">23</option>')
    expect(out).toContain('<option value="59">59</option>')
    expect(out).toContain('<option value="07" selected="">07</option>')
    expect(out).toContain('<option value="45" selected="">45</option>')
    expect(out).not.toMatch(/AM|PM/i)
  })
})

describe('apartado «Avisos de tareas»', () => {
  it('dos opciones independientes, en este orden: atrasadas y de hoy, con sus textos', () => {
    const out = html()
    expect(out).toContain('✅ Avisos de tareas')
    expect(out).toContain('Avisarme de las tareas atrasadas')
    expect(out).toContain('Avisarme de las tareas de hoy')
    expect(out.indexOf('Avisarme de las tareas atrasadas')).toBeLessThan(out.indexOf('Avisarme de las tareas de hoy'))
  })

  it('con los valores por defecto: las dos activadas, hoy 08:00 y atrasadas 09:00', () => {
    const out = html()
    expect((out.match(/type="checkbox" checked=""/g) ?? []).length).toBe(2)
    // Primer selector (atrasadas): 09:00; segundo (hoy): 08:00.
    const selected = [...out.matchAll(/<option value="(\d\d)" selected="">/g)].map((m) => m[1])
    expect(selected).toEqual(['09', '00', '08', '00'])
  })

  it('cada interruptor oculta SOLO su hora', () => {
    const noOverdue = html({ taskOverdueEnabled: false })
    expect(noOverdue).not.toContain('Hora del aviso de tareas atrasadas')
    expect(noOverdue).toContain('Hora del aviso de tareas de hoy')
    const noToday = html({ taskTodayEnabled: false })
    expect(noToday).toContain('Hora del aviso de tareas atrasadas')
    expect(noToday).not.toContain('Hora del aviso de tareas de hoy')
    const none = html({ taskTodayEnabled: false, taskOverdueEnabled: false })
    expect(none).not.toContain('<select')
  })

  it('aclara que es por zona horaria, que no hay avisos vacíos y que los recordatorios individuales no cambian', () => {
    const out = html()
    expect(out).toContain('nunca un aviso vacío')
    expect(out).toContain('zona horaria')
    expect(out).toContain('Los recordatorios de cada tarea o evento no cambian')
  })

  it('cada cambio guarda SOLO su campo (preferencias por persona en el servidor)', () => {
    expect(prefsSrc).toContain('onSave({ taskOverdueEnabled: e.target.checked })')
    expect(prefsSrc).toContain('onSave({ taskTodayEnabled: e.target.checked })')
    expect(prefsSrc).toContain('onSave({ taskOverdueTime: v })')
    expect(prefsSrc).toContain('onSave({ taskTodayTime: v })')
    expect(dataSrc).toContain('row.task_today_enabled = patch.taskTodayEnabled')
    expect(dataSrc).toContain("from('user_notification_prefs').upsert")
  })

  it('si las notificaciones del móvil están desactivadas lo dice, SIN pedir ningún permiso', () => {
    expect(prefsSrc).toContain('Las notificaciones de este móvil están desactivadas')
    expect(prefsSrc).not.toMatch(/requestPermission|enablePushNotifications|subscribe\(/)
    expect(prefsSrc).toContain('hasPushSubscription()')
  })

  it('vive dentro de «Horarios de tus avisos» (una sola carga de ajustes) y el resumen único antiguo ya no está', () => {
    expect(cardSrc).toContain('<TaskSummaryPrefs prefs={prefs} onSave={save} />')
    expect(cardSrc).not.toContain('dailySummary')
    expect(cardSrc).not.toContain('type="time"')
  })

  it('los estilos del selector no dependen del formato del móvil y los controles miden 44 px', () => {
    const css = readFileSync(join(process.cwd(), 'src/ui/styles.css'), 'utf8')
    expect(css).toMatch(/\.time-select-24-row select\s*\{[^}]*min-height:\s*44px/)
  })
})
