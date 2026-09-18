import { FormEvent, useEffect, useState } from 'react'

// Página pública de RSVP (Módulo Eventos, Fase 2) — el invitado no
// necesita cuenta ni la app instalada. Ruta pública de la propia SPA
// ("/?rsvp=TOKEN" o "/?rsvp_open=TOKEN"), reconocida en App.tsx ANTES
// del guardián de sesión, así que nunca pide iniciar sesión.
//
// Bug real que motivó este cambio: antes el enlace apuntaba
// directamente a la función edge event-rsvp, que servía HTML en
// crudo — pero Supabase fuerza Content-Type: text/plain + una CSP en
// modo sandbox en toda función edge (para que ninguna pueda servir
// HTML "de verdad" bajo su dominio compartido *.supabase.co), así que
// el móvil lo descargaba como archivo de texto en vez de abrirlo. La
// función ahora solo devuelve JSON; esta pantalla hace de verdad el
// render, con los mismos estilos que el resto de la app (antes tenía
// su propia hoja de estilos aparte, a mano).
//
// Por qué "/?rsvp=" y no "/rsvp?token=": la raíz ("/") es un archivo
// real en GitHub Pages, sin pasar por el truco de 404.html — mismo
// motivo por el que el regreso del banco vuelve siempre a "/" (ver
// App.tsx, HomeOrBankReturn): ese salto doble (404 → decodificar →
// index.html) es justo el más frágil de todos tras un enlace externo
// largo en el móvil, con la red recién "despertando".

interface InfoLine {
  icon: string
  label: string
}

interface PublicEvent {
  type: string
  title: string
  dateStatus: string
  infoLines: InfoLine[]
  rsvpDeadline: string | null
  status: string
}

interface PublicGuest {
  displayName: string
  adultsCount: number
  childrenCount: number
  rsvpStatus: string
  rsvpAdultsCount: number | null
  rsvpChildrenCount: number | null
  rsvpNote: string | null
}

type LoadState =
  | { state: 'loading' }
  | { state: 'not_found' }
  | { state: 'error' }
  | { state: 'archived'; event: PublicEvent }
  | { state: 'form'; event: PublicEvent; guest: PublicGuest }
  | { state: 'open_form'; event: PublicEvent }

const EVENT_TYPE_ICON: Record<string, string> = {
  cumpleanos: '🎂',
  comunion: '⛪',
  bautizo: '👶',
  celebracion: '🎉',
  boda: '💍',
  personalizado: '✨',
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'confirmado', label: '✅ Confirmo' },
  { value: 'no_asiste', label: '❌ No podré ir' },
  { value: 'no_seguro', label: '🤔 No estoy seguro' },
  { value: 'pendiente', label: '⏳ Todavía no sé' },
]

function functionsUrl(): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  return `${supabaseUrl}/functions/v1/event-rsvp`
}

export function RsvpScreen({ token, openToken }: { token: string | null; openToken: string | null }) {
  const [data, setData] = useState<LoadState>({ state: 'loading' })
  const [submitted, setSubmitted] = useState(false)
  const [notForMe, setNotForMe] = useState(false)

  useEffect(() => {
    const param = token ? `token=${encodeURIComponent(token)}` : `open=${encodeURIComponent(openToken!)}`
    fetch(`${functionsUrl()}?${param}`)
      .then(async (res) => {
        if (res.status === 404) return setData({ state: 'not_found' })
        if (!res.ok) return setData({ state: 'error' })
        const body = await res.json()
        setData(body)
      })
      .catch(() => setData({ state: 'error' }))
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
          <p className="muted">Este enlace de invitación no existe o ya no está activo. Pide a quien te lo mandó que te pase uno nuevo.</p>
        </div>
        <RsvpFooter />
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
        <RsvpFooter />
      </div>
    )
  }

  const icon = EVENT_TYPE_ICON[data.event.type] ?? '🎉'

  if (data.state === 'archived') {
    return (
      <div className="screen screen-centered">
        <div className="card">
          <h1>
            {icon} {data.event.title}
          </h1>
          <p className="muted">Este evento ya ha terminado — gracias por tu respuesta en su momento.</p>
        </div>
        <RsvpFooter />
      </div>
    )
  }

  if (notForMe) {
    return (
      <div className="screen screen-centered">
        <div className="card">
          <h1>De acuerdo</h1>
          <p className="muted">No hemos cambiado nada. Si crees que este enlace debería ser para ti, contacta con quien te lo mandó.</p>
        </div>
        <RsvpFooter />
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="screen screen-centered">
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40 }}>🎉</div>
          <h1>¡Gracias!</h1>
          <p className="muted">
            Tu respuesta se ha guardado. Puedes volver a abrir este mismo enlace si necesitas cambiarla.
          </p>
        </div>
        <RsvpFooter />
      </div>
    )
  }

  return (
    <div className="screen screen-centered">
      <div className="card">
        {data.state === 'form' && (
          <span
            style={{ display: 'inline-block', background: '#eef0ff', color: '#4C6EF5', fontWeight: 600, fontSize: 13, padding: '6px 12px', borderRadius: 999, marginBottom: 10 }}
          >
            Invitación para: {data.guest.displayName}
          </span>
        )}
        <h1>
          {icon} {data.event.title}
        </h1>
        {data.event.infoLines.map((l, i) => (
          <p key={i} style={{ fontSize: 15, margin: '6px 0' }}>
            {l.icon} {l.label}
          </p>
        ))}
        {data.event.rsvpDeadline && <p className="muted">Por favor, responde antes del {data.event.rsvpDeadline}.</p>}

        {data.state === 'form' ? (
          <RsvpForm token={token!} guest={data.guest} onSubmitted={() => setSubmitted(true)} onNotForMe={() => setNotForMe(true)} />
        ) : (
          <OpenRsvpForm openToken={openToken!} onSubmitted={() => setSubmitted(true)} />
        )}
      </div>
      <RsvpFooter />
    </div>
  )
}

