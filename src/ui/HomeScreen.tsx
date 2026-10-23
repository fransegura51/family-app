import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type TouchEvent } from 'react'
import { Link } from 'react-router-dom'
import type { FamilyMember, GalleryPhoto, Profile } from '@/domain/types'
import type { AttentionItem } from '@/domain/attention'
import { NotificationBell } from '@/ui/NotificationBell'
import { useCommunityVisible } from '@/ui/community/useCommunityVisible'
import { HomeCarouselSettingsModal } from '@/ui/HomeCarouselSettings'
import { carouselSlideOrder, pickCarouselPhotos, showEmptyGalleryCard, type CommunityCarouselLine } from '@/domain/homeCarousel'
import { useHomeCarouselPrefs } from '@/state/homeCarouselPrefs'
import { InviteFriendsButton } from '@/ui/InviteFriendsButton'
import { NotificationsOnboarding } from '@/ui/NotificationsOnboarding'
import { ReviewInviteCard } from '@/ui/ReviewInviteCard'
import { getGalleryPhotoUrls, listGalleryPhotos } from '@/data/gallery'
import { loadCommunityHomeLines, peekCommunityHomeLines } from '@/data/communityHomeSlide'
import { listFamilyMembers } from '@/data/family'
import { listUpcomingEvents } from '@/data/calendar'
import { expandOccurrences } from '@/domain/calendar'
import { listShoppingItems } from '@/data/shopping'
import { loadAllEventAlerts } from '@/data/events'
import { eventAlertsToAttentionItems } from '@/domain/events'
import { MemberAvatar } from '@/ui/MemberAvatar'
import { AttentionCard } from '@/ui/AttentionCard'
import { loadHomeCardOrder, saveHomeCardOrder } from '@/state/homeCardOrder'
import { CalendarOnboardingModal } from '@/ui/CalendarOnboardingModal'
import { NAV_TABS, navSectionId, NAV_SECTION_COLORS } from '@/domain/navTabs'
import pepaAvatar from '@/assets/pepa/pepa-avatar.jpg'
import shoppingListBg from '@/assets/home/shopping-list-background.jpg'
import agendaBg from '@/assets/home/agenda-background.jpg'
import { formatTime } from '@/domain/dateFormat'
import { usePrefChange } from '@/state/prefs/usePrefChange'

interface HomeCardDef {
  id: string
  title: string
  body: string
  to: string
  icon: string
  color: string
}

// El título, icono y ruta de cada tarjeta salen de navTabs.ts — la
// misma fuente que ya usan el menú ☰, Ayuda y "Organizar menú" — en
// vez de estar copiados a mano aquí también. Bug real encontrado por
// el usuario: se renombró "Alimentación" a "La cocina de Pepa" en
// navTabs.ts, pero esta pantalla seguía diciendo "Alimentación" porque
// tenía su propia copia del nombre, sin actualizar. Solo lo que de
// verdad es propio de esta pantalla (la frase corta) vive en este mapa
// — el color ya no se elige a mano por tarjeta (petición real: "las
// tarjetas... que sean de los colores del arcoíris y que no se repita
// ninguno" — dos colores coincidían de verdad, dinero/puntos en el
// mismo verde y calendario/documentos en el mismo azul).
const HOME_CARD_BODY: Record<string, string> = {
  familia: 'Miembros, peso y medidas',
  calendario: 'Eventos de hoy',
  eventos: 'Cumpleaños, comuniones y más',
  puntos: 'Aprender, jugar y soñar',
  compras: 'Lista actual',
  alimentacion: 'Menú y recetas',
  dinero: 'Resumen del mes',
  ubicacion: 'Opcional, desactivado por defecto',
  cumpleanos: 'Próximos en la familia',
  contactos: 'Colegio, médico, emergencias',
  galeria: 'Fotos de la familia',
  documentos: 'Por cada miembro',
}

const HOME_CARDS: HomeCardDef[] = NAV_TABS.filter((t) => t.to !== '/')
  .map((t) => {
    const id = navSectionId(t)
    const body = HOME_CARD_BODY[id]
    const color = NAV_SECTION_COLORS.get(id)
    return body && color ? { id, title: t.label, body, to: t.to, icon: t.icon, color } : null
  })
  .filter((c): c is HomeCardDef => c !== null)
const HOME_CARDS_BY_ID = new Map(HOME_CARDS.map((c) => [c.id, c]))

