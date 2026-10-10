// Parche del complemento Android @capacitor-community/speech-recognition (dictado por voz de la app nativa).
//
// Dos puntos del código original cierran la app entera (excepción sin capturar en el hilo principal) en móviles donde el servicio de
// reconocimiento de voz no se deja enlazar — caso real: Xiaomi, la app se cerraba al abrirla nada más instalar el complemento:
//  1. load(): crea el reconocedor al ARRANCAR la app, sin protección. Aquí se envuelve: si falla, solo se anota en el registro; el reconocedor
//     se vuelve a crear (esta vez dentro de un try/catch que sí devuelve el error a JavaScript) cuando se pide escuchar.
//  2. stopListening(): relanzaba cualquier excepción (por ejemplo reconocedor nulo) dentro del hilo principal. Aquí solo se anota.
//
// Se ejecuta tras cada «npm install/ci» (postinstall) y de forma explícita en el flujo de construcción del APK. Es idempotente, y si el
// complemento cambia y el texto esperado ya no está, FALLA en voz alta en vez de seguir sin el parche.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const file = join(root, 'node_modules/@capacitor-community/speech-recognition/android/src/main/java/com/getcapacitor/community/speechrecognition/SpeechRecognition.java')
const MARK = 'PEPA-PATCH'
// --soft: tras «npm install» solo avisa si algo no cuadra (no debe romper la publicación de la web); sin él, en la construcción del APK, falla.
const soft = process.argv.includes('--soft')
function fail(message) {
  console.error(message)
  process.exit(soft ? 0 : 1)
}

if (!existsSync(file)) {
  console.log('patch-speech-plugin: el complemento no está instalado, nada que parchear')
  process.exit(0)
}

let src = readFileSync(file, 'utf8')
if (src.includes(MARK)) {
  console.log('patch-speech-plugin: ya parcheado')
  process.exit(0)
}

const loadRe =
  /(\.post\(\(\) -> \{\s*)(speechRecognizer = SpeechRecognizer\.createSpeechRecognizer\(bridge\.getActivity\(\)\);\s*SpeechRecognitionListener listener = new SpeechRecognitionListener\(\);\s*speechRecognizer\.setRecognitionListener\(listener\);\s*Logger\.info\(getLogTag\(\), "Instantiated SpeechRecognizer in load\(\)"\);)(\s*\}\);)/
if (!loadRe.test(src)) {
  fail('patch-speech-plugin: no encuentro el bloque de load() — ¿ha cambiado el complemento? Revisa el parche.')
}
src = src.replace(
  loadRe,
  (_m, open, body, close) =>
    `${open}// ${MARK}: no cerrar la app si el servicio de voz del móvil no se deja enlazar\n                try {\n                    ${body}\n                } catch (Throwable t) {\n                    Logger.error(getLogTag(), "SpeechRecognizer no disponible al arrancar", t);\n                }${close}`,
)

const stopRe = /\} catch \(Exception ex\) \{\s*throw ex;\s*\} finally \{/
if (!stopRe.test(src)) {
  fail('patch-speech-plugin: no encuentro el bloque de stopListening() — ¿ha cambiado el complemento? Revisa el parche.')
}
src = src.replace(stopRe, `} catch (Exception ex) {\n                    // ${MARK}: no relanzar dentro del hilo principal (cerraba la app)\n                    Logger.error(getLogTag(), "stopListening falló", ex);\n                } finally {`)

writeFileSync(file, src)
console.log('patch-speech-plugin: parche aplicado')
