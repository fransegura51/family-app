import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PARTICIPATION_NEEDED_TITLE, READ_ONLY_HELP, READ_ONLY_SHORT, READ_ONLY_TITLE } from '@/domain/communityAccess'
import { paths } from '@/ui/community/communityNav'
import { useCommunityAccess } from '@/ui/community/useCommunityAccess'
import '@/ui/community/communityAccess.css'

// Avisos del permiso «solo lectura» (regla de 0277). Todos se apoyan en useCommunityAccess(): ninguno repite la lógica. Este archivo no importa el marco de
// Comunidad (CommunityLayout) para que el marco pueda usarlo sin dependencias circulares.

// Aviso fijo y discreto para quien tiene permiso solo de lectura, con la explicación a un toque.
export function ReadOnlyNoticeView() {
  return (
    <aside className="community-readonly-notice" role="note" aria-label={READ_ONLY_TITLE}>
      <p>
        <strong>{READ_ONLY_TITLE}.</strong> {READ_ONLY_SHORT}
      </p>
      <details>
        <summary>¿Qué significa?</summary>
        <p>{READ_ONLY_HELP}</p>
      </details>
    </aside>
  )
}

export function ReadOnlyNotice() {
  const { readOnly } = useCommunityAccess()
  return readOnly ? <ReadOnlyNoticeView /> : null
}

// Frase corta al lado de lo que no se puede hacer (p. ej. bajo una publicación, donde faltan «Me gusta» y comentar). Solo en solo lectura.
export function ReadOnlyHint({ children }: { children?: ReactNode }) {
  const { readOnly } = useCommunityAccess()
  if (!readOnly) return null
  return <p className="muted community-readonly-hint">{children ?? 'Solo lectura: para dar me gusta, guardar o comentar necesitas el permiso de participar.'}</p>
}

// Pantalla de una página que solo existe para quien puede participar (crear, borradores, guardados, medallas propias, ajustes y alias).
export function ParticipationNeeded() {
  return (
    <section className="community-unavailable" aria-labelledby="community-needs-title">
      <h1 id="community-needs-title">{PARTICIPATION_NEEDED_TITLE}</h1>
      <p>{READ_ONLY_HELP}</p>
      <Link to={paths.home} className="link-button">
        Volver a la portada de Comunidad
      </Link>
    </section>
  )
}

// Envuelve una ruta de escritura: con permiso solo de lectura enseña la explicación en vez de la pantalla (que no podría guardar nada).
export function ParticipationOnly({ children }: { children: ReactNode }) {
  const { canParticipate } = useCommunityAccess()
  return canParticipate ? <>{children}</> : <ParticipationNeeded />
}
