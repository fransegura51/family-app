import { FormEvent, useEffect, useState } from 'react'
import { SectionBreadcrumb } from '@/ui/SectionBreadcrumb'
import { ConfirmButton, ConfirmIconButton } from '@/ui/ConfirmButton'
import { MemberAvatar } from '@/ui/MemberAvatar'
import { listFamilyMembers } from '@/data/family'
import {
  addWishlist,
  addWishlistItem,
  deleteWishlist,
  deleteWishlistItem,
  getWishlistGuestUrl,
  getWishlistItemPhotoUrl,
  listWishlistItems,
  listWishlistReservationsForItems,
  listWishlists,
  regenerateWishlistGuestUrl,
  reserveWishlistItem,
  saveWishlistItemPhoto,
  undoWishlistReservation,
} from '@/data/wishlist'
import { isOwnWishlist, wishlistItemStatus, wishlistTitle, type WishlistItemStatus } from '@/domain/wishlist'
import { errorMessage } from '@/domain/errorMessage'
import { shareText } from '@/services/share'
import type { FamilyMember, Profile, Wishlist, WishlistItem, WishlistItemReservation } from '@/domain/types'
import deseosHeaderImg from '@/assets/puntos/deseos-header.jpg'

// "Lista de deseos" (Pequeños Grandes, Fases 12-16 del prompt maestro consolidado, autorización directa
// del usuario 2026-10-10) — por persona/año/celebración. El secreto de una reserva es REAL (RLS,
// migración 0239): esta pantalla ni siquiera intenta consultar las reservas cuando el viewer es el
// destinatario de la lista o un 'child' — no hace falta ocultar nada en la interfaz porque el servidor ya
// no le entrega esas filas; aquí solo se evita la llamada innecesaria y se explica por qué no se ve nada.
export function WishlistScreen({ profile, onBack }: { profile: Profile; onBack: () => void }) {
  const [wishlists, setWishlists] = useState<Wishlist[]>([])
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [myMemberId, setMyMemberId] = useState<string | null>(null)
  const [openWishlistId, setOpenWishlistId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    listWishlists()
      .then(setWishlists)
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar las listas')))
    listFamilyMembers()
      .then((all) => {
        setMembers(all)
        setMyMemberId(all.find((m) => m.linkedProfileId === profile.id)?.id ?? null)
      })
      .catch(() => setMembers([]))
  }
  useEffect(reload, [profile.id])

  function memberName(id: string): string {
    return members.find((m) => m.id === id)?.name ?? 'Alguien'
  }

  if (openWishlistId) {
    const wishlist = wishlists.find((w) => w.id === openWishlistId)
    if (!wishlist) {
      setOpenWishlistId(null)
      return null
    }
    return (
      <WishlistDetailScreen
        wishlist={wishlist}
        ownerName={memberName(wishlist.ownerMemberId)}
        viewerMemberId={myMemberId}
        isChild={profile.role === 'child'}
        onBack={() => setOpenWishlistId(null)}
      />
    )
  }

  return (
    <div className="screen">
      <div className="kitchen-header kitchen-header-wide">
        <img src={deseosHeaderImg} alt="Lista de deseos" className="kitchen-header-img" />
      </div>
      <SectionBreadcrumb subsection="Lista de deseos" />
      <button type="button" className="link-button" onClick={onBack}>
        ← Volver a Pequeños Grandes
      </button>
      {error && <p className="error">{error}</p>}
      <div className="event-list" style={{ marginTop: 8 }}>
        {wishlists.map((w) => (
          <div key={w.id} className="card task-card inline-fields" style={{ alignItems: 'center', cursor: 'pointer' }} onClick={() => setOpenWishlistId(w.id)}>
            {members.find((m) => m.id === w.ownerMemberId) && <MemberAvatar member={members.find((m) => m.id === w.ownerMemberId)!} size={32} />}
            <span style={{ flex: 1 }}>
              <strong>{memberName(w.ownerMemberId)}</strong>
              <span className="muted" style={{ fontSize: 13, display: 'block' }}>
                {wishlistTitle(w.occasion, w.year)}
                {w.celebrationDate ? ` · ${w.celebrationDate}` : ''}
              </span>
            </span>
            <span onClick={(e) => e.stopPropagation()}>
              <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Borrar lista" onConfirm={() => deleteWishlist(w.id).then(reload)} />
            </span>
          </div>
        ))}
        {wishlists.length === 0 && <p className="muted">Todavía no hay ninguna lista de deseos.</p>}
      </div>
      <button type="button" className="link-button" onClick={() => setShowAdd(true)}>
        + Nueva lista
      </button>
      {showAdd && (
        <AddWishlistModal
          members={members}
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false)
            reload()
          }}
        />
      )}
    </div>
  )
}