// Comunidad PEPA: tarjeta con el mismo formato que las demás secciones y su propio pastel (NAV_SECTION_COLORS, por índice: no cambia ninguno de los
// otros). Solo se enseña cuando Comunidad está abierta para esta persona (useCommunityVisible: ya incluye acceso por edad/permisos y el interruptor de
// lanzamiento) y entra en el mismo orden «Organizar» que el resto. No es una sección de la navegación inferior, por eso no sale de NAV_TABS.
const COMMUNITY_CARD: HomeCardDef = {
  id: 'comunidad',
  title: 'Comunidad PEPA',
  body: 'Recetas, consejos y más',
  to: '/comunidad',
  icon: '🏡',
  color: NAV_SECTION_COLORS.get('comunidad') ?? '#fde3d0',
}

// Junta el orden guardado con las tarjetas que existan de verdad hoy —
// si se guardó un orden antes de añadir/quitar alguna tarjeta, las
// nuevas se añaden al final y las que ya no existen se ignoran, en vez
// de romperse.
function resolveOrder(saved: string[] | null): string[] {
  const allIds = HOME_CARDS.map((c) => c.id)
  if (!saved) return allIds
  const known = saved.filter((id) => HOME_CARDS_BY_ID.has(id) || id === COMMUNITY_CARD.id)
  const missing = allIds.filter((id) => !known.includes(id))
  return [...known, ...missing]
}

