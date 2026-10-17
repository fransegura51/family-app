// Correcciones de avisos y carrusel de Inicio (17/10/2026): zona segura del panel de avisos en iPhone, campana compacta, detalle del aviso agrupado de tareas,
// orden del carrusel y su configuración. Se leen los fuentes y el CSS (estructura); el comportamiento real se comprobó además en el navegador y en la base.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import home from '@/ui/HomeScreen.tsx?raw'
import panel from '@/ui/NotificationPanel.tsx?raw'
import settingsForm from '@/ui/HomeCarouselSettings.tsx?raw'
import menuSettings from '@/ui/MenuSettingsScreen.tsx?raw'
import gallerySrc from '@/data/gallery.ts?raw'
import slideSrc from '@/data/communityHomeSlide.ts?raw'

const css = readFileSync(join(process.cwd(), 'src/ui/styles.css'), 'utf8')
const rule = (selector: string): string => {
  const start = css.indexOf(`\n${selector} {`)
  expect(start, `falta la regla ${selector}`).toBeGreaterThan(-1)
  return css.slice(start, css.indexOf('}', start) + 1)
}

describe('panel de avisos en iPhone: zona segura superior', () => {
  it('el panel deja sitio arriba para la barra del sistema (hora, cobertura, batería): título y X quedan por debajo', () => {
    expect(rule('.notification-panel')).toContain('padding: calc(12px + env(safe-area-inset-top, 0px)) 16px calc(24px + env(safe-area-inset-bottom, 0px))')
  })

  it('sin barra (Android, escritorio) env() vale 0 y queda el margen de siempre; el viewport ya usa viewport-fit=cover', () => {
    expect(readFileSync(join(process.cwd(), 'index.html'), 'utf8')).toContain('viewport-fit=cover')
  })

  it('título y X siguen en la misma fila y la X conserva su objetivo táctil de 44 px y su acción de cerrar', () => {
    expect(rule('.notification-panel-header')).toContain('align-items: center')
    expect(rule('.notification-close')).toContain('min-height: 44px')
    expect(panel).toContain('aria-label="Cerrar avisos">')
    expect(panel).toContain('onClick={onClose}')
  })
})

describe('campana compacta en la cabecera de Inicio', () => {
  it('va dentro de .home-header, a la derecha, sin fila propia', () => {
    const header = home.slice(home.indexOf('className="home-header"'), home.indexOf('<AttentionCard'))
    expect(header).toContain('<NotificationBell />')
    expect(rule('.home-bell-row')).toContain('align-self: flex-start')
    expect(rule('.home-header-text')).toContain('min-width: 0')
  })
})

