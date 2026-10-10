import { describe, expect, it } from 'vitest'

// PEPA — Prompt maestro "Continuidad automática + Pequeños Grandes + Eventos", Bloque B: proveedores y
// ofertas más compactos. Esta parte cubre B1 (menú ⋯ de proveedor, botones arriba), B5 (reutilizar
// FileOrPdfPicker para importar con IA, en vez de un <input type=file> suelto; adjuntos sin recortar en
// móvil) y B6 (menú ⋯ de oferta). B2/B3/B4 (unificar Texto libre/Desglosado) se cubren en su propio
// archivo de test.
const UI = (import.meta.glob('/src/ui/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']
const PICKER = (import.meta.glob('/src/ui/FileOrPdfPicker.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/FileOrPdfPicker.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('B1 — ProviderCardMenu: mismo patrón ⋯ que Familia (member-row-more/member-row-actions), nunca uno nuevo', () => {
  const menu = window_(UI, 'function ProviderCardMenu(', '\nfunction ProvidersGlobalScreen(')

  it('reutiliza las clases member-row-more/member-row-actions ya usadas en FamilyScreen.tsx', () => {
    expect(menu).toContain('className="member-row-more"')
    expect(menu).toContain('className="member-row-actions"')
  })
  it('Editar, llamar (tel:), email (mailto: + copiar) y "Guardar en contactos" son comunes a las 2 pantallas', () => {
    expect(menu).toContain('href={`tel:${provider.phone}`}')
    expect(menu).toContain('href={`mailto:${provider.email}`}')
    expect(menu).toContain('navigator.clipboard')
    expect(menu).toContain('saveProviderToContacts(provider)')
  })
  it('tel:/mailto: solo se muestran si el proveedor tiene ese dato (nunca un control vacío)', () => {
    expect(menu).toContain('{provider.phone && (')
    expect(menu).toContain('{provider.email && (')
  })
})

describe('B1 — ProvidersGlobalScreen y ProvidersSection: botones + arriba, ayuda plegable, tarjetas con ProviderCardMenu', () => {
  const globalScreen = window_(UI, 'function ProvidersGlobalScreen(', '\nfunction AddProviderGlobalForm(')
  const eventSection = window_(UI, 'function ProvidersSection(', '\nfunction LinkExistingProviderForm(')

  it('"+ Nuevo proveedor" (registro global) va antes de la lista, no al final como antes', () => {
    const addIndex = globalScreen.indexOf('+ Nuevo proveedor')
    const listIndex = globalScreen.indexOf("className=\"event-list\"")
    expect(addIndex).toBeGreaterThan(-1)
    expect(listIndex).toBeGreaterThan(-1)
    expect(addIndex).toBeLessThan(listIndex)
  })
  it('"+ Nuevo proveedor"/"+ Vincular proveedor existente" (por evento) van antes de la lista y de los filtros De interés/Todos/Descartados', () => {
    const addIndex = eventSection.indexOf('+ Nuevo proveedor')
    const linkIndex = eventSection.indexOf('+ Vincular proveedor existente')
    const filtersIndex = eventSection.indexOf('De interés')
    const listIndex = eventSection.indexOf('className="event-list"')
    expect(addIndex).toBeGreaterThan(-1)
    expect(linkIndex).toBeGreaterThan(-1)
    expect(addIndex).toBeLessThan(filtersIndex)
    expect(linkIndex).toBeLessThan(filtersIndex)
    expect(addIndex).toBeLessThan(listIndex)
  })
  it('el texto introductorio largo queda detrás de un toggle "ℹ️ Qué es esto", no siempre visible', () => {
    expect(globalScreen).toContain("setShowIntro((v) => !v)")
    expect(globalScreen).toContain('{showIntro && (')
    expect(eventSection).toContain('setShowIntro((v) => !v)')
    expect(eventSection).toContain('{showIntro && (')
  })
  it('los filtros De interés/Todos/Descartados se conservan tal cual', () => {
    expect(eventSection).toContain("De interés")
    expect(eventSection).toContain('Todos')
    expect(eventSection).toContain('Descartados{descartadosCount')
  })
  it('las tarjetas usan ProviderCardMenu en vez de los botones sueltos de antes', () => {
    expect(globalScreen).toContain('<ProviderCardMenu')
    expect(eventSection).toContain('<ProviderCardMenu')
    expect(globalScreen).not.toContain("'♻️ Reactivar' : '📦 Archivar'}\n                  confirmMessage")
  })
  it('"Desvincular" (por evento) y "Archivar/Reactivar" (registro global) van en extraActions — ninguna de las 2 pantallas inventa un "borrar" que no existe en la capa de datos', () => {
    expect(eventSection).toContain('label="Desvincular"')
    expect(globalScreen).toContain("label={p.archived ? '♻️ Reactivar' : '📦 Archivar'}")
    expect(UI).not.toContain('deleteProviderGlobal')
  })
})

describe('B5 — FileOrPdfPicker reutilizado en los 2 botones de importar con IA, nunca un <input type=file> suelto', () => {
  it('ImportOfferBudgetButton usa FileOrPdfPicker con sheetTitle (Cámara/Galería/Archivo)', () => {
    const fn = window_(UI, 'function ImportOfferBudgetButton(', '\nfunction AddOfferForm(')
    expect(fn).toContain('<FileOrPdfPicker')
    expect(fn).toContain('sheetTitle="Importar presupuesto"')
    expect(fn).not.toContain('type="file"')
  })
  it('ImportProviderPhotoButton usa FileOrPdfPicker con sheetTitle', () => {
    const fn = window_(UI, 'function ImportProviderPhotoButton(', '\n// Campos ampliados')
    expect(fn).toContain('<FileOrPdfPicker')
    expect(fn).toContain('sheetTitle="Importar datos del proveedor"')
    expect(fn).not.toContain('type="file"')
  })
  it('FileOrPdfPicker importado una sola vez, reutilizado — nunca un segundo selector construido a mano', () => {
    const matches = UI.match(/<FileOrPdfPicker/g) ?? []
    expect(matches.length).toBe(2)
  })
})

describe('B5 — FIX REAL: el nombre de archivo del picker ya no se sale de la pantalla en móvil', () => {
  it('el nombre elegido va en un span con ellipsis (overflow/text-overflow/white-space), nunca sin límite de ancho', () => {
    const block = window_(PICKER, 'if (sheetTitle) {', '\n  }')
    expect(block).toContain("textOverflow: 'ellipsis'")
    expect(block).toContain("whiteSpace: 'nowrap'")
    expect(block).toContain("maxWidth: '100%'")
  })
})

describe('B5 — adjuntos de una oferta (📎 nombre) también con ellipsis, nunca cortados sin aviso', () => {
  it('las 2 tarjetas de oferta (ProviderOffersPanel y OffersComparison) llevan el mismo arreglo, reutilizado también por el adjunto de un proveedor (Parte A6)', () => {
    const matches = UI.match(/textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom'/g) ?? []
    expect(matches.length).toBe(3)
  })
})

describe('B6 — OfferCardMenu: Editar/Descartar/Eliminar en un ⋯, "Seleccionar"/"Usar esta oferta" se quedan fuera (son la acción principal, no mantenimiento)', () => {
  const menu = window_(UI, 'function OfferCardMenu(', '\nfunction OffersComparison(')

  it('mismo patrón member-row-more/member-row-actions que ProviderCardMenu, nunca uno nuevo', () => {
    expect(menu).toContain('className="member-row-more"')
    expect(menu).toContain('className="member-row-actions"')
  })
  it('las 3 acciones del menú: Editar oferta, Descartar/Recuperar oferta, Eliminar oferta (ConfirmIconButton, dos toques)', () => {
    expect(menu).toContain('✏️ Editar oferta')
    expect(menu).toContain("discarded ? '↩️ Recuperar oferta' : '🗑 Descartar oferta'")
    expect(menu).toContain('<ConfirmIconButton')
  })
  it('se usa en las 2 tarjetas de oferta (proveedor suelto y dentro de un encargo)', () => {
    const matches = UI.match(/<OfferCardMenu/g) ?? []
    expect(matches.length).toBe(2)
  })
  it('"✓ Seleccionar" y "Usar esta oferta al resolver" siguen visibles fuera del menú, en OffersComparison', () => {
    const fn = window_(UI, 'function OffersComparison(', '\nfunction AddOfferForm(')
    expect(fn).toContain('✓ Seleccionar')
    expect(fn).toContain('Usar esta oferta al resolver')
  })
})

describe('resolveEventTaskGroup — contratar un encargo sigue sin completar sus tareas (Bloque C, regla 8)', () => {
  it('ningún cambio de este bloque toca esa función ni su comentario explícito', () => {
    const fn = window_(UI, 'function ResolveGroupModal(', '\n}')
    expect(fn).not.toMatch(/marcar.*tareas.*completad/i)
  })
})
