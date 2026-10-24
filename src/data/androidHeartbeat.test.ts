import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// LATIDO del servicio nativo de Android (24/10/2026): un móvil parado no mandaba nada (filtro de 25 m) y el mapa enseñaba posiciones de hace 15-50 minutos.
// No se puede compilar Android aquí: esta prueba solo vigila que el parche conserve las piezas que hacen que el latido funcione sin romper el aviso principal.
const service = readFileSync(resolve(process.cwd(), 'android-patches/background-geolocation/BackgroundGeolocationService.java'), 'utf8')

describe('latido de la ubicación nativa de Android', () => {
  it('es un aviso APARTE (otro código de petición): con el mismo PendingIntent sustituiría al principal', () => {
    expect(service).toContain('PendingIntent.getBroadcast(this, 0, receiverIntent, flags)') // principal
    expect(service).toContain('PendingIntent.getBroadcast(this, 1, receiverIntent, flags)') // latido
  })

  it('pide una posición cada pocos minutos, con bajo consumo y SIN filtro de distancia', () => {
    const block = service.slice(service.indexOf('private void registerHeartbeat'), service.indexOf('private void startNativeWatcher'))
    expect(block).toContain('PRIORITY_BALANCED_POWER_ACCURACY')
    expect(block).toContain('HEARTBEAT_INTERVAL_MS')
    expect(block).not.toContain('setSmallestDisplacement')
    expect(service).toMatch(/HEARTBEAT_INTERVAL_MS = 5 \* 60_000L/)
  })

  it('se registra junto al aviso principal y se quita siempre que se quita ese aviso', () => {
    expect(service).toContain('registerHeartbeat(client)')
    const remove = service.slice(service.indexOf('private void removeNativeRegistration'), service.indexOf('private void registerHeartbeat'))
    expect(remove).toContain('nativeHeartbeatPendingIntent()')
    expect(remove).toContain('nativePendingIntent()')
  })

  it('un fallo del latido nunca rompe el aviso principal (queda registrado en el diagnóstico)', () => {
    const block = service.slice(service.indexOf('private void registerHeartbeat'), service.indexOf('private void startNativeWatcher'))
    expect(block).toContain('catch (Exception e)')
    expect(block).toContain('no se pudo registrar el latido')
  })
})
