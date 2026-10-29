import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { Link, useInRouterContext } from 'react-router-dom'
import { resolvePostTitle } from '@/data/communityPostLinks'

// Enlace interno «[[Título]]» a otra publicación de Comunidad. Mientras se busca, y si no existe o la persona no puede verla, se enseña el título como texto normal
// (nunca un enlace roto). Dentro de PEPA: no se marca como sitio externo.
export function PostLink({ title }: { title: string }) {
  const inRouter = useInRouterContext()
  const [id, setId] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    resolvePostTitle(title)
      .then((r) => alive && setId(r))
      .catch(() => alive && setId(null))
    return () => {
      alive = false
    }
  }, [title])
  if (!id || !inRouter) return <>{title}</>
  return (
    <Link className="community-internal-link" to={`/comunidad/p/${id}`}>
      {title}
    </Link>
  )
}

// Texto corto (p. ej. el «Truco de Pepa» de una receta) donde SOLO se reconocen los enlaces «[[Título]]»; el resto se pinta tal cual, como texto.
export function TextWithPostLinks({ text }: { text: string }): ReactNode {
  const parts = text.split(/\[\[([^\]\n]{2,160})\]\]/g)
  return parts.map((part, i) => (i % 2 === 1 ? <PostLink key={i} title={part.trim()} /> : <Fragment key={i}>{part}</Fragment>))
}