// "¿Qué tenemos hoy?" — punto de entrada de la app (Skill 02).
export function HomeScreen({ profile }: { profile: Profile }) {
  const [self, setSelf] = useState<FamilyMember | null>(null)
  const [order, setOrder] = useState<string[]>(() => resolveOrder(loadHomeCardOrder()))
  usePrefChange('familyapp:home-card-order', () => setOrder(resolveOrder(loadHomeCardOrder())))
  const [organizing, setOrganizing] = useState(false)
  const [attentionItems, setAttentionItems] = useState<AttentionItem[]>([])
  // Ventana de configuración del carrusel (se abre con su engranaje).
  const [carouselSettingsOpen, setCarouselSettingsOpen] = useState(false)

  useEffect(() => {
    listFamilyMembers()
      .then((members) => setSelf(members.find((m) => m.linkedProfileId === profile.id) ?? null))
      .catch(() => {})
  }, [profile.id])

  // Fase 3 — "PEPA te avisa": hoy solo Eventos produce avisos, pero el
  // propio AttentionCard no sabe nada de Eventos (ver domain/attention.ts)
  // para que otros módulos puedan sumar los suyos después sin tocar
  // esta pantalla.
  useEffect(() => {
    loadAllEventAlerts()
      .then((alerts) => setAttentionItems(eventAlertsToAttentionItems(alerts)))
      .catch(() => {})
  }, [])

  // Tarjetas que se pintan hoy: las de siempre y, solo con Comunidad abierta para esta persona, la de Comunidad PEPA (en su sitio del orden guardado o, si
  // nunca se movió, al final).
  const communityVisible = useCommunityVisible() === true
  const cardsById = useMemo(
    () => (communityVisible ? new Map([...HOME_CARDS_BY_ID, [COMMUNITY_CARD.id, COMMUNITY_CARD]]) : HOME_CARDS_BY_ID),
    [communityVisible],
  )
  const shownIds = useMemo(() => {
    const known = order.filter((id) => cardsById.has(id))
    return [...known, ...[...cardsById.keys()].filter((id) => !known.includes(id))]
  }, [order, cardsById])

  function moveCard(id: string, direction: -1 | 1) {
    const index = shownIds.indexOf(id)
    const target = index + direction
    if (index === -1 || target < 0 || target >= shownIds.length) return
    const next = [...shownIds]
    ;[next[index], next[target]] = [next[target], next[index]]
    setOrder(next)
    saveHomeCardOrder(next)
  }

  const orderedCards = shownIds.map((id) => cardsById.get(id)).filter((c): c is HomeCardDef => !!c)

  return (
    <div className="screen">
      <CalendarOnboardingModal profileId={profile.id} />
      {/* Pepa, la protagonista de la app, junto al saludo — petición
          real: "al lado de qué tenemos hoy y hola Paco, ponme el
          círculo, el logo de Pepa, la foto de Pepa". "¿Qué tenemos
          hoy?" + "Hola, Paco" se sustituyen por "Hola, Paco" como
          título y "¿Cómo te puedo ayudar?" debajo (petición real). */}
      {/* Campana de avisos: solo en Inicio, compacta, en la esquina superior derecha DE LA CABECERA (a la altura del saludo), sin fila propia: no empuja
          el saludo ni el carrusel hacia abajo. */}
      <div className="home-header" data-help-id="inicio.cabecera">
        <img src={pepaAvatar} alt="Pepa" className="home-pepa-avatar" />
        <div className="home-header-text">
          <h1 className="home-greeting">
            {self && <MemberAvatar member={self} size={28} />}
            Hola, {profile.displayName}
          </h1>
          <p className="muted">¿Cómo te puedo ayudar?</p>
        </div>
        <NotificationBell />
      </div>

      <AttentionCard items={attentionItems} />

      <PhotoBanner onOpenSettings={() => setCarouselSettingsOpen(true)} />
      {carouselSettingsOpen && <HomeCarouselSettingsModal onClose={() => setCarouselSettingsOpen(false)} />}

      <InviteFriendsButton />

      <NotificationsOnboarding />

      <ReviewInviteCard />

      {/* Petición real: "quiero que se puedan organizar como yo quiera,
          que se puedan mover de sitio" — el orden es solo de este
          móvil (localStorage), cada uno puede querer el suyo. */}
      <button type="button" className="link-button" data-help-id="inicio.organizar" onClick={() => setOrganizing(!organizing)}>
        {organizing ? '✓ Listo' : '↕️ Organizar'}
      </button>

      <div className="card-grid" data-help-id="inicio.tarjetas">
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
  | { kind: 'info'; id: string; icon: string; title: string; items: string[]; art: 'compra' | 'tarea' }
  | { kind: 'community'; id: string; lines: CommunityCarouselLine[] }
  | { kind: 'gallery-info'; id: string }

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function hhmm(iso: string): string {
  return formatTime(iso)
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
function PhotoBanner({ onOpenSettings }: { onOpenSettings: () => void }) {
  // Configuración (por móvil, ver state/homeCarouselPrefs.ts): carrusel entero, cada diapositiva y fotos al azar o fijas. ORDEN OBLIGATORIO de las diapositivas:
  // Lista de la compra, Calendario, Comunidad PEPA y, al final, las fotografías de la Galería PEPA (hasta 5). Lo útil va antes que las fotos.
  const [prefs] = useHomeCarouselPrefs()
  const communityVisible = useCommunityVisible() === true
  const [gallery, setGallery] = useState<GalleryPhoto[]>([])
  // La tarjeta de «aún no hay fotos» solo sale cuando se HA podido leer la Galería y de verdad está vacía (no si falló la consulta).
  const [galleryOk, setGalleryOk] = useState(false)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [agendaItems, setAgendaItems] = useState<string[]>([])
  const [shoppingItems, setShoppingItems] = useState<string[]>([])
  // null = todavía no se sabe / no se pudo cargar (la diapositiva no sale); [] = Comunidad abierta pero sin publicaciones.
  const [communityLines, setCommunityLines] = useState<CommunityCarouselLine[] | null>(() => peekCommunityHomeLines())
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [paused, setPaused] = useState(false)
  // Petición real: "quiero también poder pasarlas con el dedo... o
  // pararlas con el dedo si quiero verla el tiempo que yo quiera...
  // ponerle el dedo encima y pararla, y si quiero pasarla, pasarla con
  // el dedo, y si no, que pase automática" — mientras el dedo esté
  // encima se para el pase (por poco o mucho que dure el toque), y si
  // al levantarlo hubo un deslizamiento horizontal claro, cambia de
  // foto; se retoma el pase automático en cuanto se levanta el dedo,
  // haya habido deslizamiento o no. En ratón (ordenador), lo mismo con
  // el botón pulsado en vez del dedo.
  //
  // OJO: useRef tiene que ir aquí arriba, antes de los `return`
  // condicionales de más abajo (loading / sin fotos) — bug real en
  // producción ("Minified React error #310"): un hook después de un
  // return condicional cambia cuántos hooks se llaman entre un
  // renderizado y otro, y React no lo permite.
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  const order = carouselSlideOrder(prefs, communityVisible)
  const wantsPhotos = order.includes('fotos')
  const wantsAgenda = order.includes('agenda')
  const wantsShopping = order.includes('compra')
  const wantsCommunity = order.includes('comunidad')

  // Fotos: solo de la Galería PEPA y solo si están activadas (una consulta de la lista; las direcciones de las elegidas, en UNA petición más).
  useEffect(() => {
    if (!wantsPhotos) {
      setLoading(false)
      return
    }
    listGalleryPhotos()
      .then((list) => {
        setGallery(list)
        setGalleryOk(true)
      })
      .catch(() => {
        // Sin fotos o sin permiso: se enseña la tarjeta informativa, no hace
        // falta un error visible en la portada por esto.
      })
      .finally(() => setLoading(false))
  }, [wantsPhotos])

  // Las que entran en el carrusel (hasta 5): al azar o las fijas elegidas. Se recalculan solo cuando cambia la Galería o la elección, no en cada pintado.
  const fixedKey = prefs.fixedPhotoIds.join(',')
  const photos = useMemo(
    () => pickCarouselPhotos(gallery, { ...prefs, photos: wantsPhotos }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gallery, wantsPhotos, prefs.photoMode, fixedKey],
  )
  useEffect(() => {
    const missing = photos.filter((p) => !urls[p.id])
    if (missing.length === 0) return
    getGalleryPhotoUrls(missing.map((p) => p.storagePath))
      .then((byPath) => setUrls((prev) => ({ ...prev, ...Object.fromEntries(missing.filter((p) => byPath[p.storagePath]).map((p) => [p.id, byPath[p.storagePath]])) })))
      .catch(() => {})
  }, [photos, urls])

  const today = todayStr()
  useEffect(() => {
    if (!wantsAgenda) return
    listUpcomingEvents()
      .then((events) => {
        const items = events
          .filter((ev) => expandOccurrences(ev, today, today).includes(today))
          .map((ev) => {
            // RETOQUE (Parte 10/37) — esta diapositiva no filtra por visibility (RLS ya se encarga: un
            // privado de OTRO miembro ni siquiera llega aquí); un privado PROPIO sí debe seguir viendo
            // Inicio, con el mismo 🔒 que el resto de vistas, no solo en Personal.
            const title = ev.visibility === 'private' ? `🔒 ${ev.title}` : ev.title
            return { sortKey: ev.allDay ? '' : hhmm(ev.startAt), label: ev.allDay ? title : `${hhmm(ev.startAt)} ${title}` }
          })
          .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
          .map((e) => e.label)
        setAgendaItems(items)
      })
      .catch(() => {})
  }, [wantsAgenda, today])

  useEffect(() => {
    if (!wantsShopping) return
    listShoppingItems()
      .then((items) => {
        const pending = items
          .filter((i) => i.status === 'pendiente')
          .map((i) => (i.quantity ? `${i.quantity}${i.unit ? ' ' + i.unit : ''} ${i.name}` : i.name))
        setShoppingItems(pending)
      })
      .catch(() => {})
  }, [wantsShopping])

  // Comunidad: tres consultas pequeñas (compartidas y recordadas 3 minutos, ver data/communityHomeSlide.ts), solo con Comunidad abierta para esta persona y la
  // diapositiva activada. Si falla, la diapositiva no sale (nunca se enseña nada inventado).
  useEffect(() => {
    if (!wantsCommunity) return
    let cancelled = false
    loadCommunityHomeLines().then(
      (lines) => {
        if (!cancelled) setCommunityLines(lines)
      },
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [wantsCommunity])

  // Petición real: "quiero esas dos diapositivas por defecto en todos
  // los usuarios" — antes solo aparecían si había algo pendiente/hoy;
  // ahora siempre están (si no se han desactivado), con su propio estado vacío si no
  // hay nada (ver "Sin nada pendiente todavía" / "Nada apuntado para hoy" en el
  // renderizado de cada diapositiva).
  const slides: Slide[] = order.flatMap((key): Slide[] => {
    switch (key) {
      case 'compra':
        return [{ kind: 'info', id: 'compra', icon: '🛒', title: 'Compra pendiente', items: shoppingItems, art: 'compra' }]
      case 'agenda':
        return [{ kind: 'info', id: 'agenda', icon: '📅', title: 'Hoy en el calendario', items: agendaItems, art: 'tarea' }]
      case 'comunidad':
        return communityLines === null ? [] : [{ kind: 'community', id: 'comunidad', lines: communityLines }]
      case 'fotos':
        // Familias sin fotos: una tarjeta informativa sencilla que desaparece con la primera foto de la Galería.
        return galleryOk && showEmptyGalleryCard(prefs, gallery.length)
          ? [{ kind: 'gallery-info', id: 'galeria-info' }]
          : photos.map((p): Slide => ({ kind: 'photo', id: p.id, url: urls[p.id] ?? '', caption: p.caption || 'Fotos de la familia' }))
    }
  })

  useEffect(() => {
    if (index >= slides.length) setIndex(0)
  }, [slides.length, index])

  useEffect(() => {
    if (slides.length < 2 || paused) return
    const timer = setInterval(() => setIndex((i) => (i + 1) % slides.length), 4500)
    return () => clearInterval(timer)
  }, [slides.length, paused])

  // Engranaje del carrusel: abre su configuración (qué diapositivas salen, fotos al azar o fijas). Pequeño, en la esquina de cada diapositiva.
  const gear = (
    <button type="button" className="home-carousel-gear" data-help-id="inicio.carrusel-ajustes" onClick={onOpenSettings} aria-label="Configurar el carrusel de Inicio">
      <span aria-hidden="true">⚙️</span>
    </button>
  )

  // Carrusel oculto del todo: no se enseña nada (se recupera desde Configuración → Carrusel de Inicio).
  if (!prefs.enabled) return null

  if (loading) return null

  // Todo desactivado pieza a pieza: una fila pequeña para poder volver a activarlo desde aquí mismo.
  if (order.length === 0) {
    return (
      <div className="home-carousel-off">
        <button type="button" className="link-button" onClick={onOpenSettings}>
          ⚙️ Carrusel de Inicio: no hay nada activado. Configurar
        </button>
      </div>
    )
  }

  // Todas las diapositivas pendientes de datos (p. ej. solo Comunidad mientras carga): todavía no se pinta nada.
  if (slides.length === 0) return null

  const current = slides[index] ?? slides[0]
  const dots = slides.length > 1 && (
    <div className="home-photo-banner-dots">
      {slides.map((s, i) => (
        <span key={s.id} className={'home-photo-banner-dot' + (i === index ? ' home-photo-banner-dot-active' : '')} />
      ))}
    </div>
  )

  function handlePressStart() {
    setPaused(true)
  }

  function handleTouchStart(e: TouchEvent) {
    const t = e.touches[0]
    touchStartRef.current = { x: t.clientX, y: t.clientY }
    handlePressStart()
  }

  function handleTouchEnd(e: TouchEvent) {
    const start = touchStartRef.current
    touchStartRef.current = null
    if (start && slides.length > 1) {
      const t = e.changedTouches[0]
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y
      if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy)) {
        setIndex((i) => (dx < 0 ? (i + 1) % slides.length : (i - 1 + slides.length) % slides.length))
      }
    }
    setPaused(false)
  }

  function handleMouseUp() {
    setPaused(false)
  }

  const pointerProps = {
    onTouchStart: handleTouchStart,
    onTouchEnd: handleTouchEnd,
    onMouseDown: handlePressStart,
    onMouseUp: handleMouseUp,
    onMouseLeave: handleMouseUp,
  }
  const slideInteractionProps = {
    'data-help-id': 'inicio.carrusel', // marca para el recorrido de bienvenida («Enséñame»)
    role: 'button' as const,
    tabIndex: 0,
    ...pointerProps,
    onKeyDown: (e: KeyboardEvent) => e.key === 'Enter' && setPaused((p) => !p),
  }

  // Petición real: "quiero que uses esta imagen como fondo para la
  // compra pendiente... pon un cuadro de texto en las líneas para
  // poner los productos pendientes cuando hay" — imagen de fondo a
  // pantalla completa (no icono+texto+ilustración al lado como antes),
  // con los artículos "escritos" encima de las líneas de la libreta.
  if (current.kind === 'info' && current.art === 'compra') {
    return (
      <div className="home-photo-banner home-shopping-banner" aria-label={current.title} {...slideInteractionProps}>
        <div className="home-shopping-note">
          <img src={shoppingListBg} alt="" className="home-shopping-note-img" />
          {current.items.length === 0 ? (
            <div className="home-shopping-note-line home-shopping-note-line-1">Nada pendiente todavía 🎉</div>
          ) : (
            <>
              {current.items.slice(0, 4).map((item, i) => (
                <div key={i} className={`home-shopping-note-line home-shopping-note-line-${i + 1}`}>
                  {item}
                </div>
              ))}
              {current.items.length > 4 && (
                <div className="home-shopping-note-line home-shopping-note-line-5">+{current.items.length - 4} más</div>
              )}
            </>
          )}
        </div>
        {/* Petición real: la diapositiva tiene que llevar de verdad a la Lista. */}
        <Link to="/compras" state={{ tab: 'Lista' }} className="home-slide-link">
          Ir a la Lista →
        </Link>
        {gear}
        {dots}
      </div>
    )
  }

  // Petición real: "ahora haz lo mismo con el del calendario" — misma
  // idea que la diapositiva de compra, con su propia foto (pizarra
  // "Hoy, cosas pendientes").
  if (current.kind === 'info') {
    return (
      <div className="home-photo-banner home-agenda-banner" aria-label={current.title} {...slideInteractionProps}>
        <div className="home-agenda-note">
          <img src={agendaBg} alt="" className="home-agenda-note-img" />
          {current.items.length === 0 ? (
            <div className="home-agenda-note-line home-agenda-note-line-1">Nada apuntado para hoy</div>
          ) : (
            <>
              {current.items.slice(0, 4).map((item, i) => (
                <div key={i} className={`home-agenda-note-line home-agenda-note-line-${i + 1}`}>
                  {item}
                </div>
              ))}
              {current.items.length > 4 && (
                <div className="home-agenda-note-line home-agenda-note-line-5">+{current.items.length - 4} más</div>
              )}
            </>
          )}
        </div>
        <Link to="/calendario" className="home-slide-link">
          Ir a Calendario →
        </Link>
        {gear}
        {dots}
      </div>
    )
  }

  // Comunidad PEPA: SOLO texto útil (sin ilustraciones ni cabeceras decorativas) con hasta tres publicaciones reales elegidas para esta persona: primero las no leídas, luego las
  // novedades (respuestas sin ver), luego donde ha participado y, por último, lo reciente (ver communityCarouselLines). Cada línea abre su publicación; el título y el enlace de abajo abren Comunidad. Mismo marco (tamaño) que las demás diapositivas.
  if (current.kind === 'community') {
    return (
      <div className="home-photo-banner home-community-banner" data-help-id="inicio.carrusel" style={{ background: NAV_SECTION_COLORS.get('comunidad') }} aria-label="Comunidad PEPA" {...pointerProps}>
        <Link to="/comunidad" className="home-community-title">
          🏡 Comunidad PEPA
        </Link>
        {current.lines.length === 0 ? (
          <p className="home-community-empty">Todavía no hay publicaciones. Entra en Comunidad para ver las novedades.</p>
        ) : (
          <ul className="home-community-list">
            {current.lines.map((l) => (
              <li key={l.id}>
                <Link to={`/comunidad/p/${l.id}`} className="home-community-line">
                  <span aria-hidden="true">{l.icon}</span>
                  <span className="home-community-line-text">
                    <strong>{l.title}</strong>
                    <span className="muted">{l.meta}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link to="/comunidad" className="home-slide-link">
          Ir a Comunidad →
        </Link>
        {gear}
        {dots}
      </div>
    )
  }

  // Familias que todavía no han subido fotos a su Galería PEPA: una tarjeta informativa sencilla (desaparece con la primera foto).
  if (current.kind === 'gallery-info') {
    return (
      <div className="home-photo-banner home-gallery-info-banner" data-help-id="inicio.carrusel" style={{ background: NAV_SECTION_COLORS.get('galeria') }} aria-label="Fotos de la familia" {...pointerProps}>
        <p className="home-gallery-info-title">📷 Fotos de la familia</p>
        <p className="home-gallery-info-text">Cuando subáis imágenes a vuestra Galería PEPA, aquí podréis ver hasta cinco fotografías.</p>
        <Link to="/galeria" className="home-slide-link">
          Ir a la Galería →
        </Link>
        {gear}
        {dots}
      </div>
    )
  }

  // Mantener el dedo (o el ratón) encima para el pase mientras se lee
  // o se mira la foto entera — antes esto era un enlace y tocarlo se
  // iba directo a Galería/Calendario/Compras sin dar tiempo a mirar
  // (petición real: "que no se abra la carpeta... solamente tiene que
  // pararse cuando lo toque"). Se reanuda al levantar el dedo.
  return (
    <div className="home-photo-banner" {...slideInteractionProps}>
      {current.url && <img src={current.url} alt={current.caption} className="home-photo-banner-img" />}
      <div className="home-photo-banner-overlay">
        <p className="home-photo-banner-title">📷 {current.caption}</p>
      </div>
      {gear}
      {dots}
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
    <div className="card home-card" style={{ background: color }}>
      <div>
        <h2>{title}</h2>
        <p className="muted">{body}</p>
      </div>
      <span className="home-card-icon">{icon}</span>
      {organizing && (
        <div className="home-card-move" data-help-id="inicio.mover">
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
