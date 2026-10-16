// Campana de avisos: solo en Inicio (arriba a la derecha), panel con sus reglas, ajustes y casilla «Aviso a toda la familia». Se leen los textos de los componentes.
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import home from '@/ui/HomeScreen.tsx?raw'
import bell from '@/ui/NotificationBell.tsx?raw'
import panel from '@/ui/NotificationPanel.tsx?raw'
import modalHook from '@/ui/useModalDialog.ts?raw'
import prefs from '@/ui/NotificationPrefsCard.tsx?raw'
import mode from '@/ui/TaskNotifyModeCard.tsx?raw'
import settings from '@/ui/MenuSettingsScreen.tsx?raw'
import calendar from '@/ui/CalendarScreen.tsx?raw'

const css = readFileSync(join(process.cwd(), 'src/ui/styles.css'), 'utf8')

describe('la campana', () => {
  it('está en Inicio, por encima del saludo, y SOLO en Inicio', () => {
    expect(home).toContain('<NotificationBell />')
    expect(home.indexOf('<NotificationBell />')).toBeLessThan(home.indexOf('className="home-header"'))
    const dir = join(process.cwd(), 'src/ui')
    const others = readdirSync(dir).filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx') && f !== 'HomeScreen.tsx' && f !== 'NotificationBell.tsx')
    for (const f of others) expect(readFileSync(join(dir, f), 'utf8'), f).not.toContain('<NotificationBell')
  })

  it('está fuera de las tarjetas de accesos rápidos (cuyo orden cambia por persona)', () => {
    const grid = home.slice(home.indexOf('className="card-grid"'))
    expect(grid).not.toContain('NotificationBell')
  })

  it('está arriba a la derecha y el contador es el de sin leer, sin consulta periódica', () => {
    expect(css).toMatch(/\.home-bell-row\s*\{[^}]*justify-content:\s*flex-end/)
    expect(bell).toContain('fetchUnreadNotificationCount')
    expect(bell).not.toContain('setInterval')
  })
})

describe('el panel', () => {
  it('se abre sobre Inicio (no navega) y se cierra con Escape y volviendo a la misma posición', () => {
    // Escape, foco y fondo inerte viven en useModalDialog (INC-20); el panel lo usa.
    expect(panel).toContain('useModalDialog(panelRef')
    expect(modalHook).toContain("e.key === 'Escape'")
    expect(panel).toContain('role="dialog"')
    expect(css).toMatch(/\.notification-overlay\s*\{[^}]*position:\s*fixed/)
    expect(css).toMatch(/@media \(min-width: 640px\)\s*\{\s*\.notification-panel\s*\{[^}]*max-width:\s*420px/)
  })

  it('abrir el panel NO marca nada como leído; abrir un aviso sí; marcar todas es una acción aparte', () => {
    const effects = panel.slice(panel.indexOf('useEffect(() => {'), panel.indexOf('const views'))
    expect(effects).not.toContain('markNotificationsRead')
    expect(effects).not.toContain('markAllNotificationsRead')
    expect(panel).toContain('markNotificationsRead([n.id])')
    expect(panel).toContain('Marcar todas como leídas')
  })

  it('dos bloques plegables, anteriores plegadas bajo «Ver anteriores (X)» y borrar con confirmación', () => {
    expect(panel).toContain('buildBucketViews')
    expect(panel).toContain('Ver anteriores (${view.earlier.length})')
    expect(panel).toContain('aria-expanded')
    expect(panel).toContain('¿Eliminar')
    expect(panel).toContain('Seleccionar todas')
  })

  it('borrar avisos no toca el objeto original: solo borra de user_notifications', () => {
    const data = readFileSync(join(process.cwd(), 'src/data/notifications.ts'), 'utf8')
    expect(data).toContain("from('user_notifications').delete()")
    expect(data).not.toContain("from('calendar_events')")
  })

  it('los enlaces solo van a rutas internas', () => {
    expect(panel).toContain('safeInternalUrl(n.url)')
  })
})

describe('ajustes', () => {
  it('los ajustes por persona y el ajuste familiar están en Configuración (grupo Avisos)', () => {
    expect(settings).toContain('<NotificationPrefsCard />')
    expect(settings).toContain("<TaskNotifyModeCard familyId={profile.familyId} isAdmin={profile.role === 'admin'} />")
  })

  it('el ajuste familiar solo lo cambia un administrador y ofrece exactamente los dos modos aprobados', () => {
    expect(mode).toContain('!isAdmin')
    expect(mode).toContain('TASK_NOTIFY_MODE_OPTIONS')
    expect(mode).toContain('Solo un administrador de la familia puede cambiar este ajuste.')
  })

  it('la zona horaria no se cambia sola: se ofrece usar la del móvil', () => {
    expect(prefs).toContain('Usar esa zona')
    expect(prefs).not.toMatch(/useEffect\(\(\) => \{[^}]*detectDeviceTimezone\(\)[^}]*save\(/s)
  })
})

describe('casilla «Aviso a toda la familia»', () => {
  it('está en los tres formularios (editar y los dos de crear) y se guarda con el elemento', () => {
    expect((calendar.match(/<NotifyFamilyCheckbox /g) ?? []).length).toBe(3)
    expect((calendar.match(/notifyFamily: visibility === 'private' \? false : notifyFamily,/g) ?? []).length).toBe(3)
  })

  it('empieza desmarcada en los formularios de crear', () => {
    expect((calendar.match(/\[notifyFamily, setNotifyFamily\] = useState\(false\)/g) ?? []).length).toBe(2)
    expect(calendar).toContain('[notifyFamily, setNotifyFamily] = useState(event.notifyFamily === true)')
  })
})
