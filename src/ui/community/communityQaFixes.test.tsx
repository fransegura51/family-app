// Arreglos del informe QA visual (15/10/2026): portada que recuerda su posición, declaración de mayoría de edad, franja horaria que no guarda sola, texto de ayuda
// de «Enviar denuncia», un solo aviso para menores de 15, tabla accesible, contraste de enlaces y objetivos táctiles de 44 px. Render estático (sin navegador) y
// lectura del código fuente/CSS con ?raw.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import homeSrc from '@/ui/community/CommunityHome.tsx?raw'
import searchSrc from '@/ui/community/SearchPage.tsx?raw'
import aliasSrc from '@/ui/community/AliasDialog.tsx?raw'
import noticeSrc from '@/ui/community/CommunityNoticePrefs.tsx?raw'
import articleSrc from '@/ui/community/ArticleSources.tsx?raw'
import reportSrc from '@/ui/community/ReportDialog.tsx?raw'
import settingsSrc from '@/ui/community/MySettingsPage.tsx?raw'
import { unavailableReasonText } from '@/domain/communityAccess'
import { DEFAULT_NOTIFICATION_PREFS } from '@/domain/notificationPrefs'
import { HOME_STATE_KEY, loadHomeState, saveHomeState } from '@/ui/community/communityListState'

// (los .css con ?raw llegan vacíos en vitest: se leen del disco, como en communityPostUi.test.tsx)
const readCss = (rel: string) => readFileSync(join(process.cwd(), 'src/ui/community', rel), 'utf8')
const baseCss = readCss('community.css')
const postCss = readCss('communityPost.css')
const recipesCss = readCss('recipes/communityRecipes.css')

const rpc = vi.hoisted(() => vi.fn(async () => ({ data: { alias: 'Ana' }, error: null })))
vi.mock('@/data/supabaseClient', () => ({ supabase: { rpc } }))

const { setCommunityAlias } = await import('@/data/community')
const { CommunityNoticePrefs } = await import('@/ui/community/CommunityNoticePrefs')
const { ReportDialog } = await import('@/ui/community/ReportDialog')

function render(el: React.ReactElement): string {
  return renderToStaticMarkup(createElement(MemoryRouter, null, el))
}

// sessionStorage de mentira para el entorno node.
function fakeSessionStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
  return store
}

describe('portada: recuerda su estado al volver atrás', () => {
  beforeEach(() => {
    fakeSessionStorage()
  })

  it('guarda y recupera bloques, texto del buscador y posición', () => {
    saveHomeState({ scrollY: 882, text: 'tortilla', blocks: { recientes: { status: 'ready', items: [] } } })
    const st = loadHomeState<{ recientes: unknown }>()
    expect(st).toMatchObject({ scrollY: 882, text: 'tortilla', blocks: { recientes: { status: 'ready', items: [] } } })
  })

  it('caduca a los 30 minutos y descarta datos raros', () => {
    const store = fakeSessionStorage()
    saveHomeState({ scrollY: 5, text: '', blocks: {} })
    const key = [...store.keys()][0]
    expect(key).toContain(HOME_STATE_KEY)
    const old = JSON.parse(store.get(key) as string)
    store.set(key, JSON.stringify({ ...old, savedAt: Date.now() - 31 * 60 * 1000 }))
    expect(loadHomeState()).toBeNull()
    store.set(key, '{no es json')
    expect(loadHomeState()).toBeNull()
    store.set(key, JSON.stringify({ scrollY: 'x', text: '', blocks: {}, savedAt: Date.now() }))
    expect(loadHomeState()).toBeNull()
  })

  it('sin almacenamiento no falla', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('no disponible')
      },
      setItem: () => {
        throw new Error('no disponible')
      },
      removeItem: () => {
        throw new Error('no disponible')
      },
    })
    expect(() => saveHomeState({ scrollY: 1, text: '', blocks: {} })).not.toThrow()
    expect(loadHomeState()).toBeNull()
  })

  it('la portada solo recupera al volver atrás (POP), no vuelve a pedir lo recuperado y guarda al salir', () => {
    expect(homeSrc).toContain("navType !== 'POP'")
    expect(homeSrc).toContain('if (saved && reloadToken === 0) return')
    expect(homeSrc).toContain('window.scrollTo(0, saved.scrollY)')
    expect(homeSrc).toContain('saveHomeState(')
    expect(homeSrc).toContain('clearListState(HOME_STATE_KEY)')
    // Solo se guarda una portada con los bloques públicos ya cargados y sin fallo.
    expect(homeSrc).toContain("st.status !== 'ready'")
  })
})

describe('la edad ya no se declara: sale de la fecha de nacimiento de la ficha de Familia', () => {
  beforeEach(() => rpc.mockClear())

  it('el envoltorio del alias no declara nada por la persona (p_declare_adult = false)', async () => {
    await setCommunityAlias('Ana', null, true)
    expect(rpc).toHaveBeenLastCalledWith('community_set_alias', { p_alias: 'Ana', p_avatar_emoji: null, p_accept_rules: true, p_declare_adult: false })
  })

  it('el diálogo del alias ya no tiene casilla de «Confirmo que tengo 18 años» (sin fecha fiable no hay acceso, no hay declaración)', () => {
    expect(aliasSrc).not.toContain('ADULT_DECLARATION')
    expect(aliasSrc).not.toContain('needsAdult')
    expect(aliasSrc).toContain('setCommunityAlias(alias.trim(), emoji, accepted)')
  })
})

