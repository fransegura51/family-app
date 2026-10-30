import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { checkEntitlement, FEATURE_KEYS } from '@/domain/entitlements'

describe('BLOQUE 9 · preparación del modelo por planes (sin implementar nada comercial)', () => {
  it('hoy TODAS las funciones están permitidas para todas las familias: nadie queda bloqueado', () => {
    for (const k of FEATURE_KEYS) {
      expect(checkEntitlement(k)).toEqual({ allowed: true, reason: 'sin-modelo-comercial' })
      expect(checkEntitlement(k, { familyId: 'cualquiera' }).allowed).toBe(true)
    }
  })
  it('el módulo no inventa precios, planes ni cupos', () => {
    const src = readFileSync('src/domain/entitlements.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    expect(src).not.toMatch(/\bprice\b|\bprecio\b|€|\bplan\b|\bquota\b|\bcupo\b|\blimit\b/i)
  })
  it('las decisiones comerciales pendientes están documentadas, incluido que el límite de un evento solo se documenta', () => {
    const doc = readFileSync('docs/FREEMIUM_PREPARACION.md', 'utf8')
    for (const t of ['Suscripción familiar', 'Número de miembros', 'Gratis, Flexible y Completo', 'Conexiones bancarias', 'Solo se documenta la posibilidad de limitar a un evento']) expect(doc).toContain(t)
  })
})
