// Zona segura de arriba en el iPhone (la barra de la hora/batería y la isla dinámica). La app se dibuja por DEBAJO de esa barra (viewport-fit=cover), así que
// lo que se coloca «arriba del todo» con position: fixed tiene que respetar env(safe-area-inset-top); si no, queda tapado y al tocarlo iOS lo toma por el
// gesto del sistema de bajar el menú. Bug real (16/10/2026): los botones redondos de Pepa y el de redes no se podían tocar en el iPhone.
export const FAB_SAFE_GAP_PX = 8

// `top` CSS de un botón flotante: nunca por encima de la zona segura (+ un margen), sea cual sea la posición guardada o por defecto.
// Sin barra (Android, navegador de escritorio) env() vale 0 y queda exactamente como antes (la posición pedida).
export function fabTopCss(topPx: number, offsetPx = 0): string {
  return `calc(max(${topPx}px, env(safe-area-inset-top, 0px) + ${FAB_SAFE_GAP_PX}px) + ${offsetPx}px)`
}

// La zona segura de arriba, en píxeles (para no soltar un botón arrastrado por debajo de la barra del sistema). 0 si no se puede medir.
export function safeAreaTopPx(): number {
  try {
    const probe = document.createElement('div')
    probe.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top, 0px)'
    document.body.appendChild(probe)
    const value = parseFloat(getComputedStyle(probe).paddingTop) || 0
    probe.remove()
    return value
  } catch {
    return 0
  }
}
