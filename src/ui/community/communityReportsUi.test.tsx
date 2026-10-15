// Denunciar reseñas (orden 2.2), denunciar sin poder participar (3) y denuncias de visitantes en el Centro de Mando (2.4): estructura que se ve
// (renderToStaticMarkup: sin navegador ni red, los efectos no se ejecutan) y reglas que solo se comprueban leyendo el código fuente.
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecipeReview } from '@/domain/community'
import { toReportGroups, toVisitorReports } from '@/domain/communityAdmin'
import reviewsSrc from '@/ui/community/recipes/RecipeRatingBox.tsx?raw'
import panelSrc from '@/ui/community/recipes/RecipePanel.tsx?raw'
import dialogSrc from '@/ui/community/ReportDialog.tsx?raw'
import wrapperSrc from '@/ui/community/ReportContentDialog.tsx?raw'
import actionsSrc from '@/ui/community/PostActions.tsx?raw'
import commentsSrc from '@/ui/community/CommentsSection.tsx?raw'
import visitorsSrc from '@/ui/community/admin/ModerationVisitorReports.tsx?raw'
import reportsSrc from '@/ui/community/admin/ModerationReports.tsx?raw'
import tabSrc from '@/ui/community/admin/ModerationTab.tsx?raw'
import sharedSrc from '@/ui/community/admin/AdminShared.tsx?raw'

vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))

// Quién mira: cada prueba cambia estos valores.
const who = {
  me: { hasProfile: true, rulesAccepted: true, banState: 'ok' } as { hasProfile: boolean; rulesAccepted?: boolean; banState?: string } | null,
  canParticipate: true,
}
vi.mock('@/ui/community/CommunityProvider', () => ({
  useCommunity: () => ({
    status: { launched: true, visible: true, isAdmin: true },
    me: who.me,
    loading: false,
    refresh: async () => undefined,
    requireParticipation: async () => true,
    canParticipate: who.canParticipate,
  }),
}))

// El diálogo real se pinta igual, pero se apunta con qué propiedades lo monta el envoltorio.
const captured: { type: string; id: string; channel?: string }[] = []
vi.mock('@/ui/community/ReportDialog', async () => {
  const actual = await vi.importActual<typeof import('@/ui/community/ReportDialog')>('@/ui/community/ReportDialog')
  return {
    ...actual,
    ReportDialog: (p: Parameters<typeof actual.ReportDialog>[0]) => {
      captured.push({ type: p.type, id: p.id, channel: p.channel })
      return actual.ReportDialog(p)
    },
  }
})

const { ReportDialog } = await import('@/ui/community/ReportDialog')
const { ReportContentDialog } = await import('@/ui/community/ReportContentDialog')
const { RecipeRatingBox, ReviewReportControl } = await import('@/ui/community/recipes/RecipeRatingBox')
const { VisitorReportCard } = await import('@/ui/community/admin/ModerationVisitorReports')
const { ReportGroupCard } = await import('@/ui/community/admin/ModerationReports')
const { ModerationTab } = await import('@/ui/community/admin/ModerationTab')
const { NoteForm } = await import('@/ui/community/admin/AdminShared')
const { OverviewTab } = await import('@/ui/community/admin/OverviewTab')
const { toAdminOverview } = await import('@/domain/communityAdmin')

const noop = () => undefined
const render = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>)

const ID = '3f2b1c9e-8a44-4d3a-9b7e-1c2d3e4f5a6b'
const POST = '99999999-4444-4555-8666-aaaaaaaaaaaa'
const REASONS = ['Spam o publicidad', 'Acoso o faltas de respeto', 'Violencia', 'Contenido sexual', 'Algo ilegal', 'Datos privados de alguien', 'Información engañosa', 'Otro motivo']

beforeEach(() => {
  captured.length = 0
  who.me = { hasProfile: true, rulesAccepted: true, banState: 'ok' }
  who.canParticipate = true
})

