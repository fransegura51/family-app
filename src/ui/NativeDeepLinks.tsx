import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { App as CapApp } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { parseDeepLink } from '@/domain/nativeDeepLink'
import { isNativeApp } from '@/services/nativeApp'

// Componente sin UI, solo en la app nativa: cuando Google o el banco terminan de conectar, la página puente abre la app con un enlace
// «es.pepafamilyapp.app://open/…». Aquí se recibe (con la app ya abierta o arrancándola de cero) y se lleva a la pantalla correspondiente,
// que lee ?google=… o ?bank=… igual que cuando volvía por la web.

// El enlace con el que se abrió la app se atiende UNA sola vez por arranque. Bug real (iPhone, 17/10/2026): «navigate» cambia en cada cambio de ruta, el efecto se
// repetía, getLaunchUrl() devolvía siempre el mismo enlace y cada vuelta del banco generaba un bucle de navegaciones («history.replaceState() more than 100
// times per 10 seconds» → «Algo ha fallado»).
let launchUrlChecked = false

export function NativeDeepLinks() {
  const navigate = useNavigate()
  // El efecto no depende de «navigate» (su identidad cambia con cada ruta): siempre se usa el último.
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  useEffect(() => {
    if (!isNativeApp()) return
    function handle(url: string) {
      const path = parseDeepLink(url)
      if (!path) return
      void Browser.close().catch(() => undefined)
      navigateRef.current(path, { replace: true })
    }
    // Todo con catch: una app instalada sin el complemento «App» (versiones de prueba) rechazaba estas llamadas y cada apertura dejaba errores
    // inútiles en el registro de fallos.
    const listener = CapApp.addListener('appUrlOpen', (event) => handle(event.url)).catch(() => undefined)
    // Si la app estaba cerrada del todo y el sistema la abrió con el enlace, el evento ya pasó: se pregunta cuál fue (una sola vez).
    if (!launchUrlChecked) {
      launchUrlChecked = true
      void CapApp.getLaunchUrl()
        .then((launch) => {
          if (launch?.url) handle(launch.url)
        })
        .catch(() => undefined)
    }
    return () => {
      void listener.then((l) => l?.remove())
    }
  }, [])

  return null
}