function RsvpFooter() {
  return (
    <p className="muted" style={{ fontSize: 12, marginTop: 22, textAlign: 'center' }}>
      Organizado con{' '}
      <a href={window.location.origin + import.meta.env.BASE_URL} style={{ color: '#6b7fe0' }}>
        PEPA 🎉
      </a>
    </p>
  )
}

function RsvpForm({
  token,
  guest,
  onSubmitted,
  onNotForMe,
}: {
  token: string
  guest: PublicGuest
  onSubmitted: () => void
  onNotForMe: () => void
}) {
  const [status, setStatus] = useState(guest.rsvpStatus || 'pendiente')
  const [adults, setAdults] = useState(String(guest.rsvpAdultsCount ?? guest.adultsCount))
  const [children, setChildren] = useState(String(guest.rsvpChildrenCount ?? guest.childrenCount))
  const [note, setNote] = useState(guest.rsvpNote ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`${functionsUrl()}?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, adults, children, note }),
      })
      if (!res.ok) throw new Error()
      onSubmitted()
    } catch {
      setError('No se ha podido guardar — inténtalo otra vez en un momento.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <fieldset style={{ border: 'none', padding: 0, margin: '18px 0 0' }}>
        <legend style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>¿Vais a poder venir?</legend>
        <div className="filter-row">
          {STATUS_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              className={'chip' + (status === o.value ? ' chip-active' : '')}
              onClick={() => setStatus(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>
      {status === 'confirmado' && (
        <div className="inline-fields" style={{ marginTop: 12 }}>
          <label>
            Adultos
            <input type="number" min={0} max={50} value={adults} onChange={(e) => setAdults(e.target.value)} />
          </label>
          <label>
            Niños
            <input type="number" min={0} max={50} value={children} onChange={(e) => setChildren(e.target.value)} />
          </label>
        </div>
      )}
      <label style={{ display: 'block', marginTop: 14 }}>
        Nota (alergia, algún comentario...) — opcional
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={3} />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving} style={{ marginTop: 14, width: '100%' }}>
        {saving ? 'Enviando…' : 'Enviar respuesta'}
      </button>
      <button type="button" className="link-button" onClick={onNotForMe} style={{ display: 'block', margin: '10px auto 0' }}>
        Esta invitación no es para mí
      </button>
    </form>
  )
}

function OpenRsvpForm({ openToken, onSubmitted }: { openToken: string; onSubmitted: () => void }) {
  const [name, setName] = useState('')
  const [adults, setAdults] = useState('1')
  const [children, setChildren] = useState('0')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`${functionsUrl()}?open=${encodeURIComponent(openToken)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, adults, children, note }),
      })
      if (!res.ok) throw new Error()
      onSubmitted()
    } catch {
      setError('No se ha podido guardar — inténtalo otra vez en un momento.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label style={{ display: 'block', marginTop: 14 }}>
        Tu nombre (o el de tu familia/grupo)
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
      </label>
      <div className="inline-fields" style={{ marginTop: 12 }}>
        <label>
          Adultos
          <input type="number" min={0} max={50} value={adults} onChange={(e) => setAdults(e.target.value)} />
        </label>
        <label>
          Niños
          <input type="number" min={0} max={50} value={children} onChange={(e) => setChildren(e.target.value)} />
        </label>
      </div>
      <label style={{ display: 'block', marginTop: 14 }}>
        Nota (alergia, algún comentario...) — opcional
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={3} />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving} style={{ marginTop: 14, width: '100%' }}>
        {saving ? 'Enviando…' : 'Confirmar asistencia'}
      </button>
    </form>
  )
}
