/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope

// Precacheo offline estándar de vite-plugin-pwa (injectManifest rellena
// self.__WB_MANIFEST en build).
precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

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
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => 'focus' in c)
      if (existing) return (existing as WindowClient).focus()
      return self.clients.openWindow('/calendario')
    }),
  )
})
