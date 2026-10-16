// El cambio de día deslizando no debe activarse al arrastrar dentro de un campo de escritura o de un formulario (bug real, 16/10/2026).
import { describe, expect, it } from 'vitest'
import calendar from '@/ui/CalendarScreen.tsx?raw'
import { isDaySwipeBlockedTarget, NO_DAY_SWIPE_SELECTOR } from '@/domain/swipeGuard'

// Un «elemento» de pruebas: `closest` responde que sí si el selector pedido es el nuestro y el elemento es de los que protegemos.
function fakeEl(protectedElement: boolean) {
  return { closest: (selector: string) => (protectedElement && selector === NO_DAY_SWIPE_SELECTOR ? {} : null) }
}

describe('isDaySwipeBlockedTarget', () => {
  it('un campo de escritura o un formulario bloquea el gesto de cambiar de día', () => {
    expect(isDaySwipeBlockedTarget(fakeEl(true))).toBe(true)
  })

  it('el resto del panel (tarjetas, huecos, la lista) sigue pudiendo cambiar de día', () => {
    expect(isDaySwipeBlockedTarget(fakeEl(false))).toBe(false)
  })

  it('sin elemento o sin closest (otro tipo de destino) no bloquea nada ni rompe', () => {
    expect(isDaySwipeBlockedTarget(null)).toBe(false)
    expect(isDaySwipeBlockedTarget(undefined)).toBe(false)
    expect(isDaySwipeBlockedTarget({})).toBe(false)
    expect(isDaySwipeBlockedTarget(window_like())).toBe(false)
  })

  it('el selector cubre campos de texto, listas, texto editable, formularios y la marca de «no deslizar»', () => {
    for (const part of ['input', 'textarea', 'select', 'form', '[contenteditable]', '[data-no-swipe]']) {
      expect(NO_DAY_SWIPE_SELECTOR).toContain(part)
    }
  })
})

function window_like() {
  return { addEventListener: () => undefined }
}

describe('CalendarScreen usa la protección en todos sus gestos de deslizar (mes, día, 3 días, semana)', () => {
  it('useSwipeHandlers ignora el gesto si el dedo empieza en un campo de escritura', () => {
    const start = calendar.indexOf('function useSwipeHandlers(')
    const fn = calendar.slice(start, calendar.indexOf('\n}\n', start))
    expect(fn).toContain('isDaySwipeBlockedTarget(e.target)')
    expect(fn).toContain('startRef.current = null')
  })

  it('los cuatro gestos salen del mismo useSwipeHandlers, así que quedan todos cubiertos', () => {
    for (const name of ['monthSwipe', 'daySwipe', 'threeDaySwipe', 'weekSwipe']) {
      expect(calendar).toContain(`const ${name} = useSwipeHandlers(`)
    }
  })

  it('la fila que se desliza para borrar sigue parando el touch por su cuenta (arreglo del 16/09)', () => {
    expect(calendar).toContain('onTouchStart={canDelete ? stopTouchPropagation : undefined}')
  })
})
