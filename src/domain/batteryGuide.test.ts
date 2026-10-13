import { describe, expect, it } from 'vitest'
import { detectBrand, modelFromUserAgent, orderedGuides } from '@/domain/batteryGuide'

const ua = (model: string) => `Mozilla/5.0 (Linux; Android 14; ${model} Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36`

describe('guía de batería: reconocer la marca por el código de modelo', () => {
  it('saca el modelo del navegador interno de la app', () => {
    expect(modelFromUserAgent(ua('22101316G'))).toBe('22101316G')
    expect(modelFromUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('')
  })

  it('el móvil real de la familia (22101316G) se reconoce como Xiaomi', () => {
    expect(detectBrand(ua('22101316G'))).toBe('xiaomi')
    expect(detectBrand(ua('2201117TG'))).toBe('xiaomi')
    expect(detectBrand(ua('M2101K7AG'))).toBe('xiaomi')
  })

  it('otras marcas', () => {
    expect(detectBrand(ua('SM-S918B'))).toBe('samsung')
    expect(detectBrand(ua('Pixel 8'))).toBe('google')
    expect(detectBrand(ua('CPH2447'))).toBe('oppo')
    expect(detectBrand(ua('RMX3630'))).toBe('oppo')
    expect(detectBrand(ua('ELS-NX9'))).toBe('huawei')
  })

  it('lo que no se reconoce no se adivina: «other», y se enseñan todas las marcas', () => {
    expect(detectBrand(ua('Foo Bar 9000'))).toBe('other')
    expect(orderedGuides('other').map((g) => g.brand)).toEqual(['xiaomi', 'samsung', 'huawei', 'oppo', 'google'])
  })

  it('la marca reconocida va la primera', () => {
    expect(orderedGuides('samsung')[0].brand).toBe('samsung')
    expect(orderedGuides('samsung')).toHaveLength(5)
  })

  it('la guía de Xiaomi menciona lo que de verdad lo arregló', () => {
    const xiaomi = orderedGuides('xiaomi')[0].steps.join(' ')
    expect(xiaomi).toContain('Autoinicio en segundo plano')
    expect(xiaomi).toContain('Sin restricciones')
  })
})

describe('guía de batería: conectada en la pantalla de Familia, solo en la app nativa', () => {
  it('Familia la enseña justo debajo de los avisos, y la tarjeta se oculta fuera de la app nativa', async () => {
    const family = (await import('@/ui/FamilyScreen.tsx?raw')).default
    const card = (await import('@/ui/BatteryGuideCard.tsx?raw')).default
    expect(family).toMatch(/<NotificationsCard \/>\s*<BatteryGuideCard \/>/)
    expect(card).toContain('if (!isNativeApp()) return null')
  })
})