function AddWishlistModal({ members, onClose, onAdded }: { members: FamilyMember[]; onClose: () => void; onAdded: () => void }) {
  const [ownerMemberId, setOwnerMemberId] = useState(members[0]?.id ?? '')
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [occasion, setOccasion] = useState('')
  const [celebrationDate, setCelebrationDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!ownerMemberId) {
      setError('Elige para quién es la lista.')
      return
    }
    if (!occasion.trim()) {
      setError('Ponle una celebración (cumpleaños, Navidad...).')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await addWishlist({ ownerMemberId, year: Number(year) || new Date().getFullYear(), occasion, celebrationDate: celebrationDate || null })
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo crear'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Nueva lista de deseos
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <form className="card member-form" onSubmit={handleSubmit}>
          {error && <p className="error">{error}</p>}
          <label>
            Para quién
            <select value={ownerMemberId} onChange={(e) => setOwnerMemberId(e.target.value)}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <div className="inline-fields">
            <label style={{ flex: 1 }}>
              Celebración
              <input type="text" value={occasion} onChange={(e) => setOccasion(e.target.value)} placeholder="Cumpleaños, Navidad, Reyes..." autoFocus />
            </label>
            <label style={{ width: 90 }}>
              Año
              <input type="number" value={year} onChange={(e) => setYear(e.target.value)} />
            </label>
          </div>
          <label>
            Fecha de la celebración (opcional)
            <input type="date" value={celebrationDate} onChange={(e) => setCelebrationDate(e.target.value)} />
          </label>
          <button type="submit" disabled={saving}>
            {saving ? 'Creando…' : 'Crear lista'}
          </button>
        </form>
      </div>
    </div>
  )
}

