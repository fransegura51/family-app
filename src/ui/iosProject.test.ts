// App de iPhone (Capacitor): el proyecto tiene que conservar los permisos, los modos en segundo plano, el enlace de vuelta y la comprobación de compilación. Se leen los textos.
import { describe, expect, it } from 'vitest'
import plist from '../../ios/App/App/Info.plist?raw'
import podfile from '../../ios/App/Podfile?raw'
import workflow from '../../.github/workflows/ios-build.yml?raw'
import config from '../../capacitor.config.ts?raw'
import appDelegate from '../../ios/App/App/AppDelegate.swift?raw'
import entitlements from '../../ios/App/App/App.entitlements?raw'
import pbxproj from '../../ios/App/App.xcodeproj/project.pbxproj?raw'
import testflight from '../../.github/workflows/ios-testflight.yml?raw'

describe('app de iPhone: Info.plist', () => {
  it('pide los permisos con textos claros en español (Apple rechaza los permisos sin explicación)', () => {
    for (const key of [
      'NSLocationWhenInUseUsageDescription',
      'NSLocationAlwaysAndWhenInUseUsageDescription',
      'NSMicrophoneUsageDescription',
      'NSSpeechRecognitionUsageDescription',
      'NSCameraUsageDescription',
      'NSPhotoLibraryUsageDescription',
    ]) {
      const match = new RegExp(`<key>${key}</key>\\s*<string>([^<]{30,})</string>`).exec(plist)
      expect(match, key).not.toBeNull()
    }
  })

  it('puede seguir con la ubicación en segundo plano y recibir avisos', () => {
    expect(plist).toMatch(/<key>UIBackgroundModes<\/key>\s*<array>\s*<string>location<\/string>\s*<string>remote-notification<\/string>/)
  })

  it('vuelve a la app desde Google y el banco con el mismo enlace que Android, y no pregunta por cifrado en cada subida', () => {
    expect(plist).toContain('<string>es.pepafamilyapp.app</string>')
    expect(plist).toMatch(/<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/)
  })

  it('es solo para iPhones modernos (arm64)', () => {
    expect(plist).toContain('<string>arm64</string>')
    expect(plist).not.toContain('armv7')
  })
})

describe('app de iPhone: proyecto y comprobación', () => {
  it('usa CocoaPods porque el plugin de ubicación en segundo plano aún no sirve con Swift Package Manager', () => {
    expect(podfile).toContain("pod 'CapacitorCommunityBackgroundGeolocation'")
    expect(podfile).toContain("pod 'CapacitorPushNotifications'")
  })

  it('hay una comprobación de que compila en un Mac de GitHub, sin firmar y sin secretos', () => {
    expect(workflow).toContain('runs-on: macos-15')
    expect(workflow).toContain('CODE_SIGNING_ALLOWED=NO')
    expect(workflow).toContain('pod install')
    expect(workflow).not.toMatch(/secrets\./)
  })

  it('el identificador de la app es el mismo en Android y en iPhone', () => {
    expect(config).toContain("appId: 'es.pepafamilyapp.app'")
  })
})

describe('app de iPhone: avisos (Firebase + Apple)', () => {
  it('Firebase Messaging cambia el identificador de Apple por el token «fcm:» que ya usa el servidor', () => {
    expect(podfile).toContain("pod 'FirebaseMessaging'")
    expect(appDelegate).toContain('Messaging.messaging().apnsToken = deviceToken')
    expect(appDelegate).toContain('capacitorDidRegisterForRemoteNotifications')
    expect(appDelegate).toContain('capacitorDidFailToRegisterForRemoteNotifications')
  })

  it('Firebase solo se arranca si la compilación lleva GoogleService-Info.plist (sin él, la comprobación de GitHub y la app siguen funcionando)', () => {
    expect(appDelegate).toMatch(/if Bundle\.main\.path\(forResource: "GoogleService-Info", ofType: "plist"\) != nil \{\s*FirebaseApp\.configure\(\)/)
    expect(appDelegate).toContain('guard FirebaseApp.app() != nil')
  })

  it('la app tiene el permiso de avisos de Apple (aps-environment) enlazado en las dos configuraciones', () => {
    expect(entitlements).toContain('<key>aps-environment</key>')
    expect((pbxproj.match(/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/g) ?? []).length).toBe(2)
  })

  it('el archivo de Firebase no está en el repositorio (es público): solo lo escribe la subida a TestFlight', () => {
    expect(pbxproj).not.toContain('GoogleService-Info.plist')
    expect(testflight).toContain('GOOGLE_SERVICE_INFO_PLIST_B64')
  })
})

describe('app de iPhone: envío a TestFlight (probado el 15/10/2026: sube con el Apple ID de Paco y firma manual)', () => {
  it('solo se lanza a mano y los secretos entran por variables de entorno, nunca escritos en el archivo', () => {
    expect(testflight).toMatch(/on:\s*workflow_dispatch:/)
    // Apple exige el SDK de iOS 26 (Xcode 26) para subir a App Store Connect.
    expect(testflight).toContain('runs-on: macos-26')
    expect(testflight).toContain('Xcode_26')
    for (const name of [
      'APPLE_TEAM_ID',
      'GOOGLE_SERVICE_INFO_PLIST_B64',
      'APPLE_ID',
      'APPLE_APP_PASSWORD',
      'IOS_DIST_KEY_B64',
      'IOS_DIST_CERT_PEM_B64',
      'IOS_APPSTORE_PROFILE_B64',
      'IOS_APPSTORE_PROFILE_NAME',
    ]) {
      expect(testflight).toContain(`secrets.${name}`)
    }
    expect(testflight).not.toMatch(/BEGIN (PRIVATE|EC PRIVATE|RSA PRIVATE) KEY/)
  })

  it('firma a mano con el certificado de distribución (la firma en la nube con la llave de la API falla con el error 3004 de JWT) y sube con un número de compilación que sube en cada envío', () => {
    expect(testflight).toContain('"CODE_SIGN_STYLE"] = "Manual"')
    expect(testflight).toContain('PROVISIONING_PROFILE_SPECIFIER')
    expect(testflight).toContain('<key>signingStyle</key><string>manual</string>')
    expect(testflight).toContain('<key>destination</key><string>export</string>')
    expect(testflight).toContain('xcrun altool --upload-app')
    expect(testflight).toContain('CURRENT_PROJECT_VERSION="${{ github.run_number }}"')
    // Si no se firma el archivo, la app se queda sin el permiso de avisos (aps-environment).
    expect(testflight).not.toContain('CODE_SIGNING_ALLOWED=NO')
  })
})
