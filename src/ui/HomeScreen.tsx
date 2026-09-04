import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { FamilyMember, GalleryPhoto, Profile } from '@/domain/types'
import { getPermissionState, requestPermission, subscribeToPush } from '@/services/notifications'
import { savePushSubscription } from '@/data/push'
import { getGalleryPhotoUrl, listGalleryPhotos } from '@/data/gallery'
import { listFamilyMembers } from '@/data/family'
import { listUpcomingEvents } from '@/data/calendar'
import { expandOccurrences } from '@/domain/calendar'
import { listShoppingItems } from '@/data/shopping'
import { MemberAvatar } from '@/ui/MemberAvatar'
import { ShoppingCartArt, TaskArt } from '@/ui/HomeSlideArt'
import { loadHomeCardOrder, saveHomeCardOrder } from '@/state/homeCardOrder'
import { CalendarOnboardingModal } from '@/ui/CalendarOnboardingModal'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

interface HomeCardDef {
  id: string
  title: string
  body: string
  to: string
  icon: string
  color: string
}

const HOME_CARDS: HomeCardDef[] = [
  { id: 'familia', title: 'Familia', body: 'Miembros y perfiles', to: '/familia', icon: '👨‍👩‍👧‍👦', color: '#ffe3d6' },
  { id: 'calendario', title: 'Calendario', body: 'Eventos de hoy', to: '/calendario', icon: '📅', color: '#dbeafe' },
  { id: 'puntos', title: 'Puntos', body: 'Recompensas de la familia', to: '/puntos', icon: '⭐', color: '#dcfce7' },
  { id: 'compras', title: 'Próxima compra', body: 'Lista actual', to: '/compras', icon: '🛒', color: '#fef3c7' },
  { id: 'alimentacion', title: 'Alimentación', body: 'Menú, registro y peso', to: '/alimentacion', icon: '🍎', color: '#d1fae5' },
  { id: 'dinero', title: 'Dinero', body: 'Resumen del mes', to: '/dinero', icon: '💶', color: '#dcfce7' },
  { id: 'ubicacion', title: 'Ubicación y avisos', body: 'Opcional, desactivado por defecto', to: '/ubicacion', icon: '📍', color: '#e0e7ff' },
  { id: 'cumpleanos', title: 'Cumpleaños', body: 'Próximos en la familia', to: '/cumpleanos', icon: '🎂', color: '#fed7aa' },
  { id: 'contactos', title: 'Contactos', body: 'Colegio, médico, emergencias', to: '/contactos', icon: '📇', color: '#ede9fe' },
  { id: 'galeria', title: 'Galería', body: 'Fotos de la familia', to: '/galeria', icon: '📷', color: '#fef9c3' },
  { id: 'documentos', title: 'Documentos', body: 'Por cada miembro', to: '/documentos', icon: '📁', color: '#dbeafe' },
]
const HOME_CARDS_BY_ID = new Map(HOME_CARDS.map((c) => [c.id, c]))

// Junta el orden guardado con las tarjetas que existan de verdad hoy —
// si se guardó un orden antes de añadir/quitar alguna tarjeta, las
// nuevas se añaden al final y las que ya no existen se ignoran, en vez
// de romperse.
function resolveOrder(saved: string[] | null): string[] {
  const allIds = HOME_CARDS.map((c) => c.id)
  if (!saved) return allIds
  const known = saved.filter((id) => HOME_CARDS_BY_ID.has(id))
  const missing = allIds.filter((id) => !known.includes(id))
  return [...known, ...missing]
}

