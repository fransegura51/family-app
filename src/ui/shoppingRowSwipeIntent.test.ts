import { describe, expect, it } from 'vitest'

// Cola nocturna, Bloque 3 — bug real: "tocar un producto en modo normal activa Eliminar". Causa
// encontrada al auditar ShoppingItemRow (el único sitio que llama a onDelete): handleSwipeMove no tenía
// ningún margen mínimo, así que el temblor normal de un dedo al tocar (inevitable en pantalla táctil) ya
// contaba como "empezar a deslizar", y un toque para editar podía acabar abriendo el aviso rojo de
// "🗑 Eliminar" en vez de la edición. No hay jsdom en este proyecto (efecto de gestos táctiles reales) —
// se comprueba aquí, de forma estructural, que existe un margen mínimo real antes de mover la fila.
const SRC = (import.meta.glob('/src/ui/ShoppingScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/ShoppingScreen.tsx']

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const ROW = slice(SRC, 'function ShoppingItemRow', '\nfunction AddShoppingItemForm')

describe('ShoppingItemRow — un toque no debe abrir el swipe de Eliminar (margen mínimo real antes de deslizar)', () => {
  it('define un umbral con nombre (no un número mágico) para distinguir un toque de un deslizamiento real', () => {
    expect(SRC).toContain('const SWIPE_INTENT_THRESHOLD_PX = 8')
  })

  it('handleSwipeMove no mueve la fila (setLiveX) hasta superar el umbral de movimiento horizontal real', () => {
    const fn = slice(ROW, 'function handleSwipeMove', '\n  function handleSwipeEnd')
    expect(fn).toContain('if (!swipeIntent.current) {')
    expect(fn).toContain('if (Math.abs(dx) < SWIPE_INTENT_THRESHOLD_PX) return')
    // setLiveX solo puede alcanzarse tras marcar swipeIntent — comprobado por construcción: el guard de
    // arriba (con su "return") aparece ANTES de la llamada a setLiveX en el mismo cuerpo de función.
    expect(fn.indexOf('return')).toBeLessThan(fn.indexOf('setLiveX('))
  })

  it('el intento de swipe se reinicia en cada toque nuevo (handleSwipeStart), para no arrastrar el estado del toque anterior', () => {
    const fn = slice(ROW, 'function handleSwipeStart', '\n  function handleSwipeMove')
    expect(fn).toContain('swipeIntent.current = false')
  })

  it('un toque puro (sin cruzar el umbral) deja liveX en null, así que handleSwipeEnd no cambia openX — la fila se queda exactamente como estaba', () => {
    const endFn = slice(ROW, 'function handleSwipeEnd', '\n\n  const translateX')
    // Sigue usando "liveX ?? openX": si liveX nunca se tocó (toque puro), current es el propio openX de
    // siempre, así que setOpenX(...) es un no-op — no hace falta cambiar esta función, el arreglo real vive
    // en que handleSwipeMove ya no llega a mover liveX para un simple toque.
    expect(endFn).toContain('const current = liveX ?? openX')
  })

  it('un deslizamiento real (por encima del umbral) sigue funcionando exactamente igual que antes — mismo cálculo de liveX, solo que ahora empieza más tarde', () => {
    const fn = slice(ROW, 'function handleSwipeMove', '\n  function handleSwipeEnd')
    expect(fn).toContain('setLiveX(Math.min(0, Math.max(SWIPE_OPEN_X, openX + dx)))')
  })
})
