import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getMedals } from '@/data/community'
import type { MedalInfo, MedalsView } from '@/domain/community'
import { communityErrorText } from '@/domain/communityErrors'
import {
  CONSTANCY_RULE_TEXT,
  constancyText,
  groupMedals,
  medalProgressLabel,
  medalProgressPercent,
  medalStatusText,
} from '@/domain/communityProfile'
import { Breadcrumbs } from '@/ui/community/Breadcrumbs'
import { pageCrumbs, paths } from '@/ui/community/communityNav'
import '@/ui/community/communityProfile.css'

// Medallas (sec. 11): 12 medallas permanentes en tres familias + el nivel de constancia actual. SIN rankings, tablas competitivas ni recompensas.
export function MedalsPage() {
  const [view, setView] = useState<MedalsView | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setView(await getMedals())
    } catch (e) {
      setError(communityErrorText(e))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <>
      <Breadcrumbs crumbs={pageCrumbs('Medallas')} />
      <h1>Mis medallas</h1>
      <p className="muted">Son un reconocimiento amable: no hay clasificaciones ni premios, y no compites con nadie.</p>
      {error && (
        <>
          <p className="error" role="alert">
            {error}
          </p>
          <button type="button" className="link-button" onClick={() => void load()}>
            Volver a intentarlo
          </button>
        </>
      )}
      {!error && view === undefined && (
        <p className="muted" role="status">
          Cargando medallas…
        </p>
      )}
      {!error && view === null && (
        <div className="card">
          <p>Todavía no tienes perfil en Comunidad, así que aún no hay medallas.</p>
          <p className="muted">Cuando publiques, comentes o valores una receta, empezarás a conseguirlas.</p>
          <Link to={paths.home} className="link-button">
            Ir a la portada de Comunidad
          </Link>
        </div>
      )}
      {view && <MedalsContent view={view} />}
    </>
  )
}

// Contenido de la pantalla (separado para poder probarlo sin red).
export function MedalsContent({ view }: { view: MedalsView }) {
  return (
    <>
      {view.suspended && (
        <p className="community-notice" role="status">
          Tus medallas no se muestran mientras tu acceso a Comunidad esté en pausa. Puedes seguir leyendo. <Link to={paths.myProfile}>Ver el motivo y qué puedes hacer</Link>
        </p>
      )}

      <section className="card" aria-labelledby="constancy-title">
        <h2 id="constancy-title">Tu constancia</h2>
        <p className="community-constancy-line">{view.suspended ? 'En pausa' : `🔥 ${constancyText(view.constancy)}`}</p>
        <p className="muted">{CONSTANCY_RULE_TEXT}</p>
        <p className="muted">Si pasas cuatro semanas sin participar, no tendrás nivel. Puedes volver cuando quieras: el nivel se recupera solo.</p>
      </section>

      {groupMedals(view.medals).map(({ family, medals }) => (
        <section key={family.id} aria-labelledby={`family-${family.id}`}>
          <h2 id={`family-${family.id}`}>
            {family.icon} {family.title}
          </h2>
          <ul className="community-medal-list">
            {medals.map((m) => (
              <MedalCard key={m.key} medal={m} />
            ))}
          </ul>
        </section>
      ))}
    </>
  )
}

function MedalCard({ medal }: { medal: MedalInfo }) {
  const percent = medalProgressPercent(medal.progress)
  const label = medalProgressLabel(medal.progress)
  return (
    <li className={'community-medal-card' + (medal.earned ? ' earned' : '')}>
      <span className="community-medal-icon" aria-hidden="true">
        {medal.earned ? '🏅' : '🔒'}
      </span>
      <div className="community-medal-text">
        <h3>{medal.name}</h3>
        <p>{medal.description}</p>
        <p className="community-medal-status">{medalStatusText(medal)}</p>
        {!medal.earned && medal.progress && medal.progress[1] > 0 && (
          <div className="community-progress" role="progressbar" aria-label={`Progreso de ${medal.name}: ${label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <div className="community-progress-fill" style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>
    </li>
  )
}
