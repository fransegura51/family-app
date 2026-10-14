import { Link } from 'react-router-dom'
import { COMMUNITY_RULES } from '@/domain/community'
import { Breadcrumbs } from '@/ui/community/Breadcrumbs'
import { pageCrumbs, paths } from '@/ui/community/communityNav'

// Normas de Comunidad (también se enseñan antes de la primera participación).
export function RulesPage() {
  return (
    <>
      <Breadcrumbs crumbs={pageCrumbs('Normas')} />
      <h1>Normas de Comunidad</h1>
      <ul className="community-rules">
        {COMMUNITY_RULES.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <p className="muted">
        Puedes denunciar cualquier publicación o comentario desde su menú y bloquear a una persona desde su perfil. Más información en la{' '}
        <a href={`${import.meta.env.BASE_URL}privacidad.html`}>política de privacidad</a> y en los <a href={`${import.meta.env.BASE_URL}terminos.html`}>términos de uso</a>.
      </p>
      <Link to={paths.home} className="link-button">
        Volver a la portada de Comunidad
      </Link>
    </>
  )
}
