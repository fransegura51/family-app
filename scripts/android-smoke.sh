#!/usr/bin/env bash
# Prueba de humo del APK en un móvil Android virtual: lo instala, lo abre y comprueba que NO se cierra solo. Si se cierra, saca el motivo real
# (la traza del fallo) para poder arreglarlo sin tener el móvil delante. Lo llama el flujo «Android APK» (job smoke) dentro del emulador.
set -u
APK="${1:?uso: android-smoke.sh ruta/al.apk}"
PKG=es.pepafamilyapp.app

echo "== Instalando $APK"
adb install -r "$APK" || { echo "No se pudo instalar el APK"; exit 1; }

# Mismos permisos que concede el usuario al usarla (ubicación; notificaciones y micrófono se piden en pantalla, no al arrancar).
adb shell pm grant "$PKG" android.permission.ACCESS_FINE_LOCATION || true
adb shell pm grant "$PKG" android.permission.ACCESS_COARSE_LOCATION || true

adb logcat -c
echo "== Abriendo la app"
adb shell am start -W -n "$PKG/.MainActivity"
sleep 45

adb logcat -d > smoke-logcat.txt
if adb shell pidof "$PKG" > /dev/null; then
  echo "== La app SIGUE ABIERTA tras 45 s: no se cierra al arrancar"
  CRASHED=0
else
  echo "== La app SE HA CERRADO"
  CRASHED=1
fi

echo "== Fallos registrados (FATAL EXCEPTION / AndroidRuntime / errores del complemento)"
grep -nE "FATAL EXCEPTION|AndroidRuntime|Process: $PKG|Caused by|SpeechRecognition|Capacitor.*(Error|Exception)" smoke-logcat.txt | head -80

if [ "$CRASHED" = "1" ]; then
  echo "== Traza completa del fallo"
  grep -n -A 40 "FATAL EXCEPTION" smoke-logcat.txt | head -120
  exit 1
fi
