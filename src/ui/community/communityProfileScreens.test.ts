// Estructura de las pantallas de perfil, ajustes, medallas y novedades: render real sin navegador (react-dom/server) para las piezas puras y lectura del
// código fuente para lo que depende del servidor (llamadas, orden de pasos, privacidad).
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import profileSrc from '@/ui/community/ProfilePage.tsx?raw'
import settingsSrc from '@/ui/community/MySettingsPage.tsx?raw'
import medalsSrc from '@/ui/community/MedalsPage.tsx?raw'
import newsSrc from '@/ui/community/NewsPage.tsx?raw'
import partsSrc from '@/ui/community/ProfileParts.tsx?raw'
import noticeSrc from '@/ui/community/CommunityNoticePrefs.tsx?raw'
import cardSrc from '@/ui/NotificationPrefsCard.tsx?raw'
import { DEFAULT_NOTIFICATION_PREFS } from '@/domain/notificationPrefs'
import notificationsDataSrc from '@/data/notifications.ts?raw'
import type { MedalInfo, MedalsView, NewsBreakdownItem } from '@/domain/community'

vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))

const { MedalsContent } = await import('@/ui/community/MedalsPage')
const { NewsList } = await import('@/ui/community/NewsPage')
const { CommunityNoticePrefs } = await import('@/ui/community/CommunityNoticePrefs')

function render(node: ReturnType<typeof createElement>): string {
  return renderToStaticMarkup(createElement(MemoryRouter, null, node))
}

// Las 12 medallas aprobadas (4 + 4 + 4) con el texto de requisito que manda el servidor.
function twelveMedals(): MedalInfo[] {
  const fam = ['cocina', 'participacion', 'ayuda'] as const
  const out: MedalInfo[] = []
  fam.forEach((family, fi) => {
    for (let i = 0; i < 4; i++) {
      out.push({
        key: `${family}-${i}`,
        family,
        name: `Medalla ${family} ${i}`,
        description: `Requisito de ${family} ${i}.`,
        earned: fi === 0 && i === 0,
        awardedAt: fi === 0 && i === 0 ? '2026-03-04T10:00:00Z' : null,
        progress: i === 1 ? [3, 5] : null,
      })
    }
  })
  return out
}

describe('Medallas: render', () => {
  const view: MedalsView = { medals: twelveMedals(), constancy: { level: 2, name: 'Visitante habitual', weeksActive: 2 }, suspended: false }
  const html = render(createElement(MedalsContent, { view }))

  it('enseña las 12 medallas en tres familias con su requisito', () => {
    expect(html).toContain('Cocina y recetas')
    expect(html).toContain('Participación')
    expect(html).toContain('Ayuda a la comunidad')
    expect((html.match(/community-medal-card/g) ?? []).length).toBe(12)
    expect(html).toContain('Requisito de ayuda 3.')
  })
  it('conseguida con fecha y no conseguida con barra de progreso accesible', () => {
    expect(html).toContain('Conseguida el 4 de marzo de 2026')
    expect(html).toContain('Llevas 3 de 5')
    expect(html).toContain('role="progressbar"')
    expect(html).toContain('aria-valuenow="60"')
  })
  it('enseña solo el nivel de constancia actual como logro y explica la regla de las últimas 4 semanas', () => {
    expect(html).toContain('Visitante habitual · 2 semanas activas de las últimas 4')
    expect(html).toContain('últimas 4 semanas')
    // SOLO el nivel actual: no se enseña la lista de los otros niveles.
    for (const other of ['De vuelta por PEPA', 'Siempre por aquí', 'Colaborador habitual']) expect(html).not.toContain(other)
    expect(html).not.toContain('community-constancy-rule')
  })
  it('sin rankings, clasificaciones competitivas ni recompensas', () => {
    expect(html).not.toMatch(/ranking|clasificación:|puntos|premio:|recompensa:/i)
  })
  it('suspendida: aviso claro y sin nivel', () => {
    const s = render(createElement(MedalsContent, { view: { ...view, suspended: true } }))
    expect(s).toContain('Tus medallas no se muestran mientras tu acceso a Comunidad esté en pausa')
    expect(s).toContain('En pausa')
  })
  it('sin nivel: dice que aparece al participar', () => {
    const n = render(createElement(MedalsContent, { view: { ...view, constancy: null } }))
    expect(n).toContain('no tienes nivel de constancia')
    expect(n).toContain('Participa una vez')
  })
  it('la página explica que no hay clasificaciones ni premios', () => {
    expect(medalsSrc).toContain('no hay clasificaciones ni premios')
    expect(medalsSrc).toContain("pageCrumbs('Medallas')")
  })
})