describe('franja horaria: no se guarda hasta pulsar «Guardar franja»', () => {
  it('elegir la franja solo enseña las horas (no llama a onSave)', () => {
    expect(noticeSrc).toContain('onChange={() => setPickWindow(true)}')
    expect(noticeSrc).not.toContain('onChange={saveWindow}')
    // La única llamada a guardar la franja es el botón.
    expect(noticeSrc.match(/saveWindow/g)?.length).toBe(2) // definición + botón
  })

  it('con la franja ya guardada se ven las horas y el botón; sin ella, no', () => {
    const win = render(createElement(CommunityNoticePrefs, { prefs: { ...DEFAULT_NOTIFICATION_PREFS, personalCommunityMode: 'window' }, onSave: () => undefined }))
    expect(win).toContain('Guardar franja')
    const any = render(createElement(CommunityNoticePrefs, { prefs: { ...DEFAULT_NOTIFICATION_PREFS, personalCommunityMode: 'any' }, onSave: () => undefined }))
    expect(any).not.toContain('Guardar franja')
  })
})

describe('textos y accesibilidad pequeños', () => {
  it('«Enviar denuncia» desactivado explica por qué', () => {
    const html = render(createElement(ReportDialog, { type: 'post', id: 'p1', onClose: () => undefined }))
    expect(html).toContain('Elige un motivo para poder enviar')
    expect(html).toContain('aria-describedby="report-reason-hint"')
    expect(reportSrc).toContain('!reason && (')
  })

  it('menor de 18: el motivo no repite la frase de «lo demás de PEPA sigue igual» (la pone la pantalla una sola vez)', () => {
    const text = unavailableReasonText('under_18')
    expect(text).toContain('18 años')
    expect(text).not.toMatch(/sigue/i)
  })

  it('buscador con texto corto que no se corta en móvil', () => {
    expect(homeSrc).toContain('placeholder="Busca en Comunidad"')
    expect(searchSrc).toContain('placeholder="Busca en Comunidad"')
  })

  it('la tabla del artículo se alcanza con teclado y tiene nombre', () => {
    expect(articleSrc).toMatch(/community-article-table-wrap" tabIndex=\{0\} role="region" aria-label="[^"]+"/)
  })
})

// Contraste WCAG entre dos colores #rrggbb.
function contrast(a: string, b: string): number {
  const lum = (h: string) => {
    const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }
  const [x, y] = [lum(a), lum(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

describe('contraste y táctil (CSS)', () => {
  it('el azul de enlaces de Comunidad llega a 4,5:1 sobre blanco y sobre el fondo de la app', () => {
    const m = /\.community-screen,\s*\.community-touch-scope \{\s*--primary: (#[0-9a-f]{6});/i.exec(baseCss)
    expect(m).not.toBeNull()
    const blue = (m as RegExpExecArray)[1]
    expect(contrast(blue, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(contrast(blue, '#f5f6fa')).toBeGreaterThanOrEqual(4.5)
    // El azul de antes no llegaba (por eso se cambia).
    expect(contrast('#4c6ef5', '#ffffff')).toBeLessThan(4.5)
  })

  it('los botones de texto, las casillas con etiqueta y las migas miden ≥ 44 px sin cambiar de aspecto', () => {
    expect(baseCss).toMatch(/\.community-screen \.link-button,[^{]*\{\s*min-height: 44px;/)
    expect(baseCss).toMatch(/\.community-touch-label,\s*\.community-screen \.checkbox-label \{\s*min-height: 44px;/)
    // Migas: relleno compensado con margen negativo (la línea mide lo mismo, el toque 45 px).
    expect(baseCss).toMatch(/\.community-crumbs a \{\s*display: inline-block;\s*padding: 13px 6px;\s*margin: -13px -6px;/)
  })

  it('las casillas de alias y ajustes usan la etiqueta táctil', () => {
    expect(aliasSrc).toContain('checkbox-label community-touch-label')
    expect(settingsSrc).toContain('checkbox-label community-touch-label')
  })

  it('editor de recetas en Comunidad: ↑ ↓ ✕ de 44 px, «+ Añadir» de 44 px y Cantidad ≥ 72 px, sin tocar las reglas de la Cocina', () => {
    expect(recipesCss).toMatch(/\.community-recipe-fields \.recipe-step-actions \.recipe-row-remove \{\s*height: 44px;/)
    expect(recipesCss).toMatch(/\.community-recipe-fields \.link-button \{\s*min-height: 44px;/)
    const qty = /\.community-recipe-fields \.recipe-ing-qty \{\s*width: (\d+)px;/.exec(recipesCss)
    expect(Number((qty as RegExpExecArray)[1])).toBeGreaterThanOrEqual(72)
    // Todas las reglas nuevas cuelgan del envoltorio de Comunidad.
    const tail = recipesCss.slice(recipesCss.indexOf('Táctil (44 px) en el editor compartido'))
    for (const sel of tail.match(/^\.[^{]+\{/gm) ?? []) expect(sel.trim().startsWith('.community-recipe-fields'), sel).toBe(true)
  })

  it('ventana de denuncia: cuerpo con scroll y botones siempre visibles (pie fijo)', () => {
    expect(postCss).toMatch(/\.community-report \{[^}]*max-height: calc\(100dvh - 24px\);[^}]*overflow-y: auto;/)
    expect(postCss).toMatch(/\.community-report \.community-report-actions \{\s*position: sticky;\s*bottom: -20px;/)
  })

  it('final de página con hueco para el menú inferior; el formulario de comentar ya no es fijo, así que el botón «↑» no necesita subir', () => {
    expect(baseCss).toMatch(/\.community-screen \{\s*padding-bottom: calc\(96px/)
    expect(baseCss).not.toContain('body:has(.community-composer) .scroll-top-fab')
  })
})
