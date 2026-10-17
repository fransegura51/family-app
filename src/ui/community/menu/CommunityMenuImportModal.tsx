import { useEffect, useState } from 'react'
import { getPost, listPosts } from '@/data/community'
import type { PostCard, PostDetail } from '@/domain/community'
import { communityErrorText } from '@/domain/communityErrors'
import { formatLongDate } from '@/domain/communityPost'
import { parseMenu, type CommunityMenu } from '@/domain/communityMenu'
import { MenuImportSheet } from '@/ui/community/menu/MenuImportSheet'
import { useDialogFocus } from '@/ui/community/useDialogFocus'
import { MenuDietaryWarnings } from '@/ui/MenuDietaryWarnings'

// «📥 Importar menú de Comunidad» (La cocina de Pepa → Menú semanal): enseña los menús semanales publicados en Comunidad y, al elegir uno, abre el MISMO importador de siempre
// (MenuImportSheet: semana de destino, personas, días, comidas, cenas y recetas, y las protecciones y confirmaciones antes de tocar algo que ya está apuntado).
// No hay otro importador ni otro selector de raciones: aquí solo se elige el menú y se le pasa al que ya existe. Solo se ve si Comunidad está abierta para la persona.
const MENUS_LIMIT = 10

type Phase =
  | { step: 'list' }
  | { step: 'loading'; title: string }
  | { step: 'import'; postId: string; menu: CommunityMenu }

export function CommunityMenuImportModal({ onClose }: { onClose: (imported: boolean) => void }) {
  const dialogRef = useDialogFocus<HTMLDivElement>()
  const [menus, setMenus] = useState<PostCard[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>({ step: 'list' })

  useEffect(() => {
    let cancelled = false
    listPosts({ kind: 'menu', order: 'recientes', limit: MENUS_LIMIT }).then(
      (list) => {
        if (!cancelled) setMenus(list.filter((x): x is PostCard => !x.blockedByMe))
      },
      (e) => {
        if (!cancelled) setError(communityErrorText(e))
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  async function choose(item: PostCard) {
    setError(null)
    setPhase({ step: 'loading', title: item.title })
    try {
      const detail = (await getPost(item.id)) as PostDetail | null
      const menu = detail && 'menu' in detail ? parseMenu(detail.menu) : null
      if (!menu) {
        setError('El plan detallado de este menú no está disponible ahora mismo. Elige otro o vuelve a intentarlo más tarde.')
        setPhase({ step: 'list' })
        return
      }
      setPhase({ step: 'import', postId: item.id, menu })
    } catch (e) {
      setError(communityErrorText(e))
      setPhase({ step: 'list' })
    }
  }

  if (phase.step === 'import') {
    return (
      <MenuImportSheet
        postId={phase.postId}
        menu={phase.menu}
        initial={{ scope: 'week' }}
        initialServings={phase.menu.servings}
        renderWarnings={(items) => <MenuDietaryWarnings items={items} />}
        onClose={() => onClose(true)}
      />
    )
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={() => onClose(false)}>
      <div ref={dialogRef} className="modal-sheet" role="dialog" aria-modal="true" aria-label="Importar menú de Comunidad" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            📥 Importar menú de Comunidad
          </h2>
          <button type="button" className="modal-close" onClick={() => onClose(false)} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <p className="muted">Elige uno de los menús semanales publicados. Después podrás escoger la semana, las personas y qué importar, igual que desde la publicación.</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {menus === null && !error && (
          <p className="muted" role="status">
            Buscando los menús publicados…
          </p>
        )}
        {menus !== null && menus.length === 0 && <p className="muted">Todavía no hay menús semanales publicados en Comunidad.</p>}
        {phase.step === 'loading' && (
          <p className="muted" role="status">
            Abriendo «{phase.title}»…
          </p>
        )}
        {menus !== null && menus.length > 0 && (
          <ul className="community-menu-import-list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {menus.map((m) => (
              <li key={m.id}>
                <button type="button" className="recipe-list-row" style={{ width: '100%', minHeight: 56, textAlign: 'left' }} disabled={phase.step === 'loading'} onClick={() => void choose(m)}>
                  <span>
                    <strong>🍽️ {m.title}</strong>
                    <br />
                    <span className="muted" style={{ fontSize: 13 }}>
                      Publicado el {formatLongDate(m.createdAt)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
