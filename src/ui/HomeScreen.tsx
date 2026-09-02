import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { FamilyMember, GalleryPhoto, Profile } from '@/domain/types'
import { getPermissionState, requestPermission, subscribeToPush } from '@/services/notifications'
import { savePushSubscription } from '@/data/push'
import { getGalleryPhotoUrl, listGalleryPhotos } from '@/data/gallery'
import { listFamilyMembers } from '@/data/family'
import { MemberAvatar } from '@/ui/MemberAvatar'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

// "¿Qué tenemos hoy?" — punto de entrada de la app (Skill 02). Cada bloque
// es hoy un placeholder: se conectará a calendario/tareas/compras según
// avancen las fases 1-6.
export function HomeScreen({ profile }: { profile: Profile }) {
  const [self, setSelf] = useState<FamilyMember | null>(null)

  useEffect(() => {
    listFamilyMembers()
      .then((members) => setSelf(members.find((m) => m.linkedProfileId === profile.id) ?? null))
      .catch(() => {})
  }, [profile.id])

  return (
    <div className="screen">
      <h1>¿Qué tenemos hoy?</h1>
      <p className="muted home-greeting">
        {self && <MemberAvatar member={self} size={28} />}
        Hola, {profile.displayName}
      </p>

      <PhotoBanner />

      <NotificationsBanner />

      <div className="card-grid">
        <HomeCard title="Familia" body="Miembros y perfiles" to="/familia" icon="👨‍👩‍👧‍👦" color="#ffe3d6" />
        <HomeCard title="Calendario" body="Eventos de hoy" to="/calendario" icon="📅" color="#dbeafe" />
        <HomeCard title="Tareas" body="Pendientes de hoy" to="/tareas" icon="✅" color="#dcfce7" />
        <HomeCard title="Próxima compra" body="Lista actual" to="/compras" icon="🛒" color="#fef3c7" />
        <HomeCard title="Alimentación" body="Menú, registro y peso" to="/alimentacion" icon="🍎" color="#d1fae5" />
        <HomeCard title="Dinero" body="Resumen del mes" to="/dinero" icon="💶" color="#dcfce7" />
        <HomeCard title="Ubicación y avisos" body="Opcional, desactivado por defecto" to="/ubicacion" icon="📍" color="#e0e7ff" />
        <HomeCard title="Cumpleaños" body="Próximos en la familia" to="/cumpleanos" icon="🎂" color="#fed7aa" />
        <HomeCard title="Contactos" body="Colegio, médico, emergencias" to="/contactos" icon="📇" color="#ede9fe" />
        <HomeCard title="Galería" body="Fotos de la familia" to="/galeria" icon="📷" color="#fef9c3" />
        <HomeCard title="Documentos" body="Por cada miembro" to="/documentos" icon="📁" color="#dbeafe" />
      </div>
    </div>
  )
}

// "Foto de portada" en la pantalla de inicio, al estilo de otras apps
// familiares (captura de referencia de la usuaria) — las últimas fotos
// de la Galería (ya existente, mismo almacenamiento) rotando solas, con
// puntitos abajo. Toda la tarjeta lleva a la Galería, que es donde ya
// se puede subir/borrar — no hace falta duplicar ese formulario aquí.
function PhotoBanner() {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listGalleryPhotos()
      .then(async (list) => {
        const recent = list.slice(0, 6)
        setPhotos(recent)
        const entries = await Promise.all(
          recent.map(async (p) => [p.id, await getGalleryPhotoUrl(p.storagePath)] as const),
        )
        setUrls(Object.fromEntries(entries))
      })
      .catch(() => {
        // Sin fotos o sin permiso: se enseña el estado vacío, no hace
        // falta un error visible en la portada por esto.
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (photos.length < 2) return
    const timer = setInterval(() => setIndex((i) => (i + 1) % photos.length), 4500)
    return () => clearInterval(timer)
  }, [photos.length])

  if (loading) return null

  if (photos.length === 0) {
    return (
      <Link to="/galeria" className="home-photo-banner home-photo-banner-empty">
        <div className="home-photo-banner-overlay">
          <p className="home-photo-banner-title">📷 Sube fotos de la familia</p>
          <p className="home-photo-banner-sub">Toca aquí para añadir la primera</p>
        </div>
      </Link>
    )
  }

  const current = photos[index]
  const url = urls[current.id]

  return (
    <Link to="/galeria" className="home-photo-banner">
      {url && <img src={url} alt={current.caption ?? ''} className="home-photo-banner-img" />}
      <div className="home-photo-banner-overlay">
        <p className="home-photo-banner-title">📷 {current.caption || 'Fotos de la familia'}</p>
      </div>
      {photos.length > 1 && (
        <div className="home-photo-banner-dots">
          {photos.map((p, i) => (
            <span
              key={p.id}
              className={'home-photo-banner-dot' + (i === index ? ' home-photo-banner-dot-active' : '')}
            />
          ))}
        </div>
      )}
    </Link>
  )
}

function NotificationsBanner() {
  const [state, setState] = useState(getPermissionState())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (state !== 'default') return null

  async function activate() {
    setLoading(true)
    setError(null)
    try {
      const permission = await requestPermission()
      setState(permission)
      if (permission === 'granted' && VAPID_PUBLIC_KEY) {
        const subscription = await subscribeToPush(VAPID_PUBLIC_KEY)
        if (subscription) await savePushSubscription(subscription)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron activar los recordatorios')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card banner">
      <p>
        Activa las notificaciones para recibir los recordatorios del calendario, incluso con la
        app cerrada.
      </p>
      {error && <p className="error">{error}</p>}
      <button type="button" onClick={activate} disabled={loading}>
        {loading ? 'Activando…' : 'Activar recordatorios'}
      </button>
    </div>
  )
}

function HomeCard({
  title,
  body,
  to,
  icon,
  color,
}: {
  title: string
  body: string
  to?: string
  icon: string
  color: string
}) {
  const content = (
    <div className="card home-card">
      <div>
        <h2>{title}</h2>
        <p className="muted">{body}</p>
      </div>
      <span className="home-card-icon" style={{ background: color }}>
        {icon}
      </span>
    </div>
  )
  return to ? (
    <Link to={to} className="card-link">
      {content}
    </Link>
  ) : (
    content
  )
}
