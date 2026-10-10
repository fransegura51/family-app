import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { App as CapApp } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { parseDeepLink } from '@/domain/nativeDeepLink'
import { isNativeApp } from '@/services/nativeApp'

// Componente sin UI, solo en la app nativa: cuando Google o el banco terminan de conectar, la página puente abre la app con un enlace
// «es.pepafamilyapp.app://open/…». Aquí se recibe (con la app ya abierta o arrancándola de cero) y se lleva a la pantalla correspondiente,
// que lee ?google=… o ?bank=… igual que cuando volvía por la web.
export function NativeDeepLinks() {
  const navigate = useNavigate()

  useEffect(() => {
    if (!isNativeApp()) return
    function handle(url: string) {
      const path = parseDeepLink(url)
      if (!path) return
      void Browser.close().catch(() => undefined)
      navigate(path, { replace: true })
    }
    const listener = CapApp.addListener('appUrlOpen', (event) => handle(event.url))
    // Si la app estaba cerrada del todo y Android la abrió con el enlace, el evento ya pasó: se pregunta cuál fue.
    void CapApp.getLaunchUrl().then((launch) => {
      if (launch?.url) handle(launch.url)
    })
    return () => {
      void listener.then((l) => l.remove())
    }
  }, [navigate])

  return null
}
