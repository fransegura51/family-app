import { parseArticleSources, POLL_NOT_REPRESENTATIVE_NOTE } from '@/domain/communityPost'
import '@/ui/community/communityPost.css'

// Fuentes de un artículo oficial de investigación (Equipo PEPA): título, editorial, fecha y enlace externo (con aviso de que se sale de PEPA), más metodología y
// comparación si las hay. Siempre recuerda que las encuestas de PEPA no son muestras representativas. Los enlaces solo son http/https seguros.
export function ArticleSources({ raw }: { raw: unknown }) {
  const info = parseArticleSources(raw)
  return (
    <section className="community-sources card" aria-label="Fuentes del artículo">
      <h2>Fuentes</h2>
      {info.sources.length > 0 ? (
        <ul className="community-sources-list">
          {info.sources.map((s, i) => (
            <li key={i}>
              <strong>{s.title}</strong>
              <span className="muted">
                {s.publisher ? ` · ${s.publisher}` : ''}
                {s.date ? ` · ${s.date}` : ''}
              </span>
              {s.href && (
                <>
                  {' '}
                  <a className="community-external-link" href={s.href} target="_blank" rel="noopener noreferrer nofollow" title={`Abre un sitio externo: ${s.host}`}>
                    Ver la fuente
                    <span className="community-external-hint"> ↗ {s.host} (sitio externo)</span>
                  </a>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Este artículo no indica fuentes.</p>
      )}
      {info.methodology && (
        <>
          <h3>Cómo se ha hecho</h3>
          <p>{info.methodology}</p>
        </>
      )}
      {info.comparison && (
        <>
          <h3>Comparación</h3>
          <p>{info.comparison}</p>
        </>
      )}
      <p className="muted community-sources-note">{POLL_NOT_REPRESENTATIVE_NOTE}</p>
    </section>
  )
}
