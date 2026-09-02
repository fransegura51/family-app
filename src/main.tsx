import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from '@/App'
import { ErrorBoundary } from '@/ui/ErrorBoundary'
import '@/ui/styles.css'

// El registro básico (registerSW.js, autoinyectado) instala el service
// worker nuevo pero la pestaña ya abierta se queda corriendo el código
// VIEJO en memoria hasta que se recarga sola — causa real, confirmada,
// de casi todos los "sigue sin funcionar" de hoy: se probaba con una
// versión de hace varios despliegues sin saberlo. Dos piezas para que
// nunca más haga falta cerrar la app a mano para verla actualizada:
// 1. En cuanto un service worker nuevo toma el control (controllerchange),
//    recargar sola — es la señal estándar de "ya hay versión nueva lista".
// 2. Pedir activamente comprobar si hay una versión nueva cada vez que
//    se abre/vuelve a primer plano la app, en vez de esperar a que el
//    navegador decida hacerlo por su cuenta (puede tardar horas).
if ('serviceWorker' in navigator) {
  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return
    reloaded = true
    window.location.reload()
  })

  navigator.serviceWorker.ready.then((registration) => {
    registration.update()
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update()
    })
  })
}

// Red de seguridad fuera de React: un rechazo de promesa sin capturar
// (p.ej. en un efecto) no lo ve un ErrorBoundary. Sin esto la pantalla se
// queda en blanco sin ninguna pista — pasó de verdad en el primer
// despliegue real.
window.addEventListener('unhandledrejection', (event) => {
  const root = document.getElementById('root')
  if (root && !root.innerHTML) {
    root.innerHTML = `<div style="padding:20px;font-family:system-ui"><h1>Algo ha fallado</h1><pre style="white-space:pre-wrap;font-size:12px;color:#6b7280">${String(event.reason?.stack || event.reason)}</pre></div>`
  }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
