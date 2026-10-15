// INC-20: accesibilidad del panel de la campana. Estructura (se leen los textos); el comportamiento real con teclado y lector se comprobó a mano en el
// navegador (ver el informe) y la lógica del atrapa-foco está en domain/focusTrap.test.ts.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import bell from '@/ui/NotificationBell.tsx?raw'
import panel from '@/ui/NotificationPanel.tsx?raw'
import hook from '@/ui/useModalDialog.ts?raw'

const css = readFileSync(join(process.cwd(), 'src/ui/styles.css'), 'utf8')

// Bloque de CSS de una regla concreta (la primera con ese selector exacto).
function rule(selector: string): string {
  const start = css.indexOf(`\n${selector} {`)
  expect(start, `falta la regla ${selector}`).toBeGreaterThan(-1)
  return css.slice(start, css.indexOf('}', start) + 1)
}

describe('el panel es un diálogo modal de verdad', () => {
  it('role=dialog, aria-modal y un nombre (aria-labelledby apunta al título)', () => {
    expect(panel).toContain('role="dialog"')
    expect(panel).toContain('aria-modal="true"')
    expect(panel).toContain('aria-labelledby={titleId}')
    expect(panel).toContain('<h2 id={titleId}>Avisos</h2>')
    expect(panel).toContain('tabIndex={-1}') // se puede enfocar por código
  })

  it('se dibuja con un portal fuera de #root, para poder dejar inerte el fondo sin afectar al panel', () => {
    expect(panel).toContain('createPortal(')
    expect(panel).toContain('document.body')
    expect(hook).toContain("backgroundId = 'root'")
  })

  it('el foco entra en el panel, queda atrapado, Escape cierra y el foco vuelve al botón de la campana', () => {
    expect(panel).toContain('useModalDialog(panelRef, { onClose, returnFocusRef })')
    expect(hook).toContain('panel.focus({ preventScroll: true })')
    expect(hook).toContain("e.key !== 'Tab'")
    expect(hook).toContain('trapFocusTarget(items.length, current, e.shiftKey)')
    expect(hook).toContain('e.preventDefault()')
    expect(hook).toContain("addEventListener('focusin', onFocusIn)")
    expect(hook).toContain("e.key === 'Escape'")
    expect(hook).toContain('back.focus({ preventScroll: true })')
    expect(bell).toContain('returnFocusRef={buttonRef}')
    expect(bell).toContain('ref={buttonRef}')
  })

  it('el fondo no se desplaza y queda no interactivo (inert + aria-hidden), y se restaura al cerrar', () => {
    expect(hook).toContain("body.style.overflow = 'hidden'")
    expect(hook).toContain("background?.setAttribute('inert', '')")
    expect(hook).toContain("background?.setAttribute('aria-hidden', 'true')")
    expect(hook).toContain('body.style.overflow = previousOverflow')
    expect(hook).toContain("background.removeAttribute('inert')")
  })

  it('cierra con el botón, con Escape y tocando fuera (sin cerrar al tocar dentro del panel)', () => {
    expect(panel).toContain('aria-label="Cerrar avisos"')
    expect(panel).toContain('className="notification-overlay" role="presentation" onClick={onClose}')
    expect(panel).toContain('onClick={(e) => e.stopPropagation()}')
  })
})