function WishlistDetailScreen({
  wishlist,
  ownerName,
  viewerMemberId,
  isChild,
  onBack,
}: {
  wishlist: Wishlist
  ownerName: string
  viewerMemberId: string | null
  isChild: boolean
  onBack: () => void
}) {
  const [items, setItems] = useState<WishlistItem[]>([])
  const [reservations, setReservations] = useState<WishlistItemReservation[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guestUrl, setGuestUrl] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  // El secreto es real (RLS): si el viewer es el destinatario, ni siquiera se pide la lista de reservas —
  // para él, RLS devolvería 0 filas de todas formas, pero no tiene sentido pedirlo ni sugerir que "podría"
  // verlo con otra cuenta.
  const ownWishlist = isOwnWishlist(wishlist.ownerMemberId, viewerMemberId)
  const canSeeReservations = !ownWishlist && !isChild

  function reload() {
    listWishlistItems(wishlist.id)
      .then((all) => {
        setItems(all)
        if (canSeeReservations && all.length > 0) {
          listWishlistReservationsForItems(all.map((i) => i.id))
            .then(setReservations)
            .catch(() => setReservations([]))
        } else {
          setReservations([])
        }
      })
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar los regalos')))
  }
  useEffect(reload, [wishlist.id])

  async function handleShare() {
    setSharing(true)
    setError(null)
    setNotice(null)
    try {
      const url = guestUrl ?? (await getWishlistGuestUrl(wishlist.id))
      setGuestUrl(url)
      const shown = await shareText({ title: `Lista de deseos de ${ownerName}`, text: url })
      setNotice(shown ? null : 'Copiado al portapapeles.')
    } catch (err) {
      setError(errorMessage(err, 'No se pudo generar el enlace'))
    } finally {
      setSharing(false)
    }
  }

  async function handleRegenerate() {
    setSharing(true)
    setError(null)
    try {
      setGuestUrl(await regenerateWishlistGuestUrl(wishlist.id))
    } catch (err) {
      setError(errorMessage(err, 'No se pudo renovar el enlace'))
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="screen">
      <div className="kitchen-header kitchen-header-wide">
        <img src={deseosHeaderImg} alt="Lista de deseos" className="kitchen-header-img" />
      </div>
      <SectionBreadcrumb subsection={`Lista de deseos de ${ownerName}`} />
      <button type="button" className="link-button" onClick={onBack}>
        ← Volver a Lista de deseos
      </button>
      <p className="muted">
        {wishlistTitle(wishlist.occasion, wishlist.year)}
        {wishlist.celebrationDate ? ` · ${wishlist.celebrationDate}` : ''}
      </p>
      {ownWishlist && (
        <p className="muted" style={{ fontSize: 13 }}>
          🤫 Es tu propia lista — nunca verás aquí quién reserva cada regalo, para que siga siendo una sorpresa.
        </p>
      )}
      {isChild && !ownWishlist && (
        <p className="muted" style={{ fontSize: 13 }}>
          🤫 Puedes reservar un regalo, pero no ver quién ha reservado los demás.
        </p>
      )}
      {error && <p className="error">{error}</p>}
      <div className="inline-fields" style={{ marginTop: 6 }}>
        <button type="button" className="link-button" onClick={() => void handleShare()} disabled={sharing}>
          {sharing ? 'Generando…' : '🔗 Compartir con invitados sin cuenta'}
        </button>
        {guestUrl && (
          <button type="button" className="link-button" onClick={() => void handleRegenerate()} disabled={sharing}>
            Renovar enlace
          </button>
        )}
      </div>
      {notice && <p className="muted" style={{ fontSize: 12 }}>{notice}</p>}
      {guestUrl && <p className="muted" style={{ fontSize: 12, wordBreak: 'break-all' }}>{guestUrl}</p>}
      <div className="event-list" style={{ marginTop: 8 }}>
        {items.map((item) => (
          <WishlistItemRow
            key={item.id}
            item={item}
            reservations={reservations.filter((r) => r.itemId === item.id)}
            canSeeReservations={canSeeReservations}
            canReserve={!ownWishlist}
            viewerMemberId={viewerMemberId}
            onChanged={reload}
          />
        ))}
        {items.length === 0 && <p className="muted">Todavía no hay regalos en esta lista.</p>}
      </div>
      <button type="button" className="link-button" onClick={() => setShowAdd(true)}>
        + Añadir regalo
      </button>
      {showAdd && (
        <AddWishlistItemModal
          wishlistId={wishlist.id}
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false)
            reload()
          }}
        />
      )}
    </div>
  )
}

function statusLabel(status: WishlistItemStatus): string {
  if (status.kind === 'disponible') return '🎁 Disponible'
  if (status.kind === 'conjunto') return `🤝 Conjunto (${status.count} apuntado${status.count === 1 ? '' : 's'})`
  return '✓ Reservado'
}

