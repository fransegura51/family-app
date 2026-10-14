import { Fragment, type ReactNode } from 'react'
import { parseRichText, type Block, type Inline } from '@/domain/communityRichText'

// Pinta el texto enriquecido de Comunidad como elementos de React (NUNCA como HTML): negrita, cursiva, listas y enlaces. Todos los enlaces llevan fuera de PEPA:
// se marcan como «sitio externo» (con el nombre del sitio), se abren en otra pestaña con rel="noopener noreferrer nofollow ugc" y los acortadores se avisan.
function renderInline(items: Inline[], keyPrefix = 'i'): ReactNode[] {
  return items.map((item, i) => {
    const key = `${keyPrefix}-${i}`
    switch (item.t) {
      case 'text':
        return <Fragment key={key}>{item.v}</Fragment>
      case 'bold':
        return <strong key={key}>{renderInline(item.c, key)}</strong>
      case 'italic':
        return <em key={key}>{renderInline(item.c, key)}</em>
      case 'link':
        return (
          <a
            key={key}
            className="community-external-link"
            href={item.href}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            title={`Abre un sitio externo: ${item.host}`}
          >
            {item.label}
            <span className="community-external-hint">
              {' '}
              ↗ {item.host}
              {item.shortener ? ' (enlace acortado: no se ve a dónde lleva)' : ''}
            </span>
          </a>
        )
    }
  })
}

function renderBlock(block: Block, i: number): ReactNode {
  if (block.t === 'p') return <p key={i}>{renderInline(block.c, `p${i}`)}</p>
  const Tag = block.t === 'ul' ? 'ul' : 'ol'
  return (
    <Tag key={i}>
      {block.items.map((it, j) => (
        <li key={j}>{renderInline(it, `l${i}-${j}`)}</li>
      ))}
    </Tag>
  )
}

export function CommunityRichText({ text, className }: { text: string; className?: string }) {
  const blocks = parseRichText(text)
  return <div className={'community-richtext' + (className ? ` ${className}` : '')}>{blocks.map(renderBlock)}</div>
}
