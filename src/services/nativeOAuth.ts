// Abrir la página de Google o del banco para conectar. En el navegador se salta con la propia pestaña (como siempre). Dentro de la app nativa se abre en una
// pestaña segura de Chrome (Custom Tab): Google NO deja iniciar sesión dentro de una vista web incrustada, y de ahí la vuelta a la app es por el enlace
// «es.pepafamilyapp.app://open/…» (ver src/domain/nativeDeepLink.ts y public/volver-app.html).
import { Browser } from '@capacitor/browser'
import { isNativeApp } from '@/services/nativeApp'

export async function openAuthUrl(url: string): Promise<void> {
  if (isNativeApp()) {
    await Browser.open({ url })
    return
  }
  window.location.href = url
}
