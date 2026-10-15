// Coste de Supabase (INC-17): las entradas a Comunidad que viven FUERA de Comunidad (Inicio y ficha de receta de la Cocina) no deben hacer consultas ni enseñar nada
// si Comunidad no está abierta para esa persona, y el estado de acceso se comparte entre ellas (una consulta, no una por pantalla).
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommunityStatus } from '@/domain/community'
import bannerSrc from '@/ui/community/recipes/RecipeUpdateBanner.tsx?raw'
import alimentacionSrc from '@/ui/AlimentacionScreen.tsx?raw'
import providerSrc from '@/ui/community/CommunityProvider.tsx?raw'

const statusCalls = vi.hoisted(() => ({ n: 0 }))
vi.mock('@/data/supabaseClient', () => ({ supabase: { auth: { onAuthStateChange: vi.fn() } } }))
vi.mock('@/data/community', () => ({
  communityStatus: vi.fn(async () => {
    statusCalls.n += 1
    return { launched: true, visible: true, isAdmin: false }
  }),
  getRecipeUpdate: vi.fn(),
  markRecipeUpdated: vi.fn(),
}))

import { communityStatusCache } from '@/data/communityStatusCache'
import { CommunityHomeEntry } from '@/ui/community/CommunityHomeEntry'
import { ShareToCommunityButton } from '@/ui/community/recipes/ShareToCommunityButton'
import { shouldAskForUpdate } from '@/ui/community/recipes/recipeUpdateCache'

const status = (visible: boolean): CommunityStatus => ({ launched: visible, visible, isAdmin: false })
const html = (node: React.ReactElement) => renderToStaticMarkup(createElement(MemoryRouter, null, node))

beforeEach(() => {
  communityStatusCache.clear()
  statusCalls.n = 0
})

describe('«Compartir en Comunidad» y la entrada de Inicio solo salen si Comunidad está abierta para esta persona', () => {
  it('sin saber todavía el estado (o con Comunidad cerrada / sin acceso) no se pinta nada', () => {
    expect(html(createElement(ShareToCommunityButton, { onShare: () => undefined }))).toBe('')
    expect(html(createElement(CommunityHomeEntry))).toBe('')
    communityStatusCache.prime(status(false))
    expect(html(createElement(ShareToCommunityButton, { onShare: () => undefined }))).toBe('')
    expect(html(createElement(CommunityHomeEntry))).toBe('')
  })

  it('con Comunidad abierta salen el botón (44 px de alto) y la entrada de Inicio', () => {
    communityStatusCache.prime(status(true))
    const button = html(createElement(ShareToCommunityButton, { onShare: () => undefined }))
    expect(button).toContain('🌍 Compartir en Comunidad')
    expect(button).toContain('min-height:44px')
    expect(html(createElement(CommunityHomeEntry))).toContain('href="/comunidad"')
  })

  it('pintarlos no hace ninguna consulta por sí solo (las consultas son de los efectos y se comparten)', () => {
    communityStatusCache.prime(status(true))
    html(createElement(ShareToCommunityButton, { onShare: () => undefined }))
    html(createElement(CommunityHomeEntry))
    expect(statusCalls.n).toBe(0)
  })

  it('al cambiar de persona (clear) se olvida el estado: no se enseña nada hasta volver a comprobarlo', () => {
    communityStatusCache.prime(status(true))
    communityStatusCache.clear()
    expect(html(createElement(ShareToCommunityButton, { onShare: () => undefined }))).toBe('')
  })
})

describe('el aviso «Hay una versión nueva» no pregunta a Supabase si Comunidad no está abierta', () => {
  it('solo se pregunta con Comunidad abierta y una receta que aún puede ser importada', () => {
    expect(shouldAskForUpdate(true, false)).toBe(true)
    expect(shouldAskForUpdate(true, true)).toBe(false) // ya se sabe que no es importada
    expect(shouldAskForUpdate(false, false)).toBe(false) // Comunidad cerrada o sin acceso
    expect(shouldAskForUpdate(null, false)).toBe(false) // todavía no se sabe
  })

  it('el efecto del aviso usa esa regla y solo hay una llamada a getRecipeUpdate (dentro de lookup)', () => {
    expect(bannerSrc).toContain('shouldAskForUpdate(visible, isKnownNotImported(browserStore(), recipeId))')
    expect(bannerSrc.match(/getRecipeUpdate\(/g)).toHaveLength(1)
    const effect = bannerSrc.slice(bannerSrc.indexOf('useEffect('), bannerSrc.indexOf('const info ='))
    expect(effect.indexOf('shouldAskForUpdate')).toBeGreaterThan(-1)
    expect(effect.indexOf('shouldAskForUpdate')).toBeLessThan(effect.indexOf('lookup('))
  })

  it('si el servidor dice «no abierta» o «sin acceso», se olvida el estado recordado (las demás recetas no vuelven a preguntar)', () => {
    expect(bannerSrc).toContain("code === 'NOT_LAUNCHED' || code === 'COMMUNITY_ACCESS_DENIED'")
    expect(bannerSrc).toContain('communityStatusCache.clear()')
  })

  it('la Cocina usa el botón que se oculta solo (no pinta «Compartir» directamente) y la hoja sigue cargándose solo al pulsar', () => {
    expect(alimentacionSrc).toContain('<ShareToCommunityButton onShare={() => setSharing(viewing)} />')
    expect(alimentacionSrc).not.toMatch(/<button[^>]*>\s*🌍 Compartir en Comunidad/)
    expect(alimentacionSrc).toContain("lazy(() => import('@/ui/community/recipes/RecipePublishSheet')")
  })
})

describe('el estado que ya trae Comunidad alimenta la memoria sin otra consulta', () => {
  it('el Provider guarda en la memoria lo que pide al entrar y al refrescar el acceso', () => {
    expect(providerSrc.match(/communityStatusCache\.prime\(s\)/g)).toHaveLength(2)
  })
})