describe('diálogo de denuncia con reseñas', () => {
  it('«Denunciar esta reseña» con los mismos motivos y un detalle opcional, y no se envía sin motivo', () => {
    const html = render(<ReportDialog type="review" id={ID} onClose={noop} />)
    expect(html).toContain('Denunciar esta reseña')
    for (const label of REASONS) expect(html).toContain(label)
    expect(html).toContain('Detalle (opcional)')
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('Nadie sabrá que has sido tú')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Enviar denuncia/)
  })

  it('sigue valiendo para publicaciones y comentarios', () => {
    expect(render(<ReportDialog type="post" id={ID} onClose={noop} />)).toContain('Denunciar esta publicación')
    expect(render(<ReportDialog type="comment" id={ID} onClose={noop} channel="visitor" />)).toContain('Denunciar este comentario')
  })

  it('código: miembro → community_report; lector → aviso de visitante; gracias, quitar la oculta y aviso de ya denunciada', () => {
    expect(dialogSrc).toContain("channel === 'visitor'")
    expect(dialogSrc).toContain('visitorReport(type, id, reason, text)')
    expect(dialogSrc).toContain('reportContent(type, id, reason, text)')
    expect(dialogSrc).toContain('REPORT_DONE_TEXT')
    expect(dialogSrc).toContain('REPORT_ALREADY_TEXT')
    expect(dialogSrc).toContain('onReported?.(result)')
    expect(dialogSrc).toContain('communityErrorText(e)')
    expect(dialogSrc).not.toContain('dangerouslySetInnerHTML')
  })
})

