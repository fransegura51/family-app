import { describe, expect, it } from 'vitest'

// Revisión Calendario (instrucción explícita de la usuaria) — "Externos" desaparece del menú de vistas
// de Calendario; sus funciones (Google Calendar, exportar al móvil, calendarios enlazados, añadir nuevo)
// se integran en Configuración → Calendario, junto a lo que ya existía ahí (colores, categorías).
// Traslado de INTERFAZ y navegación solamente — los mecanismos reales de sincronización/OAuth/iCal
// (googleCalendarSync.ts/externalCalendarFeeds.ts/calendarExport.ts) no se tocan en absoluto.
const CALENDAR_SRC = (import.meta.glob('/src/ui/CalendarScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/CalendarScreen.tsx']
const MENU_SRC = (import.meta.glob('/src/state/calendarioMenu.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/state/calendarioMenu.ts']
const SETTINGS_SRC = (import.meta.glob('/src/ui/MenuSettingsScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/MenuSettingsScreen.tsx']

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('"Externos" ya no es una vista del menú de Calendario', () => {
  it('FixedCalendarioMenuItemKey/CALENDARIO_MENU_ITEM_META/DEFAULT_KEYS ya no incluyen "Externos"', () => {
    expect(MENU_SRC).not.toContain("'Externos'")
    expect(MENU_SRC).not.toContain('Externos:')
  })
  it('el VIEWS/dispatch de CalendarScreen.tsx ya no tiene una rama para Externos', () => {
    expect(CALENDAR_SRC).not.toContain("view === 'Externos'")
    expect(CALENDAR_SRC).not.toContain('ExternalCalendarTab')
  })
  it('un layout guardado en localStorage con "Externos" (de antes de este traslado) se purga al cargar, nunca intenta pintar un icono/etiqueta inexistente', () => {
    expect(MENU_SRC).toContain('isCustomCalendarioMenuKey(it.key) || (DEFAULT_KEYS as readonly string[]).includes(it.key)')
  })
})

describe('"⚙️ Gestionar calendarios" — acceso secundario, nunca una vista más del menú reordenable', () => {
  it('es un <Link> fijo a /menu-organizar con el grupo "calendario" ya abierto (mismo patrón que Economía)', () => {
    expect(CALENDAR_SRC).toContain('<Link to="/menu-organizar" state={{ group: \'calendario\' }} className="economia-menu-item" onClick={onClose}>')
    expect(CALENDAR_SRC).toContain('Gestionar calendarios')
  })
  it('no es un ViewMode — isCalendarioSubTab nunca lo reconoce como vista activable', () => {
    expect(CALENDAR_SRC).not.toMatch(/VIEWS = \[.*'Gestionar calendarios'/)
  })
})

describe('Configuración → Calendario — las 4 piezas de Externos, integradas sin duplicar nada', () => {
  const SECTION = slice(SETTINGS_SRC, 'function CalendarExternalLinksSection() {', '\ntype SettingsGroupId')

  it('el grupo "Calendario" las reúne junto a lo que ya había (colores, categorías)', () => {
    const group = slice(SETTINGS_SRC, 'title="Calendario"', '</SettingsGroup>')
    expect(group).toContain('<CalendarPreferencesSection />')
    expect(group).toContain('<CalendarCategoriesSection />')
    expect(group).toContain('<CalendarExternalLinksSection />')
  })

  it('bug real corregido: el título de Google Calendar ya NO dice "Conectar" cuando ya está conectado', () => {
    const google = slice(SETTINGS_SRC, 'function GoogleCalendarSettingsCard() {', '\nfunction CalendarExportSettingsCard(')
    expect(google).toContain("status?.connected ? 'Google Calendar conectado' : 'Conectar con Google Calendar (recomendado)'")
  })

  it('Google conectado muestra última sincronización y Desconectar; sin conectar, solo el botón Conectar', () => {
    const google = slice(SETTINGS_SRC, 'function GoogleCalendarSettingsCard() {', '\nfunction CalendarExportSettingsCard(')
    expect(google).toContain('<ConfirmButton label="Desconectar" onConfirm={disconnect} />')
    expect(google).toContain("{busy ? 'Abriendo Google…' : 'Conectar con Google'}")
  })

  it('"+ Enlazar calendario" sustituye al formulario siempre abierto: se despliega al pulsarlo y se pliega tras guardar', () => {
    expect(SECTION).toContain('+ Enlazar calendario')
    expect(SECTION).toContain('const [showAddForm, setShowAddForm] = useState(false)')
    expect(SECTION).toContain(
      'onAdded={() => {\n              reload()\n              setShowAddForm(false)\n            }}',
    )
  })

  it('el botón "+ Enlazar calendario" va ANTES de la lista de calendarios enlazados', () => {
    const btnIdx = SECTION.indexOf('+ Enlazar calendario')
    const listIdx = SECTION.indexOf('feeds.map((f) =>')
    expect(btnIdx).toBeGreaterThan(-1)
    expect(listIdx).toBeGreaterThan(btnIdx)
  })

  it('cada calendario enlazado muestra nombre, propietario, última sincronización, Sincronizar ahora y Quitar — en una tarjeta compacta propia', () => {
    expect(SECTION).toContain('className="card event-card calendar-linked-feed-card"')
    expect(SECTION).toContain('<MemberAvatar member={owner} size={20} />')
    expect(SECTION).toContain("{syncingId === f.id ? 'Sincronizando…' : 'Sincronizar ahora'}")
    expect(SECTION).toContain('<ConfirmButton label="Quitar" onConfirm={() => handleDeleteFeed(f.id)} />')
  })

  it('reutiliza TAL CUAL los mismos mecanismos de sincronización/OAuth/iCal — nada reimplementado', () => {
    expect(SETTINGS_SRC).toContain("from '@/data/googleCalendarSync'")
    expect(SETTINGS_SRC).toContain("from '@/data/externalCalendarFeeds'")
    expect(SETTINGS_SRC).toContain("from '@/data/calendarExport'")
  })

  it('AddLinkedCalendarForm conserva los mismos campos y validaciones (nombre, URL .ics, de quién, festivos)', () => {
    const form = slice(SETTINGS_SRC, 'function AddLinkedCalendarForm(', '\nfunction CalendarExternalLinksSection(')
    expect(form).toContain('addFeed({ name, icsUrl, memberId: memberId || null, isHolidayCalendar })')
    expect(form).toContain('Es un calendario de festivos')
  })
})