describe('detalle del aviso agrupado de tareas', () => {
  it('abrir el resumen de tareas NO navega: abre un detalle dentro del panel con todas las tareas (título completo, fecha y asignadas)', () => {
    expect(panel).toContain('if (n.category === TASK_SUMMARY_CATEGORY) {')
    expect(panel).toContain('setDetail(n)')
    expect(panel).toContain('{t.title}')
    expect(panel).toContain('Fecha: {formatDate(t.date)}')
    expect(panel).toContain('Asignada a: {who}')
    expect(panel).toContain('summaryTaskLink(t)')
  })

  it('cada tarea abre Calendario (cierra el panel y navega por un enlace interno validado)', () => {
    const open = panel.slice(panel.indexOf('function openTask('), panel.indexOf('function renderGroup('))
    expect(open).toContain('safeInternalUrl(link)')
    expect(open).toContain('onClose()')
    expect(open).toContain('navigate(target)')
  })

  it('el detalle tiene dos formas de cerrarse (✕ y «Cerrar»), se desplaza con el panel y la lista conserva su estado', () => {
    expect(panel).toContain('aria-label="Cerrar el detalle y volver a los avisos"')
    expect(panel).toMatch(/className="notification-detail-close" onClick=\{\(\) => setDetail\(null\)\}>\s*Cerrar/)
    expect(panel).toContain('<div hidden={detail !== null}>')
    expect(rule('.notification-panel')).toContain('overflow-y: auto')
  })

  it('los avisos antiguos (sin listado) se explican sin inventar datos y llevan a Calendario', () => {
    expect(panel).toContain('Este aviso se envió antes de que PEPA guardara la lista completa')
    expect(panel).toContain('Abrir las tareas en Calendario')
    expect(panel).toContain('{n.body}')
  })

  it('el diálogo conserva un nombre accesible válido en las dos vistas (sin ids repetidos)', () => {
    expect(panel).toContain('aria-labelledby={detail ? `${titleId}-detail` : titleId}')
    expect(panel).toContain('<h2 id={`${titleId}-detail`}>{n.title}</h2>')
    expect(panel).toContain('<h2 id={titleId}>Avisos</h2>')
  })

  it('no toca la lógica de avisos: sigue marcando como leído al abrir y no crea ni borra nada', () => {
    const open = panel.slice(panel.indexOf('function openItem('), panel.indexOf('function openTask('))
    expect(open).toContain('markNotificationsRead([n.id])')
    expect(open).not.toMatch(/deleteNotifications|insert|create/)
  })

  it('el aviso nuevo guarda el listado completo en el servidor (migración 0280) sin tocar el cálculo de atrasadas', () => {
    const mig = readFileSync(join(process.cwd(), 'supabase/migrations/0280_daily_task_summary_payload.sql'), 'utf8')
    const old = readFileSync(join(process.cwd(), 'supabase/migrations/0262_daily_task_summary.sql'), 'utf8')
    expect(mig).toContain("'overdue', jsonb_build_object('count', v_over_n")
    expect(mig).toContain("'assigned', to_jsonb(assigned)")
    expect(mig).toContain("'daily:' || v_date::text, true, v_payload)")
    // El cálculo de pendientes/atrasadas (CTE «occ» y «pending») es el mismo texto que en 0262.
    const part = (sql: string) => sql.slice(sql.indexOf('      with cand as ('), sql.indexOf('      mine as ('))
    expect(part(mig)).toBe(part(old))
    expect(readFileSync(join(process.cwd(), 'supabase/rollbacks/0280_daily_task_summary_payload_down.sql'), 'utf8')).toContain('run_daily_task_summaries_at')
  })
})

