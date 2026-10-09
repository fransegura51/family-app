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

describe('"📱 Guardar en contactos" está disponible en el registro global Y dentro de un evento', () => {
  it('ProvidersGlobalScreen lo ofrece en cada ficha', () => {
    const screen = window_(UI, 'function ProvidersGlobalScreen(', '\nfunction AddProviderGlobalForm(')
    expect(screen).toContain('onClick={() => void saveProviderToContacts(p)}')
  })
  it('ProvidersSection (dentro de un evento) también lo ofrece, sobre la ficha global vinculada', () => {
    const section = window_(UI, 'function ProvidersSection({ eventId }', '\nfunction LinkExistingProviderForm(')
    expect(section).toContain('onClick={() => void saveProviderToContacts(g)}')
  })
})
