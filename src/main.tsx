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
  // Bug real reportado varias veces: "me pide ubicación, le doy a
  // permitir y se queda la página en gris/blanco", siempre justo al
  // volver de una redirección externa larga (banco → Enable Banking →
  // nuestra app) — momento en que hemos estado desplegando varias
  // veces seguidas. El propio `clientsClaim()` del service worker hace
  // que ESTA MISMA carga recién hecha (que ya trae el contenido fresco
  // de este despliegue, gracias al NetworkFirst de sw.ts) dispare su
  // propio "controllerchange" nada más arrancar — y la recarga forzada
  // de abajo, si cae justo mientras React está montando o mientras el
  // navegador está mostrando el permiso de ubicación, interrumpe esa
  // carga a medias y deja la pantalla colgada. El aviso solo tiene
  // sentido para una pestaña que llevaba un rato abierta y de repente
  // cambia de versión por debajo — no para los primeros segundos de
  // una carga que ya está al día.
  const bootedAt = Date.now()
  const GRACE_MS = 10_000
  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || Date.now() - bootedAt < GRACE_MS) return
    reloaded = true
    window.location.reload()
  })

  navigator.serviceWorker.ready.then((registration) => {
    registration.update()
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update()
    })
    // El aviso de visibilitychange no basta en escritorio: una pestaña
    // que se queda siempre en primer plano (nunca se cambia de app ni
    // se minimiza) no dispara nunca ese evento, así que nunca se
    // comprobaba si había versión nueva — caso real, confirmado: una
    // familia con la pestaña abierta desde antes del despliegue se
    // quedó viendo la app vieja indefinidamente. Con esto, como mucho
    // tarda 5 minutos en enterarse aunque no toque ni cambie de pestaña.
    setInterval(() => registration.update(), 5 * 60 * 1000)
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
