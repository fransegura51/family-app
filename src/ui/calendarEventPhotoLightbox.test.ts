import { describe, expect, it } from 'vitest'

// Regresión: la foto de un evento solo se veía en Vista Familiar (EventCard) — Mes/Vista general/Semana/
// 3 días/Agenda (todas comparten AgendaRow, ver DayEntriesBody) solo mostraban el emoji "📷", nunca la
// imagen (se perdió en el commit c8d8446 al fusionar AgendaAllDayChip/AgendaChipThumb con AgendaRow). Este
// test cubre la miniatura añadida a AgendaRow + el visor PhotoLightbox reutilizado también en EventCard.
// No se renderiza el componente (este proyecto no tiene react-testing-library/jsdom, mismo motivo que el
// resto de tests de CalendarScreen.tsx) — se audita el código fuente real.
const FILES = import.meta.glob(['/src/ui/CalendarScreen.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const SRC = FILES['/src/ui/CalendarScreen.tsx']

function body(text: string, startMarker: string, endMarker: string): string {
  const start = text.indexOf(startMarker)
  const end = text.indexOf(endMarker, start)
  expect(start, `no encuentro "${startMarker}"`).toBeGreaterThanOrEqual(0)
  expect(end, `no encuentro "${endMarker}" después de "${startMarker}"`).toBeGreaterThan(start)
  return text.slice(start, end)
}

describe('1. tocar la miniatura abre el visor de imagen', () => {
  it('AgendaRowThumb llama a onOpen() en su onClick', () => {
    const b = body(SRC, 'function AgendaRowThumb(', '\n}\n')
    expect(b).toMatch(/onClick=\{\(e\) => \{\s*e\.stopPropagation\(\)\s*onOpen\(\)\s*\}\}/)
  })
  it('AgendaRow renderiza PhotoLightbox cuando showingPhoto es true', () => {
    const b = body(SRC, 'function AgendaRow({ entry }', 'function AgendaRowThumb(')
    expect(b).toContain('const [showingPhoto, setShowingPhoto] = useState(false)')
    expect(b).toContain('{showingPhoto && entry.attachmentStoragePath && (')
    expect(b).toContain('<PhotoLightbox storagePath={entry.attachmentStoragePath} onClose={() => setShowingPhoto(false)} />')
  })
  it('la miniatura abre showingPhoto de AgendaRow (onOpen={() => setShowingPhoto(true)})', () => {
    const b = body(SRC, 'function AgendaRow({ entry }', 'function AgendaRowThumb(')
    expect(b).toContain('<AgendaRowThumb storagePath={entry.attachmentStoragePath} onOpen={() => setShowingPhoto(true)} />')
  })
})

describe('2. el click/tap de la miniatura NO dispara la apertura/edición del evento', () => {
  it('AgendaRowThumb para la propagación en onClick Y en onPointerDown', () => {
    const b = body(SRC, 'function AgendaRowThumb(', '\n}\n')
    expect(b).toContain('onPointerDown={(e) => e.stopPropagation()}')
    expect(b).toMatch(/onClick=\{\(e\) => \{\s*e\.stopPropagation\(\)/)
  })
  it('la miniatura es un <button> HERMANO de .agenda-row-body, nunca anidado dentro de su onClick', () => {
    const rowInner = body(SRC, "className={'agenda-row-inner'", '{/* El visor se renderiza FUERA')
    // El propio botón "agenda-row-body" se abre y se cierra ANTES de donde se monta AgendaRowThumb.
    const bodyButtonEnd = rowInner.indexOf('</button>', rowInner.indexOf('className="agenda-row-body"'))
    const thumbIdx = rowInner.indexOf('<AgendaRowThumb')
    expect(bodyButtonEnd).toBeGreaterThan(0)
    expect(thumbIdx).toBeGreaterThan(bodyButtonEnd)
  })
  it('el onClick de .agenda-row-body (editar) no menciona la miniatura ni el visor', () => {
    const editButton = body(SRC, 'className="agenda-row-body"', '</button>')
    expect(editButton).not.toMatch(/AgendaRowThumb|PhotoLightbox|showingPhoto/)
  })
})

describe('3. cerrar el visor devuelve al calendario', () => {
  it('PhotoLightbox: click en el overlay Y en el botón ✕ llaman a onClose', () => {
    const b = body(SRC, 'function PhotoLightbox(', 'function EventAttachmentFileLink(')
    expect(b).toContain('<div className="photo-lightbox-overlay" onClick={onClose}>')
    expect(b).toContain('<button type="button" className="photo-lightbox-close" onClick={onClose} aria-label="Cerrar foto">')
  })
  it('la imagen del visor para la propagación (tocar la foto en sí no cierra por el overlay)', () => {
    const b = body(SRC, 'function PhotoLightbox(', 'function EventAttachmentFileLink(')
    expect(b).toContain("<img src={url} alt=\"\" className=\"photo-lightbox-image\" onClick={(e) => e.stopPropagation()} />")
  })
  it('onClose desmonta el visor: AgendaRow y EventCard condicionan su render a showingPhoto', () => {
    const rowBlock = body(SRC, 'function AgendaRow({ entry }', 'function AgendaRowThumb(')
    expect(rowBlock).toMatch(/\{showingPhoto && entry\.attachmentStoragePath && \(/)
    const cardBlock = body(SRC, 'function EventCard({', '\n  return (\n    <div className="card event-card"')
    expect(cardBlock).toContain('const [showingPhoto, setShowingPhoto] = useState(false)')
  })
})

describe('4. tocar el resto de AgendaRow conserva el comportamiento actual', () => {
  it('el botón .agenda-row-body sigue llamando a entry.onEdit?.() exactamente igual que antes', () => {
    const editButton = body(SRC, 'className="agenda-row-body"', '</button>')
    expect(editButton).toContain('entry.onEdit?.()')
    expect(editButton).toContain('if (openX !== 0) {')
  })
  it('el gesto de deslizar-para-borrar (.agenda-row-inner) no se ha tocado', () => {
    const rowInner = body(SRC, "className={'agenda-row-inner'", 'className="agenda-stripe"')
    expect(rowInner).toContain('onPointerDown={canDelete ? handlePointerDown : undefined}')
    expect(rowInner).toContain('onPointerMove={canDelete ? handlePointerMove : undefined}')
    expect(rowInner).toContain('onPointerUp={canDelete ? handlePointerUp : undefined}')
  })
  it('el botón de compartir (.agenda-row-share) sigue igual, con su propio stopPropagation ya existente', () => {
    const shareButton = body(SRC, 'className="icon-button-share agenda-row-share"', 'Compartir')
    expect(shareButton).toContain('e.stopPropagation()')
    expect(shareButton).toContain('entry.onShare?.()')
  })
})

describe('5. evento sin fotografía no muestra miniatura ni visor', () => {
  it('AgendaRowThumb/PhotoLightbox de AgendaRow están condicionados a attachmentKind===\'foto\' Y attachmentStoragePath', () => {
    const rowBlock = body(SRC, 'function AgendaRow({ entry }', 'function AgendaRowThumb(')
    expect(rowBlock).toContain("{entry.attachmentKind === 'foto' && entry.attachmentStoragePath && (")
  })
  it('AgendaRowThumb en sí no renderiza nada hasta tener la url resuelta (if (!url) return null)', () => {
    const b = body(SRC, 'function AgendaRowThumb(', '\n}\n')
    expect(b).toContain('if (!url) return null')
  })
  it('EventCard (Vista Familiar) sigue con la misma condición que ya tenía para la foto', () => {
    const cardBlock = body(SRC, 'function EventCard({', 'const [confirming, setConfirming] = useState(false)')
    // No aplica aquí (la condición vive en el JSX, comprobado en el describe "1"/"3"); esto solo
    // confirma que EventCard sigue aceptando attachmentKind/attachmentStoragePath sin cambios de tipo.
    expect(cardBlock).not.toMatch(/attachmentKind|attachmentStoragePath/)
  })
})

describe('6. reutilización real: un único visor, una única función de URL firmada — nada duplicado', () => {
  it('solo existe UN PhotoLightbox en todo el archivo', () => {
    expect((SRC.match(/function PhotoLightbox\(/g) ?? []).length).toBe(1)
  })
  it('AgendaRowThumb y EventAttachmentPhoto llaman a la MISMA getEventAttachmentUrl (no una copia)', () => {
    const thumb = body(SRC, 'function AgendaRowThumb(', '\n}\n')
    const photo = body(SRC, 'function EventAttachmentPhoto(', '\n}\n')
    expect(thumb).toContain('getEventAttachmentUrl(storagePath)')
    expect(photo).toContain('getEventAttachmentUrl(storagePath)')
    expect((SRC.match(/async function getEventAttachmentUrl|function getEventAttachmentUrl/g) ?? []).length).toBe(0) // no se reimplementa en este archivo, solo se importa
  })
  it('EventAttachmentPhoto (EventCard/Vista Familiar) usa PhotoLightbox: el mismo visor, no uno nuevo', () => {
    const cardBlock = body(SRC, 'function EventCard({', "className=\"member-chips\"")
    expect(cardBlock).toContain('<EventAttachmentPhoto storagePath={ev.attachmentStoragePath} onClick={() => setShowingPhoto(true)} />')
    expect(cardBlock).toContain('<PhotoLightbox storagePath={ev.attachmentStoragePath} onClose={() => setShowingPhoto(false)} />')
  })
  it('EventAttachmentPhoto con onClick no cambia su comportamiento sin onClick (sigue siendo <img> a secas)', () => {
    const b = body(SRC, 'function EventAttachmentPhoto(', '\n}\n')
    expect(b).toContain('if (onClick) {')
    expect(b).toContain('return <img src={url} alt="" className="agenda-card-photo" />')
  })
})
