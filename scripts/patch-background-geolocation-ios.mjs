// Parche del complemento iOS @capacitor-community/background-geolocation (ubicación en iPhone con la app CERRADA).
//
// El complemento original solo da posiciones mientras el proceso está vivo; al deslizar la app, iOS la mata y no hay más. Este parche:
//  1. copia ios-patches/background-geolocation/PepaNativeLocation.swift dentro del complemento (cambios significativos de ubicación + envío nativo);
//  2. añade a Plugin.swift y Plugin.m los métodos setNativeUpload, clearNativeUpload y getBackgroundLocationStatus (los mismos que en Android) y
//     setNativeRegions (solo iPhone: bordes de los lugares, para que iOS despierte la app cerrada al cruzarlos).
// AppDelegate.swift llama a PepaNativeLocation.shared.resumeIfConfigured() al arrancar.
//
// Se ejecuta tras cada «npm install/ci» (postinstall) y de forma explícita en el flujo de iPhone. Es idempotente. Si el complemento cambia, FALLA en
// voz alta en vez de seguir sin el parche (con --soft, solo avisa).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pluginDir = join(root, 'node_modules/@capacitor-community/background-geolocation')
const iosDir = join(pluginDir, 'ios/Plugin')
const swiftFile = join(iosDir, 'Swift/Plugin.swift')
const objcFile = join(iosDir, 'Plugin.m')
const nativeCopy = join(iosDir, 'Swift/PepaNativeLocation.swift')
const nativeSource = join(root, 'ios-patches/background-geolocation/PepaNativeLocation.swift')

const MARK = 'PEPA-PATCH'
const EXPECTED_VERSION = '1.2.26'

const soft = process.argv.includes('--soft')
function fail(message) {
  console.error(message)
  process.exit(soft ? 0 : 1)
}
const normalize = (text) => text.replace(/\r\n/g, '\n')

if (!existsSync(swiftFile)) {
  console.log('patch-background-geolocation-ios: el complemento no está instalado, nada que parchear')
  process.exit(0)
}

const version = JSON.parse(readFileSync(join(pluginDir, 'package.json'), 'utf8')).version
if (version !== EXPECTED_VERSION) {
  fail(`patch-background-geolocation-ios: el complemento es la versión ${version} y el parche es para la ${EXPECTED_VERSION}. Revisa ios-patches/background-geolocation y el parche.`)
}

// 1) Clase nativa
writeFileSync(nativeCopy, readFileSync(nativeSource, 'utf8'))

// 2) Plugin.swift
const swiftSrc = normalize(readFileSync(swiftFile, 'utf8'))
if (swiftSrc.includes(MARK)) {
  console.log('patch-background-geolocation-ios: Plugin.swift ya parcheado')
} else {
  const listAnchor = 'CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)\n'
  const funcAnchor = '    @objc func openSettings(_ call: CAPPluginCall) {'
  if (!swiftSrc.includes(listAnchor) || !swiftSrc.includes(funcAnchor)) {
    fail('patch-background-geolocation-ios: no encuentro openSettings en Plugin.swift — ¿ha cambiado el complemento? Revisa el parche.')
  }
  const list = `CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setNativeUpload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearNativeUpload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getBackgroundLocationStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setNativeRegions", returnType: CAPPluginReturnPromise)
`
  const methods = `    // ${MARK}: configuración del envío nativo (ver PepaNativeLocation.swift). Queda guardada en UserDefaults y se retoma al relanzar iOS la app.
    @objc func setNativeUpload(_ call: CAPPluginCall) {
        guard let url = call.getString("url"), let apikey = call.getString("apikey"), let token = call.getString("token") else {
            return call.reject("Faltan datos del envío nativo.")
        }
        PepaNativeLocation.shared.configure(url: url, apikey: apikey, token: token, distanceFilter: call.getDouble("distanceFilter") ?? 25)
        // Para que iOS pueda relanzar la app cerrada hace falta «Siempre»; si solo hay «Al usar la app», se pide el cambio.
        DispatchQueue.main.async {
            if CLLocationManager.authorizationStatus() == .authorizedWhenInUse {
                CLLocationManager().requestAlwaysAuthorization()
            }
        }
        call.resolve()
    }

    @objc func clearNativeUpload(_ call: CAPPluginCall) {
        PepaNativeLocation.shared.clear()
        call.resolve()
    }

    // ${MARK}: bordes de los lugares con aviso de llegada/salida (JSON), que iOS vigila aunque la app esté cerrada y con los que relanza la app al cruzarlos.
    @objc func setNativeRegions(_ call: CAPPluginCall) {
        guard let json = call.getString("regionsJson") else {
            return call.reject("Faltan los lugares.")
        }
        PepaNativeLocation.shared.setRegions(json: json)
        call.resolve()
    }

    // ${MARK}: ¿tiene la app el permiso «Siempre»? JavaScript lo usa para avisar.
    @objc func getBackgroundLocationStatus(_ call: CAPPluginCall) {
        call.resolve(["granted": PepaNativeLocation.hasAlwaysPermission()])
    }

`
  writeFileSync(swiftFile, swiftSrc.replace(listAnchor, list).replace(funcAnchor, methods + funcAnchor))
  console.log('patch-background-geolocation-ios: Plugin.swift parcheado')
}

// 3) Plugin.m
const objcSrc = normalize(readFileSync(objcFile, 'utf8'))
if (objcSrc.includes(MARK)) {
  console.log('patch-background-geolocation-ios: Plugin.m ya parcheado')
} else {
  const anchor = '    CAP_PLUGIN_METHOD(openSettings, CAPPluginReturnPromise);\n'
  if (!objcSrc.includes(anchor)) {
    fail('patch-background-geolocation-ios: no encuentro openSettings en Plugin.m — ¿ha cambiado el complemento? Revisa el parche.')
  }
  const added = `    CAP_PLUGIN_METHOD(setNativeUpload, CAPPluginReturnPromise); // ${MARK}
    CAP_PLUGIN_METHOD(clearNativeUpload, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getBackgroundLocationStatus, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(setNativeRegions, CAPPluginReturnPromise);
`
  writeFileSync(objcFile, objcSrc.replace(anchor, anchor + added))
  console.log('patch-background-geolocation-ios: Plugin.m parcheado')
}
