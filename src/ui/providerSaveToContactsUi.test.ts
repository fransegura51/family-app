import { describe, expect, it } from 'vitest'

// PEPA Eventos, prompt maestro Parte A7 — "Guardar en contactos" en las dos pantallas de Proveedores
// (registro global y dentro de un evento), una sola implementación compartida (saveProviderToContacts),
// nunca una copia por pantalla. Comparte primero (móvil) y SOLO si no hay soporte real cae a descargar
// el .vcf — nunca al revés, y nunca modifica la ficha de PEPA (no llama a update/add de ningún proveedor).
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('saveProviderToContacts — comparte si puede, descarga si no, nunca toca la ficha de PEPA', () => {
  const fn = window_(UI, 'async function saveProviderToContacts(', '\n}')

  it('genera el .vcf con buildVcf (nunca inventa un formato propio)', () => {
    expect(fn).toContain('buildVcf(provider)')
  })
  it('si puede compartir archivos, comparte PRIMERO; el return early evita además descargarlo', () => {
    expect(fn).toContain('if (canShareFiles([file])) {')
    const shareBlock = window_(fn, 'if (canShareFiles([file])) {', 'downloadTextFile')
    expect(shareBlock).toContain('await shareFiles([file]')
    expect(shareBlock).toContain('if (shared) return')
  })
  it('nunca llama a updateProviderGlobal/addEventProvider/updateEventProvider — exportar no modifica nada', () => {
    expect(fn).not.toContain('updateProviderGlobal')
    expect(fn).not.toContain('addEventProvider')
    expect(fn).not.toContain('updateEventProvider')
  })
})

// Bloque B1 (prompt maestro "Continuidad automática") — las dos pantallas dejaron de repetir cada botón
// (Editar/Guardar en contactos/Descartar.../Archivar...) por su cuenta: ahora comparten un único menú ⋯
// (ProviderCardMenu) que es quien de verdad llama a saveProviderToContacts — una sola implementación,
// nunca una copia por pantalla. Esto hace el test ANTERIOR más fuerte, no más débil: antes había que
// confiar en que las dos copias se mantuvieran iguales a mano; ahora es estructuralmente imposible que
// diverjan.
describe('"📱 Guardar en contactos" está disponible en el registro global Y dentro de un evento, vía el menú ⋯ compartido', () => {
  it('ProviderCardMenu (el único sitio que llama a saveProviderToContacts) usa el proveedor recibido por props', () => {
    const menu = window_(UI, 'function ProviderCardMenu(', '\nfunction ProvidersGlobalScreen(')
    expect(menu).toContain('onClick={() => void saveProviderToContacts(provider)}')
  })
  it('ProvidersGlobalScreen renderiza ProviderCardMenu en cada ficha (así hereda "Guardar en contactos")', () => {
    const screen = window_(UI, 'function ProvidersGlobalScreen(', '\nfunction AddProviderGlobalForm(')
    expect(screen).toContain('<ProviderCardMenu')
  })
  it('ProvidersSection (dentro de un evento) también renderiza ProviderCardMenu, sobre la ficha global vinculada', () => {
    const section = window_(UI, 'function ProvidersSection({ eventId }', '\nfunction LinkExistingProviderForm(')
    expect(section).toContain('<ProviderCardMenu')
  })
})