describe('envoltorio ReportContentDialog: elige el camino del servidor', () => {
  it('quien puede participar y tiene alias usa la denuncia de miembro', () => {
    render(<ReportContentDialog type="review" id={ID} onClose={noop} />)
    expect(captured.at(-1)).toEqual({ type: 'review', id: ID, channel: 'member' })
  })

  it('permiso de solo lectura → aviso de lector', () => {
    who.canParticipate = false
    render(<ReportContentDialog type="post" id={ID} onClose={noop} />)
    expect(captured.at(-1)?.channel).toBe('visitor')
  })

  it('sin alias, con normas sin aceptar, sin perfil o expulsado/a → aviso de lector', () => {
    for (const me of [{ hasProfile: false }, { hasProfile: true, rulesAccepted: false }, null, { hasProfile: true, rulesAccepted: true, banState: 'banned' }]) {
      who.me = me
      render(<ReportContentDialog type="comment" id={ID} onClose={noop} />)
      expect(captured.at(-1)?.channel).toBe('visitor')
    }
  })

  it('la propiedad canParticipate fuerza el camino (pruebas)', () => {
    render(<ReportContentDialog type="post" id={ID} onClose={noop} canParticipate={false} />)
    expect(captured.at(-1)?.channel).toBe('visitor')
  })

  it('publicaciones, comentarios y reseñas usan el envoltorio y denunciar ya no exige participar', () => {
    expect(wrapperSrc).toContain('reportChannel(')
    expect(wrapperSrc).toContain('useCommunityAccess()')
    for (const src of [actionsSrc, commentsSrc, reviewsSrc]) {
      expect(src).toContain('ReportContentDialog')
      expect(src).not.toMatch(/<ReportDialog\b/)
    }
    expect(actionsSrc).toMatch(/function startReport\(\) \{\s+setReporting\(true\)/)
    expect(commentsSrc).toMatch(/onReport: \(c\) => \{\s+setReportId\(c\.id\)/)
  })
})

describe('reseñas de una receta', () => {
  const review = (over: Partial<RecipeReview> = {}): RecipeReview => ({ id: ID, authorId: 'u1', authorAlias: 'Cocinillas', stars: 4, review: 'Muy rica', mine: false, ...over })

  it('«Denunciar» accesible en las reseñas ajenas con texto', () => {
    const html = render(<ReviewReportControl review={review()} reported={false} onReport={noop} />)
    expect(html).toContain('>Denunciar<')
    expect(html).toContain('aria-label="Denunciar la reseña de Cocinillas"')
    expect(html).toContain('type="button"')
    expect(html).toContain('community-review-report')
  })

  it('no sale en las propias, en las de solo estrellas ni en las de alguien bloqueado', () => {
    for (const r of [review({ mine: true }), review({ review: '' }), review({ review: null }), review({ id: undefined }), review({ blockedByMe: true })]) {
      expect(render(<ReviewReportControl review={r} reported={false} onReport={noop} />)).toBe('')
    }
  })

  it('tras denunciar, el botón se cambia por la confirmación', () => {
    const html = render(<ReviewReportControl review={review()} reported onReport={noop} />)
    expect(html).toContain('Denunciada. La administración la revisará.')
    expect(html).toContain('role="status"')
    expect(html).not.toContain('<button')
  })

  it('el botón dispara onReport con el id de la reseña', () => {
    const calls: string[] = []
    const el = ReviewReportControl({ review: review(), reported: false, onReport: (id) => calls.push(id) }) as { props: { onClick: () => void } } | null
    el?.props.onClick()
    expect(calls).toEqual([ID])
  })

  it('la lista pide el diálogo de tipo reseña, quita la reseña si el servidor la oculta y no repite el botón', () => {
    expect(reviewsSrc).toContain('<ReportContentDialog')
    expect(reviewsSrc).toContain('type="review"')
    expect(reviewsSrc).toContain('if (result.hidden) setItems(')
    expect(reviewsSrc).toContain('<ReviewReportControl')
    expect(reviewsSrc).toContain('reported={!!r.id && reported.includes(r.id)}')
  })

  it('la autora ve el aviso de reseña oculta con sus estrellas conservadas', () => {
    const summary = { avgRating: 4, ratingCount: 3, myRating: 5, myReview: 'Me encantó', myReviewHidden: true }
    const html = render(<RecipeRatingBox recipeId={ID} summary={summary} canRate onChanged={noop} />)
    expect(html).toContain('Tu reseña está oculta por moderación; las estrellas se conservan.')
    expect(html).toContain('role="note"')
    // Sin ocultar, el aviso no sale; tampoco si no tiene texto de reseña.
    expect(render(<RecipeRatingBox recipeId={ID} summary={{ ...summary, myReviewHidden: false }} canRate onChanged={noop} />)).not.toContain('oculta por moderación')
    expect(render(<RecipeRatingBox recipeId={ID} summary={{ ...summary, myReview: null }} canRate onChanged={noop} />)).not.toContain('oculta por moderación')
  })

  it('el aviso llega desde la ficha (my_review_hidden) y se conserva al cambiar la valoración', () => {
    expect(panelSrc).toContain('myReviewHidden: recipe.myReviewHidden === true')
    expect(reviewsSrc).toContain('myReviewHidden: summary.myReviewHidden === true')
  })
})

describe('Centro de Mando: reseñas denunciadas', () => {
  const group = (over: Record<string, unknown> = {}) =>
    toReportGroups([
      {
        targetType: 'review',
        targetId: ID,
        reportCount: 2,
        reasons: ['spam'],
        status: 'open',
        firstAt: '2026-10-15T08:00:00Z',
        lastAt: '2026-10-15T09:00:00Z',
        content: { excerpt: 'Compra mi producto', stars: 2, status: 'published', authorId: 'a1', authorAlias: 'Spamer', postId: POST },
        ...over,
      },
    ])[0]

  it('etiqueta «Reseña», extracto, estrellas y enlace a la receta', () => {
    const html = render(<ReportGroupCard group={group()} onResolved={noop} />)
    expect(html).toContain('Reseña de Spamer')
    expect(html).toContain('Compra mi producto')
    expect(html).toContain('★★☆☆☆ (2 de 5)')
    expect(html).toContain('Ver la receta')
    expect(html).toContain(`/comunidad/p/${POST}`)
    for (const a of ['Sin acción', 'Ocultar', 'Advertir', 'Expulsar']) expect(html).toContain(a)
  })

  it('una reseña ya oculta no enseña enlace a la receta', () => {
    const html = render(<ReportGroupCard group={group({ content: { excerpt: 'x', stars: 1, status: 'hidden', authorAlias: 'A', postId: POST } })} onResolved={noop} />)
    expect(html).not.toContain('Ver la receta')
    expect(html).toContain('Oculto')
  })

  it('el detalle completo de una reseña se pinta como texto plano', () => {
    expect(reportsSrc).toContain("data.type === 'review'")
    expect(reportsSrc).toContain('cadm-plain')
    expect(reportsSrc).not.toContain('dangerouslySetInnerHTML')
  })
})

describe('Centro de Mando: Denuncias de visitantes', () => {
  const report = (over: Record<string, unknown> = {}) =>
    toVisitorReports([
      {
        id: ID,
        targetType: 'comment',
        targetId: POST,
        reason: 'acoso',
        detail: 'Insulta a otra persona',
        contact: 'persona@ejemplo.es',
        source: 'visitor',
        status: 'open',
        createdAt: '2026-10-15T08:00:00Z',
        content: { excerpt: 'Eres tonto', status: 'published', hidden: false, authorId: 'a1', authorAlias: 'Troll', postId: ID },
        ...over,
      },
    ])[0]

  it('es el segundo apartado de Moderación y lleva el texto fijo de que no oculta nada solo', () => {
    const html = render(<ModerationTab section="visitantes" onSection={noop} onChanged={noop} />)
    expect(html).toContain('Denuncias de visitantes')
    expect(html).toContain('nunca ocultan nada por sí solos')
    expect(html).toContain('Por revisar')
    expect(html).toContain('Ya resueltas')
    expect(html).toContain('aria-pressed="true"')
    expect(tabSrc).toContain("section === 'visitantes' && <VisitorReportsPanel")
    // Cada apartado carga solo al abrirse y de 20 en 20 (pide una de más para saber si hay otra página).
    expect(visitorsSrc).toContain('VISITOR_PAGE + 1')
    expect(visitorsSrc).toContain('Ver más denuncias')
  })

  it('la tarjeta enseña motivo, detalle, contacto como texto, origen, extracto y estado', () => {
    const html = render(<VisitorReportCard report={report()} onResolved={noop} />)
    expect(html).toContain('Comentario de Troll')
    expect(html).toContain('Acoso o faltas de respeto')
    expect(html).toContain('Insulta a otra persona')
    expect(html).toContain('persona@ejemplo.es')
    expect(html).toContain('Visitante (sin cuenta)')
    expect(html).toContain('Eres tonto')
    expect(html).toContain('Ahora mismo: Visible')
    // El contacto es SOLO texto: nunca un enlace ni un mailto.
    expect(html).not.toContain('mailto:')
    expect(html).not.toMatch(/<a [^>]*persona@ejemplo\.es/)
    expect(html).not.toMatch(/href="[^"]*persona@ejemplo/)
  })

  it('un contacto malicioso se pinta escapado', () => {
    const html = render(<VisitorReportCard report={report({ contact: '<img src=x onerror=alert(1)>', detail: '<script>alert(2)</script>' })} onResolved={noop} />)
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<script>alert')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('«lector sin alias» y «sin contacto»', () => {
    const html = render(<VisitorReportCard report={report({ source: 'reader', contact: null })} onResolved={noop} />)
    expect(html).toContain('Lector sin alias')
    expect(html).toContain('No ha dejado ningún contacto.')
  })

  it('las cinco acciones, y contenido ya oculto o inexistente', () => {
    const html = render(<VisitorReportCard report={report()} onResolved={noop} />)
    for (const a of ['Sin acción', 'Ocultar contenido', 'Advertir al autor', 'Expulsar', 'Otro']) expect(html).toContain(`>${a}<`)
    const hidden = render(<VisitorReportCard report={report({ content: { excerpt: 'x', status: 'hidden', hidden: true, authorId: 'a1', authorAlias: 'T' } })} onResolved={noop} />)
    expect(hidden).toContain('Contenido oculto')
    const gone = render(<VisitorReportCard report={report({ content: null })} onResolved={noop} />)
    expect(gone).toContain('El contenido ya no existe')
    expect(gone).not.toContain('>Expulsar<')
    expect(gone).toContain('>Otro<')
  })

  it('una reseña denunciada por un visitante enseña las estrellas y enlaza a la receta', () => {
    const html = render(<VisitorReportCard report={report({ targetType: 'review', content: { excerpt: 'Mala', stars: 1, status: 'published', hidden: false, authorId: 'a1', authorAlias: 'X', postId: POST } })} onResolved={noop} />)
    expect(html).toContain('Reseña de X')
    expect(html).toContain('★☆☆☆☆ (1 de 5)')
    expect(html).toContain('Ver la receta')
  })

  it('una denuncia resuelta enseña la decisión y su nota, sin botones', () => {
    const html = render(<VisitorReportCard report={report({ status: 'resolved', resolution: 'advertencia', resolutionNote: 'Primera vez', resolvedAt: '2026-10-15T09:00:00Z' })} onResolved={noop} />)
    expect(html).toContain('Resuelta: Autor/a advertido/a')
    expect(html).toContain('Nota: Primera vez')
    expect(html).not.toContain('Qué hacer con este aviso')
  })

  it('el formulario de decisión admite la casilla «Ocultar también el contenido» y la nota obligatoria', () => {
    const html = render(<NoteForm title="t" required confirmLabel="Ok" onSubmit={noop} onCancel={noop} extra={<label><input type="checkbox" /> Ocultar también el contenido</label>} />)
    expect(html).toContain('Ocultar también el contenido')
    expect(html).toContain('Motivo (obligatorio)')
    expect(sharedSrc).toContain('{extra}')
    expect(visitorsSrc).toContain('Ocultar también el contenido')
    expect(visitorsSrc).toContain('visitorHideValue(choice, hideAlso && !!c)')
    expect(visitorsSrc).toContain('adminResolveVisitorReport(report.id, choice.id, note || null, hide)')
    expect(visitorsSrc).not.toContain('dangerouslySetInnerHTML')
    expect(visitorsSrc).not.toContain('mailto:')
  })

  it('el resumen cuenta los avisos de visitantes y da acceso directo', () => {
    const overview = toAdminOverview({ openVisitorReports: 5, openReports: 1 })
    const html = render(<OverviewTab overview={overview} loading={false} error={null} onReload={noop} onGo={noop} />)
    expect(html).toContain('Denuncias de visitantes')
    expect(html).toContain('>5<')
  })
})
