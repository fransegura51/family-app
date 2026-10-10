#!/usr/bin/env bash
# Prueba de humo del APK en un móvil Android virtual: lo instala, lo abre y comprueba que NO se cierra solo. Si se cierra, saca el motivo real
# (la traza del fallo) para poder arreglarlo sin tener el móvil delante. Lo llama el flujo «Android APK» (job smoke) dentro del emulador.
set -u
APK="${1:?uso: android-smoke.sh ruta/al.apk}"
PKG=es.pepafamilyapp.app

# Espera (hasta N segundos) a que la app esté viva y MainActivity en primer plano. El móvil virtual es lento y a veces la app de Google le roba
# la pantalla un momento: una espera paciente distingue un fallo real de un simple retraso.
wait_main_front() {
  local limit="$1" waited=0
  while [ "$waited" -lt "$limit" ]; do
    if adb shell pidof "$PKG" > /dev/null && adb shell dumpsys activity activities | grep -E "topResumedActivity|mResumedActivity" | grep -q "MainActivity"; then
      echo "   (en primer plano a los ${waited}s)"
      return 0
    fi
    sleep 3
    waited=$((waited + 3))
  done
  return 1
}

echo "== Instalando $APK"
adb install -r "$APK" || { echo "No se pudo instalar el APK"; exit 1; }

# Mismos permisos que concede el usuario al usarla (ubicación; notificaciones y micrófono se piden en pantalla, no al arrancar).
adb shell pm grant "$PKG" android.permission.ACCESS_FINE_LOCATION || true
adb shell pm grant "$PKG" android.permission.ACCESS_COARSE_LOCATION || true

adb logcat -c
echo "== Abriendo la app"
# Igual que tocar el icono: por la categoría LAUNCHER (entra por LauncherActivity, que abre MainActivity).
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1
sleep 45

adb logcat -d > smoke-logcat.txt
if adb shell pidof "$PKG" > /dev/null; then
  echo "== La app SIGUE ABIERTA tras 45 s: no se cierra al arrancar"
  CRASHED=0
else
  echo "== La app SE HA CERRADO"
  CRASHED=1
fi

echo "== Pantalla en primer plano"
adb shell dumpsys activity activities | grep -E "topResumedActivity|mResumedActivity" | head -3
if ! adb shell dumpsys activity activities | grep -E "topResumedActivity|mResumedActivity" | grep -q "MainActivity"; then
  echo "== PEPA (MainActivity) NO está en primer plano"
  CRASHED=1
fi

# Vuelta de Google Calendar y del banco: la página puente abre es.pepafamilyapp.app://open/... — con la app ya abierta y con la app cerrada del todo.
# Si el complemento «App» o el enlace fallan, la app se cierra o no queda en primer plano.
echo "== Enlace de vuelta con la app abierta (Google Calendar)"
adb logcat -c
adb shell "am start -a android.intent.action.VIEW -d 'es.pepafamilyapp.app://open/calendario?google=connected' $PKG"
if wait_main_front 45; then
  echo "== OK: la app sigue abierta tras el enlace de Google"
else
  echo "== FALLO: la app se cerró o no está en primer plano tras el enlace de Google"
  echo "-- proceso vivo: $(adb shell pidof "$PKG" || echo NO)"
  adb shell dumpsys activity activities | grep -E "topResumedActivity|mResumedActivity" | head -5
  adb logcat -d -t 300 | grep -E "ActivityTaskManager|Capacitor|es.pepafamilyapp|FATAL|AndroidRuntime" | tail -20
  CRASHED=1
fi
echo "== Enlace de vuelta con la app CERRADA del todo (banco)"
adb shell am force-stop "$PKG"
adb shell "am start -a android.intent.action.VIEW -d 'es.pepafamilyapp.app://open/?bank=connected' $PKG"
if wait_main_front 60; then
  echo "== OK: la app arranca y se queda abierta con el enlace del banco"
else
  echo "== FALLO: la app no arranca bien con el enlace del banco"
  echo "-- proceso vivo: $(adb shell pidof "$PKG" || echo NO)"
  adb shell dumpsys activity activities | grep -E "topResumedActivity|mResumedActivity" | head -5
  adb logcat -d -t 300 | grep -E "ActivityTaskManager|Capacitor|es.pepafamilyapp|FATAL|AndroidRuntime" | tail -20
  CRASHED=1
fi
adb logcat -d > smoke-logcat.txt

echo "== Fallos registrados (FATAL EXCEPTION / AndroidRuntime / errores del complemento)"
grep -nE "FATAL EXCEPTION|AndroidRuntime|Process: $PKG|Caused by|SpeechRecognition|Capacitor.*(Error|Exception)" smoke-logcat.txt | head -80

if [ "$CRASHED" = "1" ]; then
  echo "== Traza completa del fallo"
  grep -n -A 40 "FATAL EXCEPTION" smoke-logcat.txt | head -120
  exit 1
fi

# El informe de fallos se enseña de verdad (se fuerza uno de ejemplo con el gancho de prueba y se comprueba que sale en pantalla).
echo "== Probando el informe de fallos"
adb shell am force-stop "$PKG"
adb shell am start -n "$PKG/.LauncherActivity" --ez pepa_demo_crash true
sleep 6
adb shell uiautomator dump /sdcard/ui.xml > /dev/null
if adb shell cat /sdcard/ui.xml | grep -q "Informe del fallo"; then
  echo "== El informe de fallos SE VE en pantalla"
else
  echo "== El informe de fallos NO aparece"
  exit 1
fi
