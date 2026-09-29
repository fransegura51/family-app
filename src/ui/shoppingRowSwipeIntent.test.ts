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

  it('handleSwipeMove no mueve la fila (setLiveX) hasta superar el umbral de movimiento real (horizontal o vertical)', () => {
    const fn = slice(ROW, 'function handleSwipeMove', '\n  function handleSwipeEnd')
    expect(fn).toContain('if (!swipeIntent.current) {')
    expect(fn).toContain('if (Math.abs(dx) < SWIPE_INTENT_THRESHOLD_PX && Math.abs(dy) < SWIPE_INTENT_THRESHOLD_PX) return')
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

// Reporte real (3ª ronda): "sigue sin funcionar" — el deslizar NUNCA llegaba a revelar Eliminar, ni con el
// panel ya arreglado (visibility, commit 8388289) ni con el deploy verificado en vivo (se confirmó que el
// bundle publicado contenía el arreglo, y que la app se había cerrado y reabierto del todo — no era caché).
// CAUSA REAL: .shopping-row-inner tiene touch-action:'pan-y' (para que la lista siga pudiendo hacer scroll
// vertical tocando encima de un producto), pero handleSwipeMove nunca miraba el desplazamiento VERTICAL ni
// llamaba a e.preventDefault() — decidía "hay intención de swipe" solo con dx, sin comparar con dy y sin
// decírselo nunca al navegador. En iOS Safari, con el más mínimo componente vertical en el gesto (casi
// inevitable con un dedo real), el reconocedor nativo de pan-y puede reclamar el toque para scroll ANTES de
// que esta función decida nada — y una vez que WebKit se queda con el gesto, ya no llegan más pointermove
// útiles (o llega pointercancel, que también dispara handleSwipeEnd): el swipe nunca se completaba. La
// captura "antes/después" que motivó todo esto (Eliminar apareciendo al marcar comprado) nunca vino de un
// swipe real — venía del bleed-through de opacity ya corregido; el swipe genuino llevaba roto todo este
// tiempo, enmascarado por ese otro bug.
describe('ShoppingItemRow — causa raíz real (3ª ronda): touch-action pan-y ganaba la carrera al swipe porque nunca se comparaba con el eje vertical ni se llamaba a preventDefault', () => {
  const fn = slice(ROW, 'function handleSwipeMove', '\n  function handleSwipeEnd')

  it('handleSwipeStart guarda también el punto Y de inicio (swipeStartY) — hace falta para poder comparar ejes en handleSwipeMove', () => {
    const startFn = slice(ROW, 'function handleSwipeStart', '\n  function handleSwipeMove')
    expect(startFn).toContain('swipeStartY.current = e.clientY')
  })

  it('handleSwipeMove calcula dy y, si el gesto es más vertical que horizontal, abandona el seguimiento (swiping.current = false) SIN tocar preventDefault — el scroll nativo de la lista queda intacto', () => {
    expect(fn).toContain('const dy = e.clientY - swipeStartY.current')
    const verticalBranch = slice(fn, 'if (Math.abs(dy) >= Math.abs(dx)) {', '\n      }')
    expect(verticalBranch).toContain('swiping.current = false')
    expect(verticalBranch).not.toContain('preventDefault')
    // El abandono debe ocurrir ANTES de que swipeIntent se confirme — si no, un gesto vertical podría
    // colarse como swipe horizontal a medias.
    expect(fn.indexOf('if (Math.abs(dy) >= Math.abs(dx))')).toBeLessThan(fn.indexOf('swipeIntent.current = true'))
  })

  it('si domina el eje horizontal, SÍ llama a e.preventDefault() — reclama el gesto para JS antes de que el pan-y nativo se lo quede', () => {
    expect(fn).toContain('e.preventDefault()')
    // preventDefault se llama tras decidir el eje (fuera del bloque "if (!swipeIntent.current)"), así que
    // solo se ejecuta una vez confirmada la intención horizontal — nunca en cada pointermove sin criterio.
    expect(fn.indexOf('swipeIntent.current = true')).toBeLessThan(fn.indexOf('e.preventDefault()'))
    expect(fn.indexOf('e.preventDefault()')).toBeLessThan(fn.indexOf('setLiveX('))
  })

  it('un gesto puramente vertical (dy grande, dx pequeño) nunca ejecuta setLiveX — se corta en el "return" del abandono, antes de llegar a moverse', () => {
    const verticalBranch = slice(fn, 'if (Math.abs(dy) >= Math.abs(dx)) {', '\n      }')
    expect(verticalBranch).toContain('return')
  })
})

// Diagnóstico real en iPhone (validación real): el umbral de arriba NO resolvió el bug — seguía pudiendo
// activarse Eliminar al tocar un producto. CAUSA ANTERIOR SUPUESTA: temblor del dedo sin margen mínimo.
// CAUSA REAL ENCONTRADA: handleSwipeStart vive en la FILA entera (onPointerDown de .shopping-row-inner);
// un toque que empieza en el nombre/el check/el ojo (botones internos SIN su propio onPointerDown)
// burbujeaba hasta la fila igual que un toque en zona en blanco, y la fila SIEMPRE llamaba a
// setPointerCapture sobre sí misma para ESE puntero — incluso cuando el toque había empezado encima de un
// <button>. El umbral evita que ese toque ABRA visualmente el swipe, pero no evita la captura del puntero
// en el ancestro durante un toque que empezó en un descendiente interactivo — justo el tipo de secuencia
// que Safari/iOS trata de forma distinta a la emulación de escritorio (por eso la página de prueba aislada
// de la corrección anterior, con eventos sintéticos y sin botones reales de por medio, no lo reproducía).
// POR QUÉ a849da6 NO LO RESOLVIÓ: el umbral solo protegía el CÁLCULO de si la fila debe deslizarse
// visualmente — nunca evitó que la fila capturara el puntero de un toque que había empezado en un botón.
// Aquella corrección (el guard "si empieza en un botón, ni se sigue el toque") arregló ESE problema
// (toques que activaban Eliminar sin querer) pero, sin darnos cuenta, introdujo uno nuevo: instrumentado en
// vivo en un iPhone real (4ª ronda), el rastro mostró que CASI TODOS los toques de intento de swipe
// aterrizaban en target=BUTTON.price-row-name (el botón del nombre ocupa casi todo el ancho de la fila,
// flex:1) — el guard los bloqueaba a las primeras de cambio, así que el swipe real era, en la práctica,
// casi inalcanzable: no había "zona en blanco" suficiente desde la que arrancarlo.
// CORRECCIÓN (4ª ronda): ya no se excluye ningún target al empezar a seguir el toque — el seguimiento se
// inicia SIEMPRE. Lo que evita que un simple tap en el nombre/check/ojo se confunda con un swipe no es ya
// "de qué elemento venía el toque", sino CUÁNDO se captura el puntero: handleSwipeStart ya no llama a
// setPointerCapture ni a preventDefault — solo handleSwipeMove lo hace, y solo una vez que el movimiento
// confirma intención horizontal real (por encima del umbral, eje dominante). Un toque puro (sin cruzar el
// umbral) nunca llega a capturar nada ni a prevenir nada, así que el botón recibe su click nativo
// exactamente igual que si esta fila no existiera — mismo resultado que el guard anterior, pero sin cerrar
// la puerta a un swipe real que empiece sobre el nombre.
describe('ShoppingItemRow — el swipe puede arrancar desde cualquier punto de la fila, incluido encima de un botón (4ª ronda: el guard anterior lo hacía casi inalcanzable)', () => {
  it('handleSwipeStart ya no excluye ningún target — sigue el toque siempre, sin capturar el puntero todavía', () => {
    const fn = slice(ROW, 'function handleSwipeStart', '\n  function handleSwipeMove')
    expect(fn).not.toContain("closest('button, a, input, select, textarea')")
    expect(fn).toContain('swipeStartX.current = e.clientX')
    expect(fn).toContain('swiping.current = true')
    // La captura del puntero se ha movido a handleSwipeMove — handleSwipeStart ya no la hace.
    expect(fn).not.toContain('setPointerCapture')
  })

  it('setPointerCapture y preventDefault solo ocurren en handleSwipeMove, y solo tras confirmar intención horizontal — nunca en un simple tap', () => {
    const fn = slice(ROW, 'function handleSwipeMove', '\n  function handleSwipeEnd')
    expect(fn).toContain('e.currentTarget.setPointerCapture(e.pointerId)')
    // El orden importa: primero se confirma swipeIntent, LUEGO se captura — nunca antes de saber que es un
    // swipe real (si no, volveríamos a capturar toques puros como antes de a849da6).
    expect(fn.indexOf('swipeIntent.current = true')).toBeLessThan(fn.indexOf('e.currentTarget.setPointerCapture(e.pointerId)'))
  })

  it('los 3 botones reales de la fila (nombre, check, ojo) siguen sin su propio onPointerDown — dependen de que handleSwipeStart nunca interfiera con un tap puro', () => {
    expect(ROW).toContain('className="price-row-name price-row-name-button"')
    expect(ROW).toContain("className={'shopping-check'")
    expect(ROW).toContain('aria-label={`Ver foto de ${item.name}`}')
    const nameBlock = slice(ROW, 'className="price-row-name price-row-name-button"', '</button>')
    expect(nameBlock).not.toContain('onPointerDown')
    const checkBlock = slice(ROW, "className={'shopping-check'", '</button>')
    expect(checkBlock).not.toContain('onPointerDown')
  })

  it('el tirador de arrastrar sigue con su propio stopPropagation (sin cambios) — nunca llega a handleSwipeStart en absoluto, con o sin guard de target', () => {
    const handleBlock = slice(ROW, 'className="shopping-drag-handle"', '</span>')
    expect(handleBlock).toContain('e.stopPropagation()')
  })
})

// Captura real en iPhone (2ª ronda) — "el círculo derecho (✓ comprado) sigue activando Eliminar". CAUSA
// ANTERIOR SUPUESTA (round anterior): un problema de gesto/propagación en handleSwipeStart. CAUSA REAL
// ENCONTRADA (verificada visualmente con un harness HTML mínimo que carga el CSS real, sin ningún gesto
// táctil de por medio): NUNCA fue un bug de swipe/pointer. .shopping-row-delete-behind (fondo rojo opaco,
// var(--error)) se montaba SIEMPRE que !shoppingMode, con translateX en 0 (tapado por completo por el
// fondo opaco de .shopping-row-inner, var(--bg), así que normalmente invisible). Pero .shopping-item-done
// aplica `opacity: 0.55` a TODA .shopping-row-inner (fondo incluido) para atenuar el producto — y opacity
// no aclara colores, hace que el propio elemento (con su fondo) se componga semitransparente sobre lo que
// tenga detrás en el mismo contexto de apilamiento, dejando asomar el panel rojo por debajo aunque
// translateX siguiera en 0 y nadie hubiera deslizado nada. Por eso ocurría exactamente al marcar comprado
// (el instante en que se añade la clase) y por eso los productos YA comprados de otras tiendas también lo
// mostraban en la misma captura — es una consecuencia de opacity+CSS, no de onClick/propagación/estado de
// selección. SWIPE_INTENT_THRESHOLD_PX y el guard de handleSwipeStart (arriba) ya eran correctos y no
// necesitaban ningún cambio.
//
// Regresión real (commit bcbb59e, la 1ª corrección de esto): montar/desmontar .shopping-row-delete-behind
// según translateX !== 0 — "ahora no se pueden eliminar los productos de la lista". Insertar o quitar un
// hermano del DOM en mitad de un gesto táctil activo (cada pointermove que cruza el umbral, mientras el
// puntero está capturado en .shopping-row-inner) es justo el tipo de mutación que puede desestabilizar la
// captura de puntero/el propio gesto en iOS Safari. CORRECCIÓN v2: el panel vuelve a estar SIEMPRE montado
// (cero inserciones/eliminaciones de nodos durante el gesto) — solo se oculta con `visibility:hidden`
// mientras translateX es 0 (un elemento oculto así no se pinta — nada que asome por transparencia — y
// tampoco recibe toques, sin necesitar pointer-events aparte).
describe('ShoppingItemRow — panel de Eliminar SIEMPRE montado (nunca condicional al DOM) + oculto solo con visibility, nunca desmontado', () => {
  const outerFn = slice(ROW, 'return (\n    <div className="shopping-row-outer"', '\n      <div\n        className=')

  it('.shopping-row-delete-behind se monta SIEMPRE que !shoppingMode — igual que antes de bcbb59e, sin condición sobre translateX en el propio montaje (evita mutar el DOM en mitad del gesto)', () => {
    expect(outerFn).toContain('{!shoppingMode && (')
    expect(outerFn).not.toContain('{!shoppingMode && translateX !== 0 && (')
    expect(outerFn).toContain('<div className="shopping-row-delete-behind"')
  })

  it('se oculta con visibility (no con opacity, no con display:none, no desmontándolo) mientras translateX es 0 — visible en cuanto translateX !== 0', () => {
    const panelBlock = slice(outerFn, '<div className="shopping-row-delete-behind"', '</div>\n      )}')
    expect(panelBlock).toContain("style={{ visibility: translateX !== 0 ? 'visible' : 'hidden' }}")
  })

  it('la condición de montaje no depende de "done"/comprado — cubre pendiente→comprado y comprado→pendiente por igual (nunca aparece Eliminar en ningún sentido)', () => {
    const condition = slice(outerFn, '{!shoppingMode && (', ')}')
    expect(condition).not.toContain('done')
    expect(condition).not.toContain('item.status')
  })

  it('marcar comprado (el <button> shopping-check) nunca toca openX/liveX — no hay ningún efecto secundario sobre el estado de swipe al cambiar de estado', () => {
    const checkBlock = slice(ROW, "className={'shopping-check'", '</button>')
    expect(checkBlock).toContain('onClick={() => onSetStatus(item.id, done ? ')
    expect(checkBlock).not.toContain('setOpenX')
    expect(checkBlock).not.toContain('setLiveX')
  })

  it('Modo compra conserva su comportamiento — el panel de Eliminar sigue sin poder aparecer ahí (shoppingMode lo excluye del montaje, no se toca su diseño)', () => {
    expect(outerFn).toContain('{!shoppingMode && (')
  })

  it('el mecanismo deliberado de borrado (deslizar hasta abrir) sigue intacto — mismo botón, mismo onDelete, visible en cuanto translateX !== 0 de verdad', () => {
    const panelBlock = slice(outerFn, '{!shoppingMode && (', '\n      )}')
    expect(panelBlock).toContain('onClick={() => onDelete(item.id)}')
    expect(panelBlock).toContain('🗑 Eliminar')
  })
})
