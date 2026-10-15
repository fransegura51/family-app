import { useEffect, useRef, useState } from 'react'
import { communityPhotoUrl, removeCommunityPhoto, uploadCommunityPhoto } from '@/data/community'
import { MAX_POST_PHOTOS } from '@/domain/community'
import { communityErrorText } from '@/domain/communityErrors'
import { prepareCommunityPhoto } from '@/services/communityPhoto'
import '@/ui/community/communityEditor.css'

interface UploadItem {
  id: number
  name: string
  step: 'preparing' | 'uploading' | 'error'
  error?: string
}

// Fotos de una publicación (hasta MAX_POST_PHOTOS = 5). Cada foto se prepara en el dispositivo (JPEG de máximo 1600 px, sin datos de ubicación: ver
// services/communityPhoto.ts) y se sube a la carpeta de la persona. Se pueden previsualizar, reordenar (la primera es la portada) y quitar.
// Las fotos subidas que aún no están en un borrador o publicación guardados se borran del almacenamiento al quitarlas; las ya guardadas NO se tocan aquí (el
// servidor limpia las que dejan de usarse cuando se guardan los cambios).
export function PhotoPicker({
  value,
  onChange,
  ensureProfileId,
  persisted,
  disabled,
  onBusyChange,
}: {
  value: string[]
  onChange: (next: string[]) => void
  // Devuelve el id público de la persona (pidiéndole alias si aún no tiene) o null si cancela.
  ensureProfileId: () => Promise<string | null>
  persisted: ReadonlySet<string>
  disabled?: boolean
  onBusyChange?: (busy: boolean) => void
}) {
  const [items, setItems] = useState<UploadItem[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const valueRef = useRef(value)
  const nextId = useRef(1)
  const busy = items.some((i) => i.step !== 'error')

  useEffect(() => {
    valueRef.current = value
  }, [value])

  useEffect(() => {
    onBusyChange?.(busy)
  }, [busy, onBusyChange])

  function patch(id: number, p: Partial<UploadItem>) {
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...p } : i)))
  }

  async function addFiles(files: File[]) {
    setNotice(null)
    const room = MAX_POST_PHOTOS - valueRef.current.length
    if (room <= 0) {
      setNotice(`Ya tienes ${MAX_POST_PHOTOS} fotos, que es el máximo. Quita alguna para añadir otra.`)
      return
    }
    const chosen = files.slice(0, room)
    if (files.length > room) setNotice(`Solo caben ${MAX_POST_PHOTOS} fotos: se añaden las ${room} primeras.`)
    const profileId = await ensureProfileId()
    if (!profileId) return
    for (const file of chosen) {
      const id = nextId.current++
      setItems((list) => [...list, { id, name: file.name || 'foto', step: 'preparing' }])
      try {
        const blob = await prepareCommunityPhoto(file)
        patch(id, { step: 'uploading' })
        const path = await uploadCommunityPhoto(profileId, blob)
        if (valueRef.current.length >= MAX_POST_PHOTOS) {
          // Por si mientras tanto se llegó al máximo desde otro sitio: no se pasa de 5 y no se deja un archivo suelto.
          await removeCommunityPhoto(path)
          setItems((list) => list.filter((i) => i.id !== id))
          continue
        }
        const next = [...valueRef.current, path]
        valueRef.current = next
        onChange(next)
        setItems((list) => list.filter((i) => i.id !== id))
      } catch (e) {
        patch(id, { step: 'error', error: communityErrorText(e) })
      }
    }
  }

  function remove(index: number) {
    const path = value[index]
    const next = value.filter((_, i) => i !== index)
    valueRef.current = next
    onChange(next)
    setNotice(null)
    if (path && !persisted.has(path)) void removeCommunityPhoto(path)
  }

  function move(index: number, delta: -1 | 1) {
    const target = index + delta
    if (target < 0 || target >= value.length) return
    const next = [...value]
    ;[next[index], next[target]] = [next[target], next[index]]
    valueRef.current = next
    onChange(next)
  }

  const full = value.length >= MAX_POST_PHOTOS

  return (
    <fieldset className="ce-field ce-photos" disabled={disabled}>
      <legend className="ce-label">
        Fotos (opcional) · {value.length} de {MAX_POST_PHOTOS}
      </legend>
      <p className="muted ce-help">
        Hasta {MAX_POST_PHOTOS} fotos. La primera es la portada. Las fotos son públicas: no enseñes caras de menores, matrículas, direcciones ni documentos. Quitamos
        de la foto los datos ocultos (como la ubicación).
      </p>

      {value.length > 0 && (
        <ul className="ce-photo-list">
          {value.map((path, i) => (
            <li key={path} className="ce-photo">
              <img src={communityPhotoUrl(path)} alt={`Foto ${i + 1} de ${value.length}`} loading="lazy" decoding="async" />
              {i === 0 && <span className="ce-photo-cover">Portada</span>}
              <div className="ce-photo-actions">
                <button type="button" className="ce-icon-btn" aria-label={`Mover la foto ${i + 1} a la izquierda`} disabled={i === 0} onClick={() => move(i, -1)}>
                  ←
                </button>
                <button
                  type="button"
                  className="ce-icon-btn"
                  aria-label={`Mover la foto ${i + 1} a la derecha`}
                  disabled={i === value.length - 1}
                  onClick={() => move(i, 1)}
                >
                  →
                </button>
                <button type="button" className="ce-icon-btn ce-icon-btn-danger" aria-label={`Quitar la foto ${i + 1}`} onClick={() => remove(i)}>
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <ul className="ce-upload-list" aria-live="polite">
          {items.map((it) => (
            <li key={it.id} className={it.step === 'error' ? 'ce-upload error' : 'ce-upload'}>
              {it.step === 'error' ? (
                <>
                  <span role="alert">
                    {it.name}: {it.error}
                  </span>
                  <button type="button" className="link-button" onClick={() => setItems((list) => list.filter((x) => x.id !== it.id))}>
                    Entendido
                  </button>
                </>
              ) : (
                <>
                  <span>
                    {it.step === 'preparing' ? 'Preparando' : 'Subiendo'} {it.name}…
                  </span>
                  <progress aria-label={`${it.step === 'preparing' ? 'Preparando' : 'Subiendo'} ${it.name}`} />
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {notice && (
        <p className="muted" role="status">
          {notice}
        </p>
      )}

      <label className={'ce-btn ce-btn-secondary ce-file-btn' + (full || disabled ? ' disabled' : '')}>
        {full ? `Ya tienes ${MAX_POST_PHOTOS} fotos` : value.length > 0 ? '+ Añadir más fotos' : '+ Añadir fotos'}
        <input
          type="file"
          accept="image/*"
          multiple
          className="ce-visually-hidden"
          disabled={full || disabled}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            e.target.value = '' // para poder volver a elegir la misma foto
            if (files.length > 0) void addFiles(files)
          }}
        />
      </label>
    </fieldset>
  )
}
