// Parche del complemento Android @capacitor-community/background-geolocation (ubicación con la app NATIVA CERRADA).
//
// El complemento original apaga su servicio de ubicación en cuanto la app se cierra (al deslizarla en apps recientes), y sin JavaScript nadie recibe
// ya las posiciones. Este parche:
//  1. sustituye el servicio por la copia de android-patches/background-geolocation/BackgroundGeolocationService.java, que sigue vivo tras cerrar la
//     app y manda cada posición al servidor él solo (función report_device_location, migración 0253);
//  2. añade al complemento dos métodos para JavaScript: setNativeUpload (guarda dirección del servidor + llave de este móvil) y clearNativeUpload.
//
// Se ejecuta tras cada «npm install/ci» (postinstall) y de forma explícita en el flujo de construcción del APK. Es idempotente. Si el complemento
// cambia (otra versión o ficheros distintos), FALLA en voz alta en vez de seguir sin el parche o pisar código nuevo.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pluginDir = join(root, 'node_modules/@capacitor-community/background-geolocation')
const javaDir = join(pluginDir, 'android/src/main/java/com/equimaps/capacitor_background_geolocation')
const serviceFile = join(javaDir, 'BackgroundGeolocationService.java')
const pluginFile = join(javaDir, 'BackgroundGeolocation.java')
const patchedService = join(root, 'android-patches/background-geolocation/BackgroundGeolocationService.java')

const MARK = 'PEPA-PATCH'
const EXPECTED_VERSION = '1.2.26'
// sha256 del servicio original (con saltos de línea normalizados a \n) de la versión esperada.
const ORIGINAL_SERVICE_SHA256 = '3eda3d169b3e16346b7e30bb037998f34aa3f2021a826dee61a4e472deeaec8c'

const soft = process.argv.includes('--soft')
function fail(message) {
  console.error(message)
  process.exit(soft ? 0 : 1)
}
const normalize = (text) => text.replace(/\r\n/g, '\n')

if (!existsSync(serviceFile)) {
  console.log('patch-background-geolocation: el complemento no está instalado, nada que parchear')
  process.exit(0)
}

const version = JSON.parse(readFileSync(join(pluginDir, 'package.json'), 'utf8')).version
if (version !== EXPECTED_VERSION) {
  fail(`patch-background-geolocation: el complemento es la versión ${version} y el parche es para la ${EXPECTED_VERSION}. Revisa android-patches/background-geolocation y el parche.`)
}

// 1) Servicio
const serviceSrc = readFileSync(serviceFile, 'utf8')
if (serviceSrc.includes(MARK)) {
  console.log('patch-background-geolocation: servicio ya parcheado')
} else {
  const sha = createHash('sha256').update(normalize(serviceSrc)).digest('hex')
  if (sha !== ORIGINAL_SERVICE_SHA256) {
    fail('patch-background-geolocation: el servicio original no es el esperado (huella distinta). Revisa el complemento antes de sobrescribirlo.')
  }
  writeFileSync(serviceFile, readFileSync(patchedService, 'utf8'))
  console.log('patch-background-geolocation: servicio sustituido')
}

// 2) Métodos nuevos en el complemento
const pluginSrc = readFileSync(pluginFile, 'utf8')
if (pluginSrc.includes(MARK)) {
  console.log('patch-background-geolocation: complemento ya parcheado')
} else {
  const anchor = '    @PluginMethod()\n    public void openSettings(PluginCall call) {'
  const normalized = normalize(pluginSrc)
  if (!normalized.includes(anchor)) {
    fail('patch-background-geolocation: no encuentro openSettings() en el complemento — ¿ha cambiado? Revisa el parche.')
  }
  const methods = `    // ${MARK}: configuración del envío nativo (ver BackgroundGeolocationService.java). La guarda en SharedPreferences: el servicio la lee solo,
    // aunque la app esté cerrada o el sistema haya reiniciado el proceso.
    @PluginMethod()
    public void setNativeUpload(PluginCall call) {
        String url = call.getString("url");
        String apikey = call.getString("apikey");
        String token = call.getString("token");
        if (url == null || apikey == null || token == null) {
            call.reject("Faltan datos del envío nativo.");
            return;
        }
        getContext().getSharedPreferences(BackgroundGeolocationService.PREFS, Context.MODE_PRIVATE).edit()
                .putString(BackgroundGeolocationService.KEY_URL, url)
                .putString(BackgroundGeolocationService.KEY_APIKEY, apikey)
                .putString(BackgroundGeolocationService.KEY_TOKEN, token)
                .putString(BackgroundGeolocationService.KEY_TITLE, call.getString("backgroundTitle", "PEPA usa tu ubicación"))
                .putString(BackgroundGeolocationService.KEY_MESSAGE, call.getString("backgroundMessage", "Para avisar a tu familia cuando llegas a un sitio o te vas."))
                .putFloat(BackgroundGeolocationService.KEY_DISTANCE, call.getFloat("distanceFilter", 25f))
                .apply();
        call.resolve();
    }

    // ${MARK}: ¿tiene la app el permiso «Permitir siempre»? (en Android 9 o anterior no existe y no hace falta). JavaScript lo usa para avisar.
    @PluginMethod()
    public void getBackgroundLocationStatus(PluginCall call) {
        boolean granted = android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.Q
                || getContext().checkSelfPermission(android.Manifest.permission.ACCESS_BACKGROUND_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED;
        com.getcapacitor.JSObject result = new com.getcapacitor.JSObject();
        result.put("granted", granted);
        call.resolve(result);
    }

    @PluginMethod()
    public void clearNativeUpload(PluginCall call) {
        getContext().getSharedPreferences(BackgroundGeolocationService.PREFS, Context.MODE_PRIVATE).edit().clear().apply();
        if (service != null) {
            service.nativeUploadCleared();
        }
        call.resolve();
    }

`
  writeFileSync(pluginFile, normalized.replace(anchor, methods + anchor))
  console.log('patch-background-geolocation: métodos añadidos al complemento')
}
