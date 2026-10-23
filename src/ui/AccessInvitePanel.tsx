import { useEffect, useState } from 'react'
import { createMemberInvitation, type MemberInvitation } from '@/data/invitations'
import { buildInvitationMessage, formatInvitationExpiry, invitationErrorMessage, whatsappShareUrl } from '@/domain/invitations'
import { errorMessage } from '@/domain/errorMessage'
import type { FamilyMember } from '@/domain/types'
import { ConfirmButton } from '@/ui/ConfirmButton'

// «Dar acceso a PEPA»: genera (o recupera) la invitación para que una persona cree su propia cuenta y se una a su ficha. PEPA es privada: sin esta invitación no se puede crear la cuenta.
// Reutiliza la invitación vigente en vez de crear otra, enseña cuándo caduca (24 horas, un solo uso) y deja copiar o compartir el texto con las instrucciones.
// Quién puede pedirla lo decide el SERVIDOR (administradora de la familia, o madre/padre vinculado solo para su hijo menor); esta pantalla solo la enseña a quien corresponde.
// Es un código de INVITACIÓN: no tiene nada que ver con el código de 6 cifras del correo.
export function AccessInvitePanel({ member, inviterName, autoStart = false, onClose }: { member: Pick<FamilyMember, 'id' | 'name'>; inviterName?: string; autoStart?: boolean; onClose?: () => void }) {
  const [invite, setInvite] = useState<MemberInvitation | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function generate(regenerate: boolean) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      setInvite(await createMemberInvitation(member.id, regenerate))
    } catch (err) {
      setError(invitationErrorMessage(err) ?? errorMessage(err, 'No se pudo generar la invitación'))
    } finally {
      setBusy(false)
    }
  }

  // «¿Quieres darle acceso ahora?» → sí: se genera al abrirse (una vez).
  useEffect(() => {
    if (autoStart) void generate(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const appUrl = window.location.origin + import.meta.env.BASE_URL
  const message = invite
    ? buildInvitationMessage({ kind: 'member', code: invite.code, expiresAt: invite.expiresAt, appUrl, inviterName: inviterName || null, recipientName: member.name })
    : ''

  async function copy() {
    try {
      await navigator.clipboard.writeText(message)
      setNotice('✓ Copiado. Pégalo en un mensaje.')
    } catch {
      setNotice('No se pudo copiar automáticamente: selecciona el texto de abajo y cópialo.')
    }
  }

  async function share() {
    try {
      await navigator.share({ text: message })
    } catch {
      // La persona canceló o el navegador no lo permite: no es un error.
    }
  }

  if (!invite) {
    return (
      <div className="member-card-actions">
        <button type="button" className="link-button" onClick={() => generate(false)} disabled={busy} data-help-id="family.give-access">
          {busy ? 'Generando…' : '🔑 Dar acceso a PEPA'}
        </button>
        {error && <p className="error">{error}</p>}
        {onClose && (
          <button type="button" className="link-button" onClick={onClose}>
            Ahora no
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="card" style={{ marginTop: 8, padding: 12 }}>
      <p className="muted" style={{ margin: 0 }}>
        Invitación para que {member.name} cree su cuenta en PEPA:
      </p>
      <p style={{ fontSize: 22, fontWeight: 700, letterSpacing: 2, margin: '4px 0' }}>{invite.code}</p>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Caduca {formatInvitationExpiry(invite.expiresAt)} · un solo uso
        {invite.reused ? ' · Ya había una invitación vigente: es esta (no se ha creado otra).' : ''}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
        <button type="button" className="link-button" onClick={copy}>
          📋 Copiar
        </button>
        {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
          <button type="button" className="link-button" onClick={share}>
            📤 Compartir
          </button>
        )}
        <a className="link-button" href={whatsappShareUrl(message)} target="_blank" rel="noreferrer">
          💬 WhatsApp
        </a>
        <ConfirmButton
          label="🔄 Generar otra"
          confirmLabel="Generar otra"
          confirmMessage="La invitación anterior dejará de valer. ¿Generar otra?"
          onConfirm={() => void generate(true)}
        />
      </div>
      {notice && <p className="muted">{notice}</p>}
      {error && <p className="error">{error}</p>}
      <pre className="muted" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, marginTop: 8 }}>
        {message}
      </pre>
      {onClose && (
        <button type="button" className="link-button" onClick={onClose}>
          Cerrar
        </button>
      )}
    </div>
  )
}