describe('Novedades: render y comportamiento', () => {
  const items: NewsBreakdownItem[] = [
    { postId: 'p1', title: 'Truco para la masa', count: 3, firstCommentId: 'c1' },
    { postId: 'p2', title: '¿Alguien conoce un buen flan?', count: 1, firstCommentId: 'c9' },
  ]
  it('desglose por conversación con contador y enlace a lo nuevo de ESA conversación', () => {
    const html = render(createElement(NewsList, { items }))
    expect(html).toContain('4 comentarios nuevos en 2 conversaciones')
    expect(html).toContain('3 comentarios nuevos')
    expect(html).toContain('1 comentario nuevo')
    expect(html).toContain('/comunidad/p/p1?nuevos=1&amp;c=c1')
    expect(html).toContain('/comunidad/p/p2?nuevos=1&amp;c=c9')
  })
  it('estado vacío amable', () => {
    const html = render(createElement(NewsList, { items: [] }))
    expect(html).toContain('Estás al día')
  })
  it('abrir el desglose NO marca nada como leído y se vuelve a pedir al mostrar la pantalla', () => {
    expect(newsSrc).not.toContain('markCommentsSeen')
    expect(newsSrc).toContain('newsBreakdown()')
    expect(newsSrc).toMatch(/useEffect\(\(\) => \{\s*void load\(\)\s*\}, \[load\]\)/)
    // Sin consultas periódicas.
    expect(newsSrc).not.toMatch(/setInterval|setTimeout/)
    expect(newsSrc).toContain("pageCrumbs('Novedades')")
    expect(newsSrc).toContain('paths.post(i.postId, { nuevos: true, comment: i.firstCommentId })')
  })
})

describe('Perfil público: privacidad y acciones', () => {
  it('usa getPublicProfile, listPosts del autor y getMedals de esa persona', () => {
    expect(profileSrc).toContain('getPublicProfile(id)')
    expect(profileSrc).toContain('author: profileId')
    expect(profileSrc).toContain('getMedals(id)')
    expect(profileSrc).toContain("pageCrumbs('Perfil')")
  })
  it('perfil no disponible y bloqueado por mí tienen su mensaje', () => {
    expect(profileSrc).toContain('Este perfil ya no está disponible')
    expect(profileSrc).toContain('Contenido de usuario bloqueado por ti')
    expect(profileSrc).toContain('Desbloquear')
  })
  it('seguir, bloquear y denunciar piden participar antes', () => {
    expect(profileSrc.match(/requireParticipation\(\)/g)?.length).toBeGreaterThanOrEqual(3)
    expect(profileSrc).toContain('followUser(id, DEFAULT_FOLLOW_MODE)')
    expect(profileSrc).toContain('blockUser(id)')
    expect(profileSrc).toContain('ConfirmDialog')
    expect(profileSrc).toContain('ReportUserDialog')
    expect(partsSrc).toContain("reportContent('user', profileId")
    expect(partsSrc).toContain('REPORT_REASONS')
  })
  it('nunca pinta datos privados ni usa HTML crudo', () => {
    for (const src of [profileSrc, settingsSrc, medalsSrc, newsSrc, partsSrc]) {
      expect(src).not.toContain('dangerouslySetInnerHTML')
      // Se ignoran los comentarios (que sí pueden nombrar lo que NO se enseña).
      const code = src.replace(/^\s*\/\/.*$/gm, '')
      // Se enseña el NÚMERO de seguidores (followerCount) pero nunca una lista de seguidores ni a quién sigue a quién.
      expect(code).not.toMatch(/familyId|family_id|realName|fullName|email|followers|listFollowers/i)
    }
  })
  it('los modos de aviso al seguir son los tres aprobados', () => {
    expect(profileSrc).toContain('FOLLOW_MODES')
  })
})

