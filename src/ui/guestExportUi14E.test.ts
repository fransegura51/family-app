import { describe, expect, it } from 'vitest'

// Fase 14E.1 — cableado del botón "Exportar invitados" en EventosScreen
// (GuestsSection) y del modal src/ui/GuestExportModal.tsx. La lógica de
// exportación en sí (modelo canónico, las 3 vistas, pendientes de
// identificar, aforo, RSVP, privacidad) se prueba exhaustivamente en
// src/domain/guestExport.test.ts, junto a esas funciones — aquí solo se
// comprueba que la pantalla abre/cierra el modal correcto y que el
// modal es un componente aparte (no vive dentro de EventosScreen.tsx).
const EVENTOS_APP = import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const EVENTOS_SRC = EVENTOS_APP['/src/ui/EventosScreen.tsx']

const MODAL_APP = import.meta.glob('/src/ui/GuestExportModal.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const MODAL_SRC = MODAL_APP['/src/ui/GuestExportModal.tsx']

function window(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('Botón "Exportar invitados" en GuestsSection (TEST: entrada junto a Diseño de la invitación)', () => {
  it('EventosScreen.tsx importa GuestExportModal desde su propio archivo — la lógica no vive en EventosScreen.tsx', () => {
    expect(EVENTOS_SRC).toContain("import { GuestExportModal } from '@/ui/GuestExportModal'")
  })

  it('el botón "📤 Exportar invitados" está junto a "🎨 Diseño de la invitación" dentro de GuestsSection', () => {
    const section = window(EVENTOS_SRC, 'function GuestsSection', '\nfunction EventOpenLinkBlock')
    const header = window(section, "<strong>👥 Invitados</strong>", '</div>\n      </div>')
    expect(header).toContain('📤 Exportar invitados')
    expect(header).toContain('🎨 Diseño de la invitación')
    expect(header).toContain('setShowExport(true)')
  })

  it('el modal se abre/cierra con su propio estado y se le pasa el evento completo', () => {
    const section = window(EVENTOS_SRC, 'function GuestsSection', '\nfunction EventOpenLinkBlock')
    expect(section).toContain('const [showExport, setShowExport] = useState(false)')
    expect(section).toContain('{showExport && <GuestExportModal event={event} onClose={() => setShowExport(false)} />}')
  })
})

describe('GuestExportModal — organizar por / incluir (TEST: 3 modos, 2 filtros)', () => {
  it('ofrece exactamente 3 formas de organizar: mesas, familias, alfabético', () => {
    const options = window(MODAL_SRC, 'const ORGANIZE_OPTIONS', ']\n')
    expect(options).toContain("value: 'mesas'")
    expect(options).toContain("value: 'familias'")
    expect(options).toContain("value: 'alfabetico'")
  })

  it('ofrece exactamente 2 filtros de asistencia: todos, confirmados (sin "pendientes" todavía)', () => {
    const options = window(MODAL_SRC, 'const ATTENDANCE_OPTIONS', ']\n')
    expect(options).toContain("value: 'todos'")
    expect(options).toContain("value: 'confirmados'")
    expect(options).not.toContain("value: 'pendiente'")
  })

  it('carga invitados, personas desglosadas y mesas del evento — nada se escribe, solo se lee', () => {
    expect(MODAL_SRC).toContain('listEventGuests(event.id)')
    expect(MODAL_SRC).toContain('listEventGuestMembersForEvent(event.id)')
    expect(MODAL_SRC).toContain('listEventTables(event.id)')
  })

  it('reutiliza el patrón de modal ya establecido (.modal-overlay/.modal-sheet), no uno nuevo', () => {
    expect(MODAL_SRC).toContain('className="modal-overlay"')
    expect(MODAL_SRC).toContain('className="modal-sheet"')
  })
})

describe('Fase 14E.2 — botón CSV (TEST: descarga el mismo modelo canónico, sin infraestructura nueva)', () => {
  it('el botón "📊 CSV" llama a guestExportCsv/guestExportFilename (domain, puro) y downloadTextFile (services, efecto de navegador)', () => {
    expect(MODAL_SRC).toContain("import { downloadTextFile } from '@/services/exportFile'")
    expect(MODAL_SRC).toContain('guestExportCsv(model, organize)')
    expect(MODAL_SRC).toContain("guestExportFilename(event.title, organize, 'csv')")
    expect(MODAL_SRC).toContain('📊 CSV')
  })

  it('pide BOM UTF-8 en la descarga, para que Excel/Numbers reconozcan bien ñ y tildes', () => {
    expect(MODAL_SRC).toContain("'text/csv;charset=utf-8', true)")
  })
})

describe('Fase 14E.3 — botón Imprimir/PDF (TEST: reutiliza el mismo modelo, sin librería PDF)', () => {
  it('el botón "📄 Imprimir / PDF" llama a guestExportReportHtml (domain, puro) y openPrintReport (services, efecto de navegador)', () => {
    expect(MODAL_SRC).toContain("import { openPrintReport } from '@/services/printReport'")
    expect(MODAL_SRC).toContain('openPrintReport(')
    expect(MODAL_SRC).toContain('guestExportReportHtml(')
    expect(MODAL_SRC).toContain('📄 Imprimir / PDF')
  })

  it('no instala ninguna librería PDF — el HTML se abre en pestaña nueva y usa window.print()', () => {
    const PRINT_SRC = (import.meta.glob('/src/services/printReport.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
      '/src/services/printReport.ts'
    ]
    expect(PRINT_SRC).toContain("window.open('', '_blank')")
    expect(PRINT_SRC).toContain('win.print()')
    expect(PRINT_SRC).not.toMatch(/jspdf|pdf-lib|pdfmake/i)
  })
})

describe('Fase 14E.4 — botón Compartir (TEST: prioriza archivo CSV, cae a texto, luego al modal de PEPA ya existente)', () => {
  it('reutiliza services/share.ts (canShareFiles/shareFiles/shareText) — ninguna infraestructura paralela', () => {
    expect(MODAL_SRC).toContain("import { canShareFiles, shareFiles, shareText } from '@/services/share'")
  })

  it('prioriza compartir el CSV como archivo cuando el teléfono lo permite de verdad', () => {
    const body = window(MODAL_SRC, 'async function handleShare', '\n  return (')
    expect(body).toContain('canShareFiles([csvFile])')
    expect(body).toContain('shareFiles([csvFile]')
  })

  it('si el archivo no se puede compartir, cae a un texto humano (guestListText), nunca al CSV en crudo', () => {
    const body = window(MODAL_SRC, 'async function handleShare', '\n  return (')
    expect(body).toContain('guestListText(event.title, attendance, buildShareTextInput())')
    expect(body).toContain('shareText({ title, text })')
  })

  it('si tampoco eso funciona, cae al modal de copiar/WhatsApp/email ya establecido en PEPA (ShareFallbackModal)', () => {
    expect(MODAL_SRC).toContain("import { ShareFallbackModal } from '@/ui/ShareFallbackModal'")
    expect(MODAL_SRC).toContain('setManualShare({ title, text })')
    expect(MODAL_SRC).toContain('{manualShare && <ShareFallbackModal')
  })

  it('el botón "📤 Compartir" existe y se deshabilita mientras se comparte (evita doble toque)', () => {
    expect(MODAL_SRC).toContain('📤 Compartir')
    expect(MODAL_SRC).toContain('onClick={handleShare} disabled={sharing}')
  })
})
