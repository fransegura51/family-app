// App de iPhone (Capacitor): el proyecto tiene que conservar los permisos, los modos en segundo plano, el enlace de vuelta y la comprobación de compilación. Se leen los textos.
import { describe, expect, it } from 'vitest'
import plist from '../../ios/App/App/Info.plist?raw'
import podfile from '../../ios/App/Podfile?raw'
import workflow from '../../.github/workflows/ios-build.yml?raw'
import config from '../../capacitor.config.ts?raw'

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
