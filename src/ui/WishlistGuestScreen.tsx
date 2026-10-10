import { FormEvent, useEffect, useState } from 'react'
import pepaLogoSlogan from '@/assets/brand/variants/pepa-family-app-logo-slogan.png'
import { PEPA_PUBLIC_WEBSITE_URL } from '@/domain/brand'

// Página pública de "Lista de deseos" (Pequeños Grandes) — el invitado no necesita cuenta ni la app
// instalada. Ruta pública de la propia SPA ("/?deseos=TOKEN"), reconocida en App.tsx ANTES del guardián
// de sesión, así que nunca pide iniciar sesión — mismo patrón, ya en producción, que RsvpScreen.tsx.
//
// Por qué "/?deseos=" y no "/deseos?token=": la raíz ("/") es un archivo real en GitHub Pages, sin pasar
// por el truco de 404.html (mismo motivo documentado en App.tsx/RsvpScreen.tsx para RSVP y el regreso del
// banco: ese salto doble es justo el más frágil de todos tras un enlace externo largo en el móvil).

interface PublicWishlistItem {
  id: string
  name: string
  description: string | null
  link: string | null
  price: number | null
  photoUrl: string | null
  allowJoint: boolean
  status: 'disponible' | 'reservado' | 'conjunto'
  jointCount?: number
}

interface PublicWishlist {
  ownerName: string
  occasion: string
  year: number
  celebrationDate: string | null
}

type LoadState = { state: 'loading' } | { state: 'not_found' } | { state: 'error' } | { state: 'loaded'; wishlist: PublicWishlist; items: PublicWishlistItem[] }

function functionsUrl(): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  return `${supabaseUrl}/functions/v1/wishlist-guest`
}

// "Mis reservas" en este navegador — el único rastro de identidad de un invitado sin cuenta es el
// reservationToken que la función edge le devuelve al reservar (mismo criterio que calendar_export_token/
// rsvp_token: el token ES la autenticación). Se guarda aquí para poder deshacerla más tarde desde el
// mismo enlace, sin inventar ninguna cuenta ni cookie de sesión.
function storageKey(token: string): string {
  return `pepa_wishlist_reservations_${token}`
}
function loadMyReservations(token: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(storageKey(token)) ?? '{}')
  } catch {
    return {}
  }
}
function saveMyReservation(token: string, itemId: string, reservationToken: string) {
  try {
    const all = loadMyReservations(token)
    all[itemId] = reservationToken
    localStorage.setItem(storageKey(token), JSON.stringify(all))
  } catch {
    // Sin localStorage (privado/bloqueado) la reserva sigue hecha de verdad en el servidor — solo se
    // pierde la comodidad de poder deshacerla luego desde este mismo navegador.
  }
}
function clearMyReservation(token: string, itemId: string) {
  try {
    const all = loadMyReservations(token)
    delete all[itemId]
    localStorage.setItem(storageKey(token), JSON.stringify(all))
  } catch {
    // Igual que arriba.
  }
}