// "¿Qué tenemos hoy?" — punto de entrada de la app (Skill 02).
export function HomeScreen({ profile }: { profile: Profile }) {
  const [self, setSelf] = useState<FamilyMember | null>(null)
  const [order, setOrder] = useState<string[]>(() => resolveOrder(loadHomeCardOrder()))
  const [organizing, setOrganizing] = useState(false)

  useEffect(() => {
    listFamilyMembers()
      .then((members) => setSelf(members.find((m) => m.linkedProfileId === profile.id) ?? null))
      .catch(() => {})
  }, [profile.id])

  function moveCard(id: string, direction: -1 | 1) {
    setOrder((prev) => {
      const index = prev.indexOf(id)
      const target = index + direction
      if (index === -1 || target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      saveHomeCardOrder(next)
      return next
    })
  }

  const orderedCards = order.map((id) => HOME_CARDS_BY_ID.get(id)).filter((c): c is HomeCardDef => !!c)

  return (
    <div className="screen">
      <CalendarOnboardingModal profileId={profile.id} />
      <h1>¿Qué tenemos hoy?</h1>
      <p className="muted home-greeting">
        {self && <MemberAvatar member={self} size={28} />}
        Hola, {profile.displayName}
      </p>

      <PhotoBanner />

      <NotificationsBanner />

      {/* Petición real: "quiero que se puedan organizar como yo quiera,
          que se puedan mover de sitio" — el orden es solo de este
          móvil (localStorage), cada uno puede querer el suyo. */}
      <button type="button" className="link-button" onClick={() => setOrganizing(!organizing)}>
        {organizing ? '✓ Listo' : '↕️ Organizar'}
      </button>

      <div className="card-grid">
        {orderedCards.map((card, i) => (
          <HomeCard
            key={card.id}
            title={card.title}
            body={card.body}
            to={organizing ? undefined : card.to}
            icon={card.icon}
            color={card.color}
            organizing={organizing}
            onMoveUp={i > 0 ? () => moveCard(card.id, -1) : undefined}
            onMoveDown={i < orderedCards.length - 1 ? () => moveCard(card.id, 1) : undefined}
          />
        ))}
      </div>
    </div>
  )
}

type Slide =
  | { kind: 'photo'; id: string; url: string; caption: string }
  | { kind: 'info'; id: string; to: string; icon: string; title: string; items: string[]; art: 'compra' | 'tarea' }

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

// "Foto de portada" en la pantalla de inicio, al estilo de otras apps
// familiares (captura de referencia de la usuaria) — rota sola, con
// puntitos abajo. Empieza con las últimas fotos de la Galería y, si hay
// algo que contar hoy, añade al final una "diapositiva" más con el
// mismo aspecto pero de texto en vez de foto: los eventos de hoy y la
// compra pendiente (petición real: "que pase la foto uno, la foto dos...
// y luego como si fuera una foto de lo que tenemos en el calendario
// para ese día" — y después, lo mismo con la lista de la compra). Cada
// diapositiva de texto lleva a su pantalla (Calendario/Compras), igual
// que las fotos llevan a Galería.
function PhotoBanner() {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [agendaItems, setAgendaItems] = useState<string[]>([])
  const [shoppingItems, setShoppingItems] = useState<string[]>([])
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

    const today = todayStr()
    listUpcomingEvents()
      .then((events) => {
        const items = events
          .filter((ev) => expandOccurrences(ev, today, today).includes(today))
          .map((ev) => ({ sortKey: ev.allDay ? '' : hhmm(ev.startAt), label: ev.allDay ? ev.title : `${hhmm(ev.startAt)} ${ev.title}` }))
          .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
          .map((e) => e.label)
        setAgendaItems(items)
      })
      .catch(() => {})

    listShoppingItems()
      .then((items) => {
        const pending = items
          .filter((i) => i.status === 'pendiente')
          .map((i) => (i.quantity ? `${i.quantity}${i.unit ? ' ' + i.unit : ''} ${i.name}` : i.name))
        setShoppingItems(pending)
      })
      .catch(() => {})
  }, [])

  const slides: Slide[] = [
    ...photos.map((p): Slide => ({ kind: 'photo', id: p.id, url: urls[p.id] ?? '', caption: p.caption || 'Fotos de la familia' })),
    ...(agendaItems.length > 0
      ? [{ kind: 'info', id: 'agenda', to: '/calendario', icon: '📅', title: 'Hoy en el calendario', items: agendaItems, art: 'tarea' } as const]
      : []),
    ...(shoppingItems.length > 0
      ? [{ kind: 'info', id: 'compra', to: '/compras', icon: '🛒', title: 'Compra pendiente', items: shoppingItems, art: 'compra' } as const]
      : []),
  ]

  useEffect(() => {
    if (index >= slides.length) setIndex(0)
  }, [slides.length, index])

  useEffect(() => {
    if (slides.length < 2) return
    const timer = setInterval(() => setIndex((i) => (i + 1) % slides.length), 4500)
    return () => clearInterval(timer)
  }, [slides.length])

  if (loading) return null

  if (slides.length === 0) {
    return (
      <Link to="/galeria" className="home-photo-banner home-photo-banner-empty">
        <div className="home-photo-banner-overlay">
          <p className="home-photo-banner-title">📷 Sube fotos de la familia</p>
          <p className="home-photo-banner-sub">Toca aquí para añadir la primera</p>
        </div>
      </Link>
    )
  }

  const current = slides[index] ?? slides[0]
  const dots = slides.length > 1 && (
    <div className="home-photo-banner-dots">
      {slides.map((s, i) => (
        <span key={s.id} className={'home-photo-banner-dot' + (i === index ? ' home-photo-banner-dot-active' : '')} />
      ))}
    </div>
  )

  if (current.kind === 'info') {
    return (
      <Link to={current.to} className="home-photo-banner">
        <div className="home-photo-banner-info">
          <div className="home-photo-banner-info-text">
            <p className="home-photo-banner-title">
              {current.icon} {current.title}
            </p>
            <ul className="home-photo-banner-info-list">
              {current.items.slice(0, 4).map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
            {current.items.length > 4 && <p className="home-photo-banner-sub">+{current.items.length - 4} más</p>}
          </div>
          <div className="home-photo-banner-info-art">{current.art === 'compra' ? <ShoppingCartArt /> : <TaskArt />}</div>
        </div>
        {dots}
      </Link>
    )
  }

  return (
    <Link to="/galeria" className="home-photo-banner">
      {current.url && <img src={current.url} alt={current.caption} className="home-photo-banner-img" />}
      <div className="home-photo-banner-overlay">
        <p className="home-photo-banner-title">📷 {current.caption}</p>
      </div>
      {dots}
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
  organizing,
  onMoveUp,
  onMoveDown,
}: {
  title: string
  body: string
  to?: string
  icon: string
  color: string
  organizing?: boolean
  onMoveUp?: () => void
  onMoveDown?: () => void
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
      {organizing && (
        <div className="home-card-move">
          <button
            type="button"
            className="link-button"
            onClick={onMoveUp}
            disabled={!onMoveUp}
            aria-label={`Mover ${title} antes`}
          >
            ◀
          </button>
          <button
            type="button"
            className="link-button"
            onClick={onMoveDown}
            disabled={!onMoveDown}
            aria-label={`Mover ${title} después`}
          >
            ▶
          </button>
        </div>
      )}
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
