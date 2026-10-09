import type { CapacitorConfig } from '@capacitor/cli'

// App nativa de PEPA (Android; iPhone más adelante). Es una cáscara: abre la PEPA publicada de siempre, así que cada cambio de la web llega
// a la app sin reinstalar. Lo nativo (ubicación en segundo plano, permisos) vive en android/ y en las piezas de @capacitor-community.
// `webDir` solo guarda la página de «sin conexión» (native-www); no es una copia de la app.
const config: CapacitorConfig = {
  appId: 'es.pepafamilyapp.app',
  appName: 'PEPA',
  webDir: 'native-www',
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
