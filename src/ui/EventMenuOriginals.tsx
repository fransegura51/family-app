import { useEffect, useState } from 'react'
import { getEventFoodDocumentUrl, listEventFoodDocuments } from '@/data/events'
import { errorMessage } from '@/domain/errorMessage'
import { documentAlias } from '@/domain/eventFoodDocumentAlias'
import type { EventFoodDocument } from '@/domain/types'

// Acceso al documento ORIGINAL (foto/PDF) del que salió el menú importado. Solo lee; abre una URL firmada temporal.
export function EventMenuOriginals({ eventId }: { eventId: string }) {
  const [docs, setDocs] = useState<EventFoodDocument[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listEventFoodDocuments(eventId)
      .then((list) => {
        if (!cancelled) setDocs(list)
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err, 'No se pudieron cargar los originales'))
      })
    return () => {
      cancelled = true
    }
  }, [eventId])

  if (error) return <p className="error">{error}</p>
  if (!docs || docs.length === 0) return null

  async function open(doc: EventFoodDocument) {
    setError(null)
    try {
      const url = await getEventFoodDocumentUrl(doc.storagePath)
      window.open(url, '_blank', 'noopener')
    } catch (err) {
      setError(errorMessage(err, 'No se pudo abrir el documento original'))
    }
  }

  // Plegado por defecto: una sola línea en la barra. Al desplegar aparecen los alias y se abre el original exacto.
  return (
    <details style={{ width: '100%', margin: '6px 0' }}>
      <summary className="muted" style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
        📎 Documentos originales ({docs.length})
      </summary>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginTop: 4 }}>
        {docs.map((doc, index) => (
          <button key={doc.id} type="button" className="link-button" onClick={() => void open(doc)} style={{ textAlign: 'left' }}>
            {documentAlias(index)}
          </button>
        ))}
        {error && <p className="error">{error}</p>}
      </div>
    </details>
  )
}