describe('contenido con semántica para el lector de pantalla', () => {
  it('lista con ul/li y cada aviso es un botón (Enter y Espacio) con su estado en texto', () => {
    expect(panel).toContain('<ul className="notification-list">')
    expect(panel).toContain('<li key={n.id}')
    expect(panel).toContain('<button type="button" className="notification-item-main"')
    expect(panel).toContain("{isUnread ? 'Sin leer. ' : 'Leído. '}")
    expect(panel).toContain('relativeTime(n.createdAt)') // la hora relativa va en texto
    expect(panel).toContain('<span className="notification-dot" aria-hidden="true" />') // el punto azul es solo decoración
  })

  it('los dos bloques son secciones con título y se pliegan con aria-expanded y aria-controls', () => {
    expect(panel).toContain('<section key={view.bucket} className="notification-bucket" aria-label={view.title}>')
    expect(panel).toContain('<h3 className="notification-bucket-heading">')
    expect(panel).toContain('aria-expanded={!isCollapsed}')
    expect(panel).toContain('aria-controls={bodyId}')
    expect(panel).toContain('aria-expanded={earlierOpen}')
  })

  it('«Seleccionar» usa casillas con nombre y «Marcar todas como leídas» sigue siendo una acción aparte', () => {
    expect(panel).toContain('<span className="visually-hidden">Seleccionar: {n.title}</span>')
    expect(panel).toContain('Marcar todas como leídas')
    expect(panel).toContain('role="group" aria-label="Confirmar eliminación"')
  })

  it('anuncia al lector de pantalla (región «polite» discreta) cuántos hay sin leer y el resultado de cada acción', () => {
    expect(panel).toContain('role="status" aria-live="polite"')
    expect(panel).toContain('unreadAnnouncement(unreadCount(list))')
    expect(panel).toContain("'Todos los avisos están marcados como leídos.'")
    expect(panel).toContain("'Avisos eliminados.'")
    expect(panel).toContain('role="alert"') // los errores se leen al momento
  })

  it('el botón de la campana dice cuántos hay sin leer y si el panel está abierto; el contador solo se anuncia tras interactuar', () => {
    expect(bell).toContain("aria-label={unread > 0 ? `Avisos: ${unread} sin leer` : 'Avisos'}")
    expect(bell).toContain('aria-haspopup="dialog"')
    expect(bell).toContain('aria-expanded={open}')
    expect(bell).toContain('role="status" aria-live="polite"')
    expect(bell).toContain('if (interacted.current) setAnnouncement(unreadAnnouncement(unread))')
  })

  it('si el botón con el foco desaparece o se desactiva, el foco vuelve al panel (no se pierde en el fondo)', () => {
    expect(panel).toContain('active.disabled')
    expect(panel).toContain("panel.focus({ preventScroll: true })")
  })
})

describe('estilos', () => {
  it('objetivos táctiles de al menos 44 px', () => {
    expect(rule('.notification-bell')).toMatch(/min-width:\s*44px/)
    expect(rule('.notification-bell')).toMatch(/min-height:\s*44px/)
    expect(rule('.notification-close')).toMatch(/min-height:\s*44px/)
    expect(rule('.notification-close')).toMatch(/min-width:\s*44px/)
    expect(rule('.notification-panel .link-button')).toMatch(/min-height:\s*44px/)
    expect(rule('.notification-bucket-title')).toMatch(/min-height:\s*44px/)
    expect(rule('.notification-item-main')).toMatch(/min-height:\s*44px/)
    expect(rule('.notification-select')).toMatch(/width:\s*44px/)
  })

  it('en móvil el panel ocupa toda la pantalla sin desbordar; en ordenador es lateral', () => {
    expect(rule('.notification-panel')).toMatch(/width:\s*100%/)
    expect(rule('.notification-panel')).toMatch(/max-width:\s*100%/)
    expect(rule('.notification-item-main')).toMatch(/overflow-wrap:\s*anywhere/)
    expect(css).toMatch(/@media \(min-width: 640px\)\s*\{\s*\.notification-panel\s*\{[^}]*max-width:\s*420px/)
  })

  it('respeta prefers-reduced-motion: la animación de entrada solo si no se ha pedido menos movimiento', () => {
    expect(css).toContain('@media (prefers-reduced-motion: no-preference) {\n  .notification-panel {\n    animation: notification-panel-in')
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.notification-panel,\s*\.notification-overlay\s*\{\s*animation:\s*none/)
  })

  it('foco visible claro y texto oculto solo para lectores de pantalla', () => {
    expect(css).toContain('.notification-panel :focus-visible {')
    expect(rule('.visually-hidden')).toMatch(/clip:\s*rect\(0, 0, 0, 0\)/)
  })

  it('contraste: los botones de texto del panel, los errores y «peligro» usan colores oscuros (≥ 4,5:1 sobre blanco)', () => {
    // Relación de contraste WCAG calculada aquí mismo.
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const ratio = (fg: string, bg = '#ffffff') => (Math.max(lum(fg), lum(bg)) + 0.05) / (Math.min(lum(fg), lum(bg)) + 0.05)
    expect(rule('.notification-panel .link-button')).toContain('#364fc7')
    expect(rule('.notification-panel .link-button.danger')).toContain('#b42318')
    expect(rule('.notification-panel .error')).toContain('#b42318')
    expect(ratio('#364fc7')).toBeGreaterThanOrEqual(4.5)
    expect(ratio('#b42318')).toBeGreaterThanOrEqual(4.5)
    expect(ratio('#d92d20')).toBeGreaterThanOrEqual(4.5) // contador rojo con texto blanco
    expect(ratio('#6b7280')).toBeGreaterThanOrEqual(4.5) // texto secundario («hace 5 min»)
  })
})
