import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from '@/App'
import { ErrorBoundary } from '@/ui/ErrorBoundary'
import '@/ui/styles.css'

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