describe('carrusel de Inicio', () => {
  it('las diapositivas salen en el orden de carouselSlideOrder (compra, calendario, comunidad, fotos) y no hay otra lista', () => {
    expect(home).toContain('const order = carouselSlideOrder(prefs, communityVisible)')
    expect(home).toContain('const slides: Slide[] = order.flatMap(')
    const flat = home.slice(home.indexOf('const slides: Slide[] = order.flatMap('), home.indexOf('useEffect(() => {\n    if (index >= slides.length)'))
    const at = (k: string) => flat.indexOf(`case '${k}':`)
    expect(at('compra')).toBeGreaterThan(-1)
    expect(at('compra')).toBeLessThan(at('agenda'))
    expect(at('agenda')).toBeLessThan(at('comunidad'))
    expect(at('comunidad')).toBeLessThan(at('fotos'))
  })

  it('las fotos solo vienen de la Galería PEPA (tabla gallery_photos y su almacén), nunca de la galería del teléfono', () => {
    expect(home).toContain("import { getGalleryPhotoUrls, listGalleryPhotos } from '@/data/gallery'")
    expect(home).not.toMatch(/type="file"|capacitor.*camera|Camera\./i)
    expect(settingsForm).toContain('listGalleryPhotos()')
    expect(settingsForm).not.toMatch(/type="file"/)
    expect(settingsForm).toContain('Solo salen fotos de tu Galería PEPA, no de la galería del teléfono.')
  })

  it('las firmas de las fotos se piden en UNA sola petición (createSignedUrls), no una por foto', () => {
    expect(gallerySrc).toContain('createSignedUrls(unique, 3600)')
    expect(home).toContain('getGalleryPhotoUrls(missing.map((p) => p.storagePath))')
    expect(home).not.toContain('getGalleryPhotoUrl(')
  })

  it('la diapositiva de Comunidad es texto con publicaciones reales: sin ilustraciones, con enlace a cada publicación y a Comunidad', () => {
    const block = home.slice(home.indexOf("if (current.kind === 'community') {"), home.indexOf("if (current.kind === 'gallery-info') {"))
    expect(block).not.toMatch(/<img|import .*\.(jpg|png|webp)/)
    expect(block).toContain('to={`/comunidad/p/${l.id}`}')
    expect(block).toContain('to="/comunidad"')
    expect(block).toContain('Todavía no hay publicaciones')
    expect(home).toContain('communityLines === null ? [] :')
  })

  it('Comunidad solo consulta con la diapositiva activa y Comunidad abierta; el resultado se recuerda 3 minutos y se borra al cambiar de persona', () => {
    expect(home).toContain("const wantsCommunity = order.includes('comunidad')")
    expect(home).toContain('if (!wantsCommunity) return')
    expect(slideSrc).toContain('const TTL_MS = 3 * 60 * 1000')
    expect(slideSrc.match(/listPosts\(/g)).toHaveLength(3)
    expect(readFileSync(join(process.cwd(), 'src/data/communityStatusCache.ts'), 'utf8')).toContain('clearCommunityHomeLines()')
  })

  it('con la Galería vacía sale una tarjeta informativa sencilla (que desaparece con la primera foto) sin dejar de enseñar las tres útiles', () => {
    expect(home).toContain('galleryOk && showEmptyGalleryCard(prefs, gallery.length)')
    expect(home).toContain('Cuando subáis imágenes a vuestra Galería PEPA, aquí podréis ver hasta cinco fotografías.')
  })

  it('la tarjeta «Comunidad PEPA» de la rejilla se conserva y es independiente de la del carrusel', () => {
    expect(home).toContain("id: 'comunidad',\n  title: 'Comunidad PEPA',")
    expect(home).toContain('{orderedCards.map((card, i) => (')
  })
})

describe('configuración del carrusel', () => {
  it('hay un engranaje en cada diapositiva que abre la configuración', () => {
    expect(home).toContain('aria-label="Configurar el carrusel de Inicio"')
    expect((home.match(/\{gear\}/g) ?? []).length).toBeGreaterThanOrEqual(5)
    expect(home).toContain('<HomeCarouselSettingsModal onClose={() => setCarouselSettingsOpen(false)} />')
  })

  it('el formulario permite activar el carrusel entero y cada parte, fotos al azar o fijas (hasta 5)', () => {
    for (const t of ['Mostrar el carrusel en Inicio', '🛒 Lista de la compra', '📅 Calendario', '🏡 Comunidad PEPA', '📷 Fotografías de la Galería PEPA', 'Al azar', 'Elegir hasta 5 fijas']) {
      expect(settingsForm, t).toContain(t)
    }
    expect(settingsForm).toContain("update({ photoMode: 'random' })")
    expect(settingsForm).toContain("update({ photoMode: 'fixed' })")
    expect(settingsForm).toContain('toggleFixedPhoto(chosen, p.id)')
  })

  it('Configuración general tiene el tema «Inicio» con la tarjeta «Carrusel de Inicio» (desde ahí se recupera si está oculto del todo)', () => {
    expect(menuSettings).toContain("import { HomeCarouselCard } from '@/ui/HomeCarouselSettings'")
    expect(menuSettings).toContain('<HomeCarouselCard />')
    expect(menuSettings).toContain("open={openGroup === 'inicio'}")
    expect(settingsForm).toContain('Está oculto. Márcalo para volver a verlo.')
  })

  it('con el carrusel oculto no se pinta (y no se piden fotos, compra ni calendario), y con todo desactivado queda una fila para reactivarlo', () => {
    expect(home).toContain('if (!prefs.enabled) return null')
    expect(home).toContain('⚙️ Carrusel de Inicio: no hay nada activado. Configurar')
    expect(home).toContain('if (!wantsPhotos) {')
    expect(home).toContain('if (!wantsShopping) return')
    expect(home).toContain('if (!wantsAgenda) return')
  })
})
