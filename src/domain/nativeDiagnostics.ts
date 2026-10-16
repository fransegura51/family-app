// Registro del servicio de ubicación nativa de Android (ver android-patches/background-geolocation y NativeLocationReceiver.java): el móvil anota sus
// arranques, reinicios, permisos y errores de envío, y la app lo sube al servidor al abrirse SOLO si cuenta algo fuera de lo normal. Así, cuando los avisos
// fallan, se puede leer por qué se paró el servicio sin tener el móvil delante.

// Lo normal: abrir y cerrar la app y registrar el envío. Cualquier otra línea (reinicio del sistema, falta de permiso, error de envío…) es noticia.
const ROUTINE = /^(app abierta|app cerrada|envío nativo registrado)/i

export function isNotableNativeLog(log: string): boolean {
  return log
    .split('\n')
    .map((line) => line.trim().replace(/^\d\d\/\d\d \d\d:\d\d:\d\d /, ''))
    .filter(Boolean)
    .some((line) => !ROUTINE.test(line))
}

export function describeNativeLog(log: string, lastOkAt: number, backgroundGranted: boolean): { message: string; detail: string } {
  const last = lastOkAt > 0 ? new Date(lastOkAt).toISOString() : 'nunca'
  return {
    message: `[ubicación nativa] registro del móvil · «Permitir siempre»: ${backgroundGranted ? 'sí' : 'NO'} · último envío correcto: ${last}`,
    detail: log.trim().slice(-3800),
  }
}
