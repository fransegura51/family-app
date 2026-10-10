import type { CapacitorConfig } from '@capacitor/cli'

// App nativa de PEPA (Android; iPhone más adelante). Es una cáscara: abre la PEPA publicada de siempre, así que cada cambio de la web llega
// a la app sin reinstalar. Lo nativo (ubicación en segundo plano, permisos) vive en android/ y en las piezas de @capacitor-community.
// `webDir` solo guarda la página de «sin conexión» (native-www); no es una copia de la app.
// Complementos nativos que entran en la app. PEPA_EXCLUDE_PLUGINS (lista separada por comas, solo al construir el APK) saca alguno: sirve para
// averiguar cuál cierra la app en un móvil concreto, construyendo una versión sin él.
const ALL_NATIVE_PLUGINS = [
  '@capacitor-community/background-geolocation',
  '@capacitor-community/speech-recognition',
  '@capacitor-community/text-to-speech',
  '@capacitor/app',
  '@capacitor/browser',
  '@capacitor/local-notifications',
  '@capacitor/push-notifications',
]
const excluded = (process.env.PEPA_EXCLUDE_PLUGINS ?? '').split(',').map((p) => p.trim()).filter(Boolean)

const config: CapacitorConfig = {
  appId: 'es.pepafamilyapp.app',
  appName: 'PEPA',
  webDir: 'native-www',
  includePlugins: ALL_NATIVE_PLUGINS.filter((p) => !excluded.includes(p)),
  server: {
    url: 'https://fransegura51.github.io/family-app/',
    cleartext: false,
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
    // Imprescindible para la ubicación en segundo plano (plugin background-geolocation): sin esto Android la corta a los 5 minutos.
    useLegacyBridge: true,
  },
}

export default config