export function WishlistGuestScreen({ token }: { token: string }) {
  const [data, setData] = useState<LoadState>({ state: 'loading' })
  const [myReservations, setMyReservations] = useState<Record<string, string>>({})

  function reload() {
    fetch(`${functionsUrl()}?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (res.status === 404) return setData({ state: 'not_found' })
        if (!res.ok) return setData({ state: 'error' })
        const body = await res.json()
        setData({ state: 'loaded', wishlist: body.wishlist, items: body.items })
      })
      .catch(() => setData({ state: 'error' }))
  }
  useEffect(() => {
    reload()
    setMyReservations(loadMyReservations(token))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (data.state === 'loading') {
    return (
      <div className="screen screen-centered">
        <p className="muted">Cargando…</p>
      </div>
    )
  }

  if (data.state === 'not_found') {
    return (
      <div className="screen screen-centered">
        <div className="card">
          <h1>😕 Enlace no válido</h1>
          <p className="muted">Este enlace de lista de deseos no existe o ya no está activo. Pide a quien te lo mandó que te pase uno nuevo.</p>
        </div>
        <WishlistGuestFooter />
      </div>
    )
  }

  if (data.state === 'error') {
    return (
      <div className="screen screen-centered">
        <div className="card">
          <h1>Algo ha fallado</h1>
          <p className="muted">Inténtalo de nuevo en un momento.</p>
        </div>
        <WishlistGuestFooter />
      </div>
    )
  }

  return (
    <div className="screen screen-centered">
      <div className="card">
        <h1>🎁 Lista de deseos de {data.wishlist.ownerName}</h1>
        <p className="muted">
          {data.wishlist.occasion} {data.wishlist.year}
          {data.wishlist.celebrationDate ? ` · ${data.wishlist.celebrationDate}` : ''}
        </p>
        <p className="muted" style={{ fontSize: 13 }}>
          Reserva lo que quieras regalar — nadie más (ni siquiera {data.wishlist.ownerName}) verá quién ha reservado qué. Sigue siendo una sorpresa.
        </p>
      </div>
      <div style={{ marginTop: 10 }}>
        {data.items.map((item) => (
          <WishlistGuestItemCard
            key={item.id}
            token={token}
            item={item}
            myReservationToken={myReservations[item.id] ?? null}
            onChanged={(itemId, reservationToken) => {
              if (reservationToken) saveMyReservation(token, itemId, reservationToken)
              else clearMyReservation(token, itemId)
              setMyReservations(loadMyReservations(token))
              reload()
            }}
          />
        ))}
        {data.items.length === 0 && <p className="muted">Todavía no hay regalos en esta lista.</p>}
      </div>
      <WishlistGuestFooter />
    </div>
  )
}

function WishlistGuestItemCard({
  token,
  item,
  myReservationToken,
  onChanged,
}: {
  token: string
  item: PublicWishlistItem
  myReservationToken: string | null
  onChanged: (itemId: string, reservationToken: string | null) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [guestName, setGuestName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function post(body: Record<string, unknown>): Promise<{ ok?: boolean; reservationToken?: string; error?: string }> {
    const res = await fetch(`${functionsUrl()}?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return res.json().catch(() => ({ error: 'server_error' }))
  }

  async function handleReserve(ev: FormEvent) {
    ev.preventDefault()
    if (!guestName.trim()) {
      setError('Pon tu nombre para poder avisar de que ya lo reservaste.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await post({ action: 'reserve', itemId: item.id, guestName })
      if (result.error === 'ya_reservado') {
        setError('Justo se ha adelantado otra persona — prueba con otro regalo.')
        onChanged(item.id, null)
        return
      }
      if (!result.ok || !result.reservationToken) {
        setError('No se pudo reservar. Inténtalo otra vez.')
        return
      }
      setShowForm(false)
      onChanged(item.id, result.reservationToken)
    } catch {
      setError('No se pudo reservar. Inténtalo otra vez.')
    } finally {
      setBusy(false)
    }
  }

  async function handleUndo() {
    if (!myReservationToken) return
    setBusy(true)
    setError(null)
    try {
      const result = await post({ action: 'undo', itemId: item.id, reservationToken: myReservationToken })
      if (!result.ok) {
        setError('No se pudo deshacer. Inténtalo otra vez.')
        return
      }
      onChanged(item.id, null)
    } catch {
      setError('No se pudo deshacer. Inténtalo otra vez.')
    } finally {
      setBusy(false)
    }
  }

  const canReserve = item.status === 'disponible' || (item.status === 'conjunto' && !myReservationToken)

  return (
    <div className="card task-card" style={{ marginBottom: 8 }}>
      <div className="inline-fields" style={{ alignItems: 'flex-start' }}>
        {item.photoUrl && <img src={item.photoUrl} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8 }} />}
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
          <span className="muted" style={{ fontSize: 12, display: 'block' }}>
            {myReservationToken
              ? '✓ Lo has reservado tú'
              : item.status === 'disponible'
                ? '🎁 Disponible'
                : item.status === 'conjunto'
                  ? `🤝 Conjunto (${item.jointCount ?? 0} apuntado${(item.jointCount ?? 0) === 1 ? '' : 's'})`
                  : '✓ Ya reservado'}
          </span>
        </span>
      </div>
      {error && <p className="error" style={{ fontSize: 12 }}>{error}</p>}
      {myReservationToken && (
        <button type="button" className="link-button" onClick={() => void handleUndo()} disabled={busy}>
          {busy ? 'Deshaciendo…' : 'Deshacer mi reserva'}
        </button>
      )}
      {!myReservationToken && canReserve && !showForm && (
        <button type="button" className="link-button" onClick={() => setShowForm(true)}>
          {item.status === 'conjunto' ? '+ Unirme a este regalo' : '🎁 Reservar este regalo'}
        </button>
      )}
      {!myReservationToken && showForm && (
        <form className="inline-fields" style={{ marginTop: 4 }} onSubmit={handleReserve}>
          <input type="text" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Tu nombre" style={{ flex: 1 }} autoFocus />
          <button type="submit" disabled={busy}>
            {busy ? 'Reservando…' : 'Confirmar'}
          </button>
          <button type="button" className="link-button" onClick={() => setShowForm(false)}>
            Cancelar
          </button>
        </form>
      )}
    </div>
  )
}

function WishlistGuestFooter() {
  return (
    <div style={{ marginTop: 22, textAlign: 'center' }}>
      <img src={pepaLogoSlogan} alt="Pepa Family App — Pepa te lo soluciona" style={{ width: '100%', maxWidth: 220, height: 'auto', display: 'block', margin: '0 auto 6px' }} />
      <a href={PEPA_PUBLIC_WEBSITE_URL} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#6b7fe0' }}>
        pepafamilyapp.es
      </a>
    </div>
  )
}