function WishlistItemRow({
  item,
  reservations,
  canSeeReservations,
  canReserve,
  viewerMemberId,
  onChanged,
}: {
  item: WishlistItem
  reservations: WishlistItemReservation[]
  canSeeReservations: boolean
  canReserve: boolean
  viewerMemberId: string | null
  onChanged: () => void
}) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (item.photoStoragePath) getWishlistItemPhotoUrl(item.photoStoragePath).then(setPhotoUrl).catch(() => setPhotoUrl(null))
    else setPhotoUrl(null)
  }, [item.photoStoragePath])

  const status = canSeeReservations ? wishlistItemStatus(item.allowJoint, reservations) : wishlistItemStatus(item.allowJoint, [])
  const myReservation = reservations.find((r) => r.reservedByMemberId === viewerMemberId && r.undoneAt == null)
  const canJoin = canReserve && (status.kind === 'disponible' || (status.kind === 'conjunto' && !myReservation))

  async function handleReserve() {
    setBusy(true)
    setError(null)
    try {
      await reserveWishlistItem(item.id, item.allowJoint)
      onChanged()
    } catch (err) {
      setError(errorMessage(err, 'Ya se ha reservado justo ahora'))
    } finally {
      setBusy(false)
    }
  }

  async function handleUndo() {
    if (!myReservation) return
    setBusy(true)
    setError(null)
    try {
      await undoWishlistReservation(myReservation.id)
      onChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo deshacer'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card task-card">
      <div className="inline-fields" style={{ alignItems: 'flex-start' }}>
        {photoUrl && <img src={photoUrl} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8 }} />}
        <span style={{ flex: 1 }}>
          <strong>{item.name}</strong>
          {item.description && <span className="muted" style={{ fontSize: 13, display: 'block' }}>{item.description}</span>}
          <span className="muted" style={{ fontSize: 13, display: 'block' }}>
            {item.price != null && `${item.price.toFixed(2)} € · `}
            {item.link && (
              <a href={item.link} target="_blank" rel="noopener noreferrer">
                Ver enlace
              </a>
            )}
          </span>
          {canSeeReservations && <span className="muted" style={{ fontSize: 12, display: 'block' }}>{statusLabel(status)}</span>}
        </span>
        <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Borrar regalo" onConfirm={() => deleteWishlistItem(item.id).then(onChanged)} />
      </div>
      {error && <p className="error" style={{ fontSize: 12 }}>{error}</p>}
      {canJoin && (
        <button type="button" className="link-button" onClick={() => void handleReserve()} disabled={busy}>
          {busy ? 'Reservando…' : status.kind === 'conjunto' ? '+ Unirme a este regalo' : '🎁 Reservar este regalo'}
        </button>
      )}
      {myReservation && (
        <ConfirmButton label="Deshacer mi reserva" confirmMessage="¿Deshacer tu reserva de este regalo? Quedará disponible otra vez." onConfirm={() => void handleUndo()} />
      )}
    </div>
  )
}

function AddWishlistItemModal({ wishlistId, onClose, onAdded }: { wishlistId: string; onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [link, setLink] = useState('')
  const [price, setPrice] = useState('')
  const [allowJoint, setAllowJoint] = useState(false)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!name.trim()) {
      setError('Ponle un nombre al regalo.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const id = await addWishlistItem(wishlistId, {
        name,
        description: description.trim() || null,
        link: link.trim() || null,
        price: price.trim() === '' ? null : Number(price),
        allowJoint,
      })
      if (photoFile) {
        const items = await listWishlistItems(wishlistId)
        const created = items.find((i) => i.id === id)
        if (created) await saveWishlistItemPhoto(created, photoFile)
      }
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Nuevo regalo
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <form className="card member-form" onSubmit={handleSubmit}>
          {error && <p className="error">{error}</p>}
          <label>
            Nombre
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Bicicleta, libro, LEGO..." autoFocus />
          </label>
          <label>
            Descripción (opcional)
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label>
            Enlace (opcional)
            <input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." />
          </label>
          <label>
            Precio (opcional)
            <input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
          <label>
            Fotografía (opcional)
            <input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} />
          </label>
          <label className="inline-fields" style={{ alignItems: 'center' }}>
            <input type="checkbox" checked={allowJoint} onChange={(e) => setAllowJoint(e.target.checked)} style={{ width: 'auto' }} />
            Es un regalo conjunto (varias personas pueden apuntarse)
          </label>
          <button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Añadir'}
          </button>
        </form>
      </div>
    </div>
  )
}
