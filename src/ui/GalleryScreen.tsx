import { FormEvent, useEffect, useState } from 'react'
import { deleteGalleryPhoto, getGalleryPhotoUrl, listGalleryPhotos, uploadGalleryPhoto } from '@/data/gallery'
import { ConfirmIconButton } from '@/ui/ConfirmButton'
import type { GalleryPhoto } from '@/domain/types'

export function GalleryScreen() {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    setLoading(true)
    listGalleryPhotos()
      .then(async (list) => {
        setPhotos(list)
        const entries = await Promise.all(
          list.map(async (p) => [p.id, await getGalleryPhotoUrl(p.storagePath)] as const),
        )
        setUrls(Object.fromEntries(entries))
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  async function handleDelete(photo: GalleryPhoto) {
    try {
      await deleteGalleryPhoto(photo)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo borrar')
    }
  }

  if (loading) return <div className="screen">Cargando galería…</div>

  return (
    <div className="screen">
      <h1>Galería</h1>
      {error && <p className="error">{error}</p>}
      <div className="gallery-grid">
        {photos.map((p) => (
          <div key={p.id} className="gallery-item">
            {urls[p.id] && <img src={urls[p.id]} alt={p.caption ?? ''} />}
            <ConfirmIconButton className="gallery-item-delete" ariaLabel="Borrar foto" onConfirm={() => handleDelete(p)} />
            {p.caption && <p className="muted">{p.caption}</p>}
            <p className="muted gallery-item-date">
              {new Date(p.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
        ))}
        {photos.length === 0 && <p className="muted">No hay fotos todavía.</p>}
      </div>
      <AddPhotoForm onAdded={reload} />
    </div>
  )
}

function AddPhotoForm({ onAdded }: { onAdded: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!file) {
      setError('Elige una foto')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await uploadGalleryPhoto(file, caption)
      setFile(null)
      setCaption('')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir la foto')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      <h2>Subir foto</h2>
      <label>
        Foto
        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
      </label>
      <label>
        Descripción (opcional)
        <input type="text" value={caption} onChange={(e) => setCaption(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Subiendo…' : 'Subir'}
      </button>
    </form>
  )
}
