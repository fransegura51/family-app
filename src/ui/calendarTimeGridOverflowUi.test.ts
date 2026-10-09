import { describe, expect, it } from 'vitest'

// Bug real reportado en iPhone (vistas "3 días"/"Día", TimeGridView): un título largo de "todo el día" o
// de una Tarea desbordaba su columna y empujaba el documento entero a un ancho enorme con scroll
// horizontal. El mismo gesto horizontal que debía cambiar de periodo (3 días) se confundía con desplazar
// ese contenido desbordado. Causa confirmada en el navegador (DevTools, midiendo scrollWidth/clientWidth
// con un título largo real): flex items con texto en una sola línea (white-space:nowrap) sin min-width:0
// nunca se encogen por debajo del ancho de su propio contenido, por mucho que overflow:hidden esté puesto
// más adentro. Fix en styles.css: min-width:0 en .time-grid-allday-cell/.time-grid-allday-chip y en
// .time-grid-tasks-cell/.time-grid-task-row/.time-grid-task-title (este último con flex:1, porque sin
// flex-grow el título se queda a ancho 0 en vez de ocupar el hueco disponible). Verificado en vivo con
// `npm run dev` + la vista real: con un evento y una tarea de título largo, el documento ya no desborda
// (scrollWidth === clientWidth) en "3 días" ni en "Día", y el texto largo se ve recortado con "…" en vez
// de desbordar. No se comprueba el contenido de styles.css aquí: Vite deja en blanco los imports de .css
// (incluso con "?raw") en el entorno de test, y este proyecto no tiene las utilidades de Node ("fs") que
// haría falta para leer el fichero del disco directamente.

// Bug real reportado en iPhone (Vista Familiar): los dos botones flotantes de Calendario
// (calendar-fab-group, apilados) tapaban el final de la última tarjeta de la columna "Toda la familia" al
// hacer scroll hasta el final — confirmado midiendo el solape real en el navegador contra el hueco
// genérico que reserva .app-content (80px, pensado para un único FAB, insuficiente para dos apilados).
// Fix: .family-view-root (nueva clase en el contenedor raíz de Familiar) añade el hueco extra que le
// falta, sin tocar el padding genérico de .app-content que comparten el resto de pantallas de la app.
// Verificado en vivo: con la columna "Toda la familia" llena de tarjetas, al hacer scroll hasta el final
// real del documento (scrollTop = scrollHeight - clientHeight) ya no hay solape con los FAB.
const UI = (import.meta.glob('/src/ui/CalendarScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/CalendarScreen.tsx']

describe('FamilyDayView — hueco extra para que los FAB no tapen la última tarjeta', () => {
  it('el contenedor raíz de Familiar lleva la clase family-view-root', () => {
    expect(UI).toContain('<div className="family-view-root">')
  })
})

// Petición real (Configuración → Calendarios): enlace discreto para volver, ahora que la gestión de
// calendarios externos vive en Configuración en vez del antiguo "Externos" del propio Calendario.
const SETTINGS = (import.meta.glob('/src/ui/MenuSettingsScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/MenuSettingsScreen.tsx']

describe('Configuración → Calendario — enlace de vuelta', () => {
  it('"← Volver al calendario" enlaza a /calendario, dentro del grupo "Calendario"', () => {
    const start = SETTINGS.indexOf('title="Calendario"')
    expect(start).toBeGreaterThan(-1)
    const end = SETTINGS.indexOf('</SettingsGroup>', start)
    const group = SETTINGS.slice(start, end)
    expect(group).toContain('<Link to="/calendario" className="link-button">')
    expect(group).toContain('← Volver al calendario')
  })
})
