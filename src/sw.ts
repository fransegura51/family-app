/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'

declare const self: ServiceWorkerGlobalScope

// Cargar la página (navegación) siempre intenta la red primero, antes
// que el índice precacheado — causa real, confirmada varias veces hoy
// ("no me aparecen los datos/el diseño", "esto es una puta mierda"):
// cada build de Vite genera archivos con hash nuevo (index-XXXX.js/css)
// y el despliegue de GitHub Pages BORRA los antiguos; si el service
// worker seguía sirviendo un index.html viejo desde caché, ese HTML
// apuntaba a un archivo que ya no existía en el servidor → página sin
// estilos y a medio cargar. Tiene que registrarse ANTES de
// precacheAndRoute para que gane esta ruta (workbox usa la primera que
// haga match) — el índice sigue precacheado como reserva solo para sin
// conexión (networkTimeoutSeconds).
//
// `fetchOptions: { cache: 'no-store' }` es la parte que faltaba,
// encontrada probando en vivo: GitHub Pages manda el index.html con
// `Cache-Control: max-age=600`, y el fetch() normal de dentro del
// service worker sigue mirando la caché HTTP del navegador por
// defecto — así que "NetworkFirst" podía devolver igualmente una
// respuesta de hace hasta 10 minutos sin llegar a tocar la red de
// verdad. Con no-store, esta petición concreta ignora esa caché HTTP
// y siempre pregunta al servidor.
//
// networkTimeoutSeconds: bug real reportado ("me pide ubicación, le
// doy a permitir y se queda la página en blanco") justo al volver de
// una redirección externa larga (banco → Enable Banking → nuestra
// app) — en ese momento concreto la conexión del móvil tarda en
// "despertar" tras el salto entre sitios, y con solo 3s de margen la
// red no siempre llega a tiempo, así que caía a la reserva
// precacheada (que puede apuntar a archivos ya borrados del servidor
// si hubo despliegues nuevos mientras tanto → pantalla en blanco).
// Más margen para que un pico de latencia puntual no dispare la
// reserva innecesariamente.
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({
    cacheName: 'navigations',
    networkTimeoutSeconds: 8,
    fetchOptions: { cache: 'no-store' },
  }),
)

// Precacheo offline estándar de vite-plugin-pwa (injectManifest rellena
// self.__WB_MANIFEST en build) — cubre JS/CSS/imágenes con nombre de
// archivo ya único por contenido (hash), esos sí son seguros de servir
// siempre desde caché primero.
precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// Bug real: "cuando se toca la notificación del calendario quiero que se abra
// el calendario, no la página de inicio de Pepa" — las rutas eran absolutas
// ("/calendario", "/pwa-192.png"), pero en producción la app no vive en la
// raíz del dominio sino en "/family-app/" (GitHub Pages), así que apuntaban
// a otro sitio. Todo se calcula desde el ámbito real del service worker.
function scopeUrl(path: string): string {
  return new URL(path, self.registration.scope).href
}

// Recordatorios con la app cerrada: el payload lo manda
// supabase/functions/send-due-reminders vía Web Push. Esto es lo que
// permite que la notificación aparezca aunque no haya ninguna pestaña
// abierta — la pieza que el recordatorio "solo con la app abierta" no
// cubría.
self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload: { title?: string; body?: string }
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'Family App', body: event.data.text() }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'Family App', {
      body: payload.body ?? '',
      icon: scopeUrl('pwa-192.png'),
      badge: scopeUrl('pwa-192.png'),
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  // "?/calendario" es la forma que index.html descodifica a la ruta real
  // (ver 404.html): entra directo, sin depender del salto por el 404 de GitHub Pages.
  const targetUrl = scopeUrl('?/calendario')
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      const existing = clients.find((c) => 'focus' in c) as WindowClient | undefined
      if (existing) {
        // Petición real: "cuando le doy a una notificación de Pepa se
        // me abre Pepa, pero no el calendario" — con la app ya abierta
        // en otra pantalla (el chat de Pepa, Compras...), antes solo se
        // enfocaba tal cual estaba en vez de llevar al calendario como
        // si se abriera de cero.
        try {
          await existing.navigate(targetUrl)
        } catch {
          // El navegador no ha dejado navegar la ventana ya abierta —
          // al menos se enfoca la que hay, mejor que nada.
        }
        return existing.focus()
      }
      return self.clients.openWindow(targetUrl)
    }),
  )
})
