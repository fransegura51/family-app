import { FormEvent, useEffect, useState } from 'react'
import { deleteGalleryPhoto, getGalleryPhotoUrl, listGalleryPhotos, uploadGalleryPhoto } from '@/data/gallery'
import { ConfirmIconButton } from '@/ui/ConfirmButton'
import type { GalleryPhoto } from '@/domain/types'
import galeriaHeaderImg from '@/assets/galeria/galeria-header.jpg'
import { errorMessage } from '@/domain/errorMessage'
import { fetchAsShareableFile, shareFiles } from '@/services/share'

// Petición real: "Galería: compartir una o varias fotos" — cada foto ya
// tiene su URL firmada cargada (reload la pide de golpe para toda la
// galería), así que compartir solo tiene que bajarla como archivo y
// pasarla al menú nativo. Sin soporte de compartir archivos (típico en
// ordenador) se abre en una pestaña nueva para guardarla a mano, igual
// que ya se hace al tocar la foto.
async function sharePhotos(photos: GalleryPhoto[], urls: Record<string, string>): Promise<boolean> {
  const files = await Promise.all(
    photos.map((p, i) => fetchAsShareableFile(urls[p.id], `foto-${i + 1}.jpg`, 'image/jpeg')),
  )
  const title = photos.length === 1 ? photos[0].caption ?? 'Foto' : `${photos.length} fotos`
  return shareFiles(files, { title })
}

export function GalleryScreen() {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleShareOne(p: GalleryPhoto) {
    try {
      const shared = await sharePhotos([p], urls)
      if (!shared) window.open(urls[p.id], '_blank')
    } catch (err) {
      setError(errorMessage(err, 'No se pudo compartir la foto'))
    }
  }

  async function handleShareSelected() {
    const chosen = photos.filter((p) => selectedIds.has(p.id))
    if (chosen.length === 0) return
    try {
      const shared = await sharePhotos(chosen, urls)
      if (!shared) setError('Tu navegador no permite compartir varias fotos a la vez — compártelas de una en una.')
      else {
        setSelecting(false)
        setSelectedIds(new Set())
      }
    } catch (err) {
      setError(errorMessage(err, 'No se pudo compartir'))
    }
  }

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
      setError(errorMessage(err, 'No se pudo borrar'))
    }
  }

  if (loading) return <div className="screen">Cargando galería…</div>

  return (
    <div className="screen">
      <div className="kitchen-header kitchen-header-familia">
        <img src={galeriaHeaderImg} alt="Galería" className="kitchen-header-img" />
      </div>
      {error && <p className="error">{error}</p>}
      <button
        type="button"
        className="link-button"
        style={{ marginBottom: 8 }}
        onClick={() => {
          setSelecting((v) => !v)
          setSelectedIds(new Set())
        }}
      >
        {selecting ? 'Cancelar selección' : '📤 Compartir varias'}
      </button>
      {selecting && selectedIds.size > 0 && (
        <button type="button" onClick={handleShareSelected} style={{ marginBottom: 8, marginLeft: 8 }}>
          📤 Compartir {selectedIds.size} foto{selectedIds.size === 1 ? '' : 's'}
        </button>
      )}
      <div className="gallery-grid">
        {photos.map((p) => (
          <div key={p.id} className="gallery-item">
            {urls[p.id] && <img src={urls[p.id]} alt={p.caption ?? ''} />}
            {selecting ? (
              <input
                type="checkbox"
                checked={selectedIds.has(p.id)}
                onChange={() => toggleSelected(p.id)}
                aria-label="Seleccionar foto"
                className="gallery-item-select"
              />
            ) : (
              <>
                <button
                  type="button"
                  className="gallery-item-share"
                  aria-label="Compartir foto"
                  onClick={() => handleShareOne(p)}
                >
                  📤
                </button>
                <ConfirmIconButton className="gallery-item-delete" ariaLabel="Borrar foto" onConfirm={() => handleDelete(p)} />
              </>
            )}
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
      setError(errorMessage(err, 'No se pudo subir la foto'))
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
