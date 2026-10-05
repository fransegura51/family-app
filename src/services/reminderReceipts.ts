// «Recibo» de un aviso de recordatorio llegado por Web Push a ESTE dispositivo. Lo escribe el service worker al
// recibir el push (src/sw.ts) y lo lee ReminderWatcher para saber que el servidor ya ha avisado aquí y no
// duplicarlo con un aviso local.
//
// Por qué un recibo y no solo la etiqueta (`tag`) de la notificación: se comprobó que iOS/Safari NO reemplaza de
// forma fiable una notificación por otra con la misma etiqueta (error abierto de WebKit 258922: «push
// notifications with same tag do not replace each other»), y además una notificación que el usuario ya ha
// descartado deja de existir — con solo `getNotifications({tag})` el aviso local reaparecería. El recibo
// sobrevive a ambas cosas. Cache API existe tanto en el service worker como en la página (mismo origen).
//
// Sin efectos al importarlo: lo importa el service worker.

const CACHE_NAME = 'family-app-reminder-receipts'
const KEEP_MS = 3 * 24 * 60 * 60 * 1000

function receiptRequest(tag: string): Request {
  // La Cache API exige una URL http(s); el host es ficticio, nunca se pide por red.
  return new Request(`https://reminder-receipt.invalid/${encodeURIComponent(tag)}`)
}

export async function recordReminderReceipt(tag: string): Promise<void> {
  try {
    const cache = await caches.open(CACHE_NAME)
    await cache.put(receiptRequest(tag), new Response(String(Date.now())))
    // Poda de recibos viejos para que no crezca sin límite.
    for (const key of await cache.keys()) {
      const res = await cache.match(key)
      const at = res ? Number(await res.text()) : 0
      if (!at || Date.now() - at > KEEP_MS) await cache.delete(key)
    }
  } catch {
    // Sin Cache API: solo se pierde la reserva local (el aviso del servidor ya se ha mostrado).
  }
}

export async function hasReminderReceipt(tag: string): Promise<boolean> {
  try {
    if (typeof caches === 'undefined') return false
    return (await caches.match(receiptRequest(tag), { cacheName: CACHE_NAME })) !== undefined
  } catch {
    return false
  }
}