describe('Mi perfil y ajustes', () => {
  it('conecta todas las funciones del contrato de datos', () => {
    for (const fn of [
      'listPosts',
      'listFollowing',
      'followUser',
      'unfollowUser',
      'listBlocks',
      'unblockUser',
      'getFavoriteTopics',
      'setFavoriteTopics',
      'getCommunityUserPrefs',
      'setCommunityUserPrefs',
      'deleteMyCommunityContent',
      'requestContentRemoval',
      'requestReadmission',
    ]) {
      expect(settingsSrc, fn).toContain(`${fn}(`)
    }
    expect(settingsSrc).toContain('AliasDialog')
    expect(settingsSrc).toContain("pageCrumbs('Mi perfil')")
    expect(settingsSrc).toContain('paths.rules')
  })
  it('los avisos usan getNotificationPrefs/saveNotificationPrefs (franja y sugerencias)', () => {
    expect(settingsSrc).toContain('getNotificationPrefs()')
    expect(settingsSrc).toContain('saveNotificationPrefs(patch)')
    expect(noticeSrc).toContain('A cualquier hora')
    expect(noticeSrc).toContain('Establecer franja horaria')
    // El bloque es un componente compartido (Mi perfil y Familia).
    expect(settingsSrc).toContain('<CommunityNoticePrefs prefs={prefs} onSave={save} showZoneHint />')
    expect(noticeSrc).toContain('communitySuggestionEveryHours')
    expect(noticeSrc).toContain('communitySuggestionsEnabled')
    expect(noticeSrc).toContain('SUGGESTION_WINDOW_TEXT')
  })
  it('orden de comentarios y plegado son preferencias INDEPENDIENTES (solo se manda la que cambia)', () => {
    expect(settingsSrc).toContain('change({ commentOrder:')
    expect(settingsSrc).toContain('change({ foldReadComments:')
  })
  it('eliminar todo lo mío se hace en dos toques con confirmación', () => {
    expect(settingsSrc).toContain("setPhase('armed')")
    expect(settingsSrc).toContain('Toca otra vez para confirmar')
    expect(settingsSrc.indexOf('Toca otra vez para confirmar')).toBeLessThan(settingsSrc.indexOf('void eraseAll()'))
  })
  it('las solicitudes de eliminación muestran su estado persistente y permiten elegir un comentario propio', () => {
    expect(settingsSrc).toContain('listMyRemovalRequests()')
    expect(settingsSrc).toContain('listMyComments(30, offset)')
    expect(settingsSrc).toContain('removalStatusLabel(r.status)')
    expect(settingsSrc).toContain('r.handledNote')
    expect(settingsSrc).toContain("scope === 'specific' ? targetKind : null")
    expect(settingsSrc).toContain('Ver más comentarios')
  })
  it('cada bloque pide sus datos solo al abrirse (coste de Supabase)', () => {
    expect(settingsSrc).toContain('{seen && children}')
    expect(settingsSrc).not.toMatch(/setInterval/)
  })
})

describe('Ajustes de avisos (datos): sugerencias de Comunidad', () => {
  it('lee y guarda las dos columnas nuevas', () => {
    expect(notificationsDataSrc).toContain('community_suggestions_enabled')
    expect(notificationsDataSrc).toContain('community_suggestion_every_hours')
    expect(notificationsDataSrc).toContain('communitySuggestionsEnabled: row.community_suggestions_enabled')
    expect(notificationsDataSrc).toContain('row.community_suggestion_every_hours = patch.communitySuggestionEveryHours')
  })
})

describe('COM-144 en Familia → Horarios de tus avisos', () => {
  it('la tarjeta de Familia monta el bloque compartido solo si Comunidad es visible, preguntándolo una vez', () => {
    expect(cardSrc).toContain('<CommunityNoticePrefs prefs={prefs} onSave={save} />')
    expect(cardSrc).toContain('{communityVisible && (')
    // Visible Y con permiso de participar (regla de 0277): con solo lectura no hay avisos de Comunidad que ajustar.
    expect(cardSrc).toContain("setCommunityVisible(st.visible && accessFromStatus(st).level === 'participate')")
    expect(cardSrc.split('communityStatus().then(').length - 1).toBe(1)
    expect(cardSrc).not.toMatch(/setInterval|setTimeout/)
  })
  it('el componente compartido enseña franja, sugerencias y la regla 08:00-21:00', () => {
    const html = render(createElement(CommunityNoticePrefs, { prefs: { ...DEFAULT_NOTIFICATION_PREFS, personalCommunityMode: 'window' }, onSave: () => undefined }))
    expect(html).toContain('A cualquier hora')
    expect(html).toContain('Establecer franja horaria')
    expect(html).toContain('type="time"')
    expect(html).toContain('Una sugerencia cada (horas)')
    expect(html).toContain('entre las 08:00 y las 21:00')
    expect(html).not.toContain('href="/familia"')
  })
  it('en Mi perfil sí se explica dónde cambiar la zona horaria', () => {
    const html = render(createElement(CommunityNoticePrefs, { prefs: { ...DEFAULT_NOTIFICATION_PREFS }, onSave: () => undefined, showZoneHint: true }))
    expect(html).toContain('href="/familia"')
  })
})
