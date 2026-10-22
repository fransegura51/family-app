// Invitación a valorar PEPA en Inicio, tras unos días de uso (ver domain/reviewInvite.ts). Un toque en las estrellas guarda la valoración general; después se
// ofrece, sin obligar, contar qué gusta y qué no (pantalla Reseñas y opiniones). «Ahora no» la aplaza 14 días; «No volver a preguntar» la quita para siempre
// (ambas decisiones viajan con la cuenta a todos sus dispositivos). Si algo falla (por ejemplo, sin red) la tarjeta simplemente no aparece: nunca estorba.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { hasMyGeneralReview, saveAppReview } from '@/data/appReviews'
import { supabase } from '@/data/supabaseClient'
import { REVIEW_INVITE_NEVER_ISO, shouldInviteToReview, snoozeUntil } from '@/domain/reviewInvite'
import { StarPicker } from '@/ui/StarPicker'
import { prefSet } from '@/state/prefs/prefsWrite'

const STORAGE_KEY = 'pepa.reviewInvite.until'

function readDismissedUntil(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function writeDismissedUntil(iso: string): void {
  try {
    prefSet(STORAGE_KEY, iso)
  } catch {
    /* sin almacenamiento: se volverá a preguntar, nada más */
  }
}

export function ReviewInviteCard() {
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)
  const [stars, setStars] = useState(0)
  const [thanks, setThanks] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function check() {
      const dismissed = readDismissedUntil()
      // Sin consultas si todavía está aplazada.
      if (dismissed && new Date(dismissed).getTime() > Date.now()) return
      const { data } = await supabase.auth.getUser()
      const user = data.user
      if (!user) return
      // Primero la edad de la cuenta (sin red extra); la consulta de si ya valoró solo se hace pasados los días de prueba.
      if (!shouldInviteToReview({ now: new Date(), accountCreatedAt: user.created_at, hasGeneralReview: false, dismissedUntil: dismissed })) return
      const already = await hasMyGeneralReview(user.id)
      if (already) {
        writeDismissedUntil(REVIEW_INVITE_NEVER_ISO)
        return
      }
      if (!cancelled) setVisible(true)
    }
    check().catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  if (!visible) return null

  async function pick(n: number) {
    setBusy(true)
    try {
      await saveAppReview({ section: 'general', stars: n })
      setStars(n)
      setThanks(true)
      writeDismissedUntil(REVIEW_INVITE_NEVER_ISO)
    } catch {
      setVisible(false)
    } finally {
      setBusy(false)
    }
  }

  if (thanks) {
    return (
      <div className="card review-invite" role="status">
        <strong>¡Gracias por valorarnos!</strong>
        <p className="muted" style={{ margin: 0 }}>
          Si quieres, cuéntanos qué te gusta y qué no.
        </p>
        <div className="inline-fields">
          <button type="button" onClick={() => navigate('/resenas')}>
            Añadir comentario
          </button>
          <button type="button" className="link-button" onClick={() => setVisible(false)}>
            Cerrar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="card review-invite">
      <strong>¿Qué tal te va con PEPA?</strong>
      <p className="muted" style={{ margin: 0 }}>
        Llevas unos días con nosotros. Tócalas para valorar de 1 a 5 estrellas.
      </p>
      <StarPicker value={stars} label="la app en general" disabled={busy} onPick={pick} />
      <div className="inline-fields">
        <button
          type="button"
          className="link-button"
          onClick={() => {
            writeDismissedUntil(snoozeUntil(new Date()))
            setVisible(false)
          }}
        >
          Ahora no
        </button>
        <button
          type="button"
          className="link-button"
          onClick={() => {
            writeDismissedUntil(REVIEW_INVITE_NEVER_ISO)
            setVisible(false)
          }}
        >
          No volver a preguntar
        </button>
      </div>
    </div>
  )
}
