import { describe, expect, it } from 'vitest'
import { describeNativeLog, isNotableNativeLog } from '@/domain/nativeDiagnostics'

describe('registro del servicio de ubicación nativa', () => {
  it('abrir y cerrar la app es lo normal: no se sube', () => {
    expect(isNotableNativeLog('')).toBe(false)
    expect(isNotableNativeLog('16/10 17:45:01 app cerrada: el servicio sigue con el envío nativo\n16/10 17:45:02 envío nativo registrado (aviso al receptor)\n16/10 20:13:10 app abierta: JavaScript retoma el envío\n')).toBe(false)
  })
  it('un reinicio del sistema, un permiso que falta o un envío fallido sí se suben', () => {
    expect(isNotableNativeLog('16/10 17:50:00 Android reinicia el servicio tras matar el proceso (con configuración de envío)\n')).toBe(true)
    expect(isNotableNativeLog('16/10 17:50:00 SIN PERMISO de ubicación para el envío nativo\n')).toBe(true)
    expect(isNotableNativeLog('16/10 17:50:00 receptor: envío fallido (UnknownHostException: x)\n')).toBe(true)
    expect(isNotableNativeLog('16/10 17:50:00 no se pudo pasar a primer plano: ForegroundServiceStartNotAllowedException\n')).toBe(true)
  })
  it('el informe dice si faltaba «Permitir siempre» y cuándo fue el último envío bueno', () => {
    const d = describeNativeLog('x\n', Date.UTC(2026, 9, 16, 15, 45), false)
    expect(d.message).toContain('«Permitir siempre»: NO')
    expect(d.message).toContain('2026-10-16T15:45:00.000Z')
    expect(describeNativeLog('x', 0, true).message).toContain('último envío correcto: nunca')
  })
})
