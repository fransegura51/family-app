import { useId, useState, type KeyboardEvent } from 'react'
import { ADMIN_AREAS } from '@/admin/adminAreas'
import { searchAdminTools, type AdminTool } from '@/admin/adminTools'

// Buscador global de herramientas administrativas: escribe lo que buscas («token», «denuncias», «códigos de invitación»…) y al elegir un resultado el Centro abre el área, despliega
// el bloque que contiene la herramienta y la trae a la vista. No consulta al servidor: busca en el registro de herramientas (src/admin/adminTools.ts).
export function AdminSearch({ onPick }: { onPick: (tool: AdminTool) => void }) {
  const [query, setQuery] = useState('')
  const id = useId()
  const results = searchAdminTools(query).slice(0, 8)
  const searching = query.trim().length > 0

  const pick = (t: AdminTool) => {
    setQuery('')
    onPick(t)
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') setQuery('')
    if (e.key === 'Enter' && results[0]) {
      e.preventDefault()
      pick(results[0])
    }
  }

  return (
    <div className="admin-search" role="search">
      <label htmlFor={`${id}-q`}>
        Buscar una herramienta
        <input
          id={`${id}-q`}
          type="search"
          value={query}
          placeholder="Por ejemplo: token, denuncias, códigos de invitación…"
          autoComplete="off"
          aria-controls={searching ? `${id}-r` : undefined}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
        />
      </label>
      {searching && (
        <ul id={`${id}-r`} className="admin-search-results" aria-label="Resultados de la búsqueda">
          {results.length === 0 ? (
            <li className="muted" style={{ padding: 10 }} role="status">
              Ninguna herramienta coincide con «{query.trim()}».
            </li>
          ) : (
            results.map((t) => (
              <li key={t.id}>
                <button type="button" className="admin-search-result" onClick={() => pick(t)}>
                  <span>{t.label}</span>
                  <small>{ADMIN_AREAS.find((a) => a.id === t.area)?.label}</small>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
