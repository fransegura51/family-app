import { useEffect, useRef, useState, type RefObject } from 'react'
import { reportClientError } from '@/data/errorReports'
import { createMemberLocationToken, listMemberLocationTokenStatus, ownTracksEndpointUrl, revokeMemberLocationToken, type LocationTokenStatus } from '@/data/locationToken'
import { errorMessage } from '@/domain/errorMessage'
import { ownTracksConfigLink, OWNTRACKS_ANDROID_STORE_URL, OWNTRACKS_IOS_STORE_URL } from '@/domain/owntracksConfig'
import { isIos } from '@/services/notifications'
import { describePositionAge } from '@/domain/positionFreshness'
import type { FamilyMember, LocationConsent } from '@/domain/types'
import { ConfirmButton } from '@/ui/ConfirmButton'
import { MemberAvatar } from '@/ui/MemberAvatar'

// Ubicación con la app cerrada. La web instalada de PEPA solo manda la posición mientras la app está abierta: con el
// móvil bloqueado no llega nada, y por eso los avisos de llegada/salida salían horas tarde. OwnTracks (app gratuita,
// iPhone y Android) sí lee el GPS en segundo plano y la manda a PEPA. Aquí se conecta cada persona en un par de
// toques. Solo se ofrece a quien puede gestionar ese miembro (él mismo o un admin) y si su ubicación está activada.

interface Setup {
  memberId: string
  memberName: string
  token: string
}

// Una web no puede instalar una app por sí sola: el botón abre la ficha de OwnTracks en la tienda de ESTE móvil, donde
// solo queda tocar «Obtener» / «Instalar». El botón del sistema que se está usando va primero y destacado.
export function InstallOwnTracksButtons() {
  const ios = isIos()
  const iosButton = (
    <a key="ios" className={ios ? 'chip chip-active' : 'chip'} href={OWNTRACKS_IOS_STORE_URL} target="_blank" rel="noreferrer">
      📱 Instalar en iPhone (App Store)
    </a>
  )
  const androidButton = (
    <a key="android" className={ios ? 'chip' : 'chip chip-active'} href={OWNTRACKS_ANDROID_STORE_URL} target="_blank" rel="noreferrer">
      🤖 Instalar en Android (Google Play)
    </a>
  )
  return (
    <div className="filter-row" style={{ margin: '12px 0' }}>
      {ios ? [iosButton, androidButton] : [androidButton, iosButton]}
    </div>
  )
}

const CONNECT_TIMEOUT_MS = 15_000

// Si el servidor no contesta, que se vea en rojo en vez de quedarse en «Generando…» para siempre.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('El servidor no contesta (más de 15 s). Revisa la conexión e inténtalo de nuevo.')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err: unknown) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

export function BackgroundLocationSetup({ members, consents }: { members: FamilyMember[]; consents: LocationConsent[] }) {
  const [statuses, setStatuses] = useState<LocationTokenStatus[]>([])
  const [setup, setSetup] = useState<Setup | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)

  // El recuadro de pasos y los errores salen arriba de la lista: la pantalla va sola hasta ellos (si no, quedaban fuera de la vista
  // y parecía que «no pasaba nada»).
  function scrollSoon(ref: RefObject<HTMLElement>) {
    setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
  }

  function reloadStatuses() {
    listMemberLocationTokenStatus()
      .then(setStatuses)
      .catch((e: Error) => setError(e.message))
  }

  useEffect(reloadStatuses, [])

  async function handleConnect(member: FamilyMember) {
    setBusy(member.id)
    setError(null)
    // Rastro para diagnosticar desde fuera (client_errors): demuestra que la pulsación llega y con qué versión de la pantalla.
    void reportClientError(new Error('[owntracks] pulsado Conectar ui=v3'))
    try {
      const token = await withTimeout(createMemberLocationToken(member.id), CONNECT_TIMEOUT_MS)
      void reportClientError(new Error('[owntracks] código generado ui=v3'))
      setSetup({ memberId: member.id, memberName: member.name, token })
      reloadStatuses()
      scrollSoon(panelRef)
    } catch (err) {
      const message = errorMessage(err, 'No se pudo generar el código')
      setError(message)
      scrollSoon(errorRef)
      // Queda registrado para poder ver desde fuera por qué falló en un móvil concreto.
      void reportClientError(new Error('[owntracks] conectar falló: ' + message))
    } finally {
      setBusy(null)
    }
  }

  async function handleDisconnect(member: FamilyMember) {
    setError(null)
    try {
      await revokeMemberLocationToken(member.id)
      if (setup?.memberId === member.id) setSetup(null)
      reloadStatuses()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo desconectar'))
    }
  }

  async function copy(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      setTimeout(() => setCopied((c) => (c === label ? null : c)), 2000)
    } catch {
      setError('No se pudo copiar; selecciona el texto a mano.')
    }
  }

  return (
    <div>
      <h2 className="section-title">Ubicación con la app cerrada</h2>
      <p className="muted">
        La web de PEPA solo envía la posición mientras la tienes abierta. Para que se sepa dónde estás (y salgan los avisos de llegada y
        salida) con el móvil bloqueado, instala <strong>OwnTracks</strong> (gratuita, iPhone y Android) y conéctala aquí.
      </p>
      <InstallOwnTracksButtons />
      {error && (
        <p className="error" role="alert" ref={errorRef}>
          {error}
        </p>
      )}

      {setup && (
        <div className="card member-form" ref={panelRef}>
          <strong>Conectar a {setup.memberName}: hazlo desde SU móvil</strong>
          <ol className="muted" style={{ paddingLeft: 20 }}>
            <li>
              Instala <strong>OwnTracks</strong> con los botones de arriba (te llevan a la tienda de tu móvil: toca «Obtener» o «Instalar»).
            </li>
            <li>
              Pulsa{' '}
              <a className="link-button" href={ownTracksConfigLink({ endpointUrl: ownTracksEndpointUrl(), memberId: setup.memberId, token: setup.token, memberName: setup.memberName })}>
                Abrir en OwnTracks
              </a>{' '}
              (debe abrirse la app y preguntar si importa la configuración: acepta).
            </li>
            <li>Cuando el móvil pregunte por la ubicación, elige «Permitir siempre» (en iPhone: «Siempre») y deja activada la ubicación precisa.</li>
            <li>En Android, desactiva el ahorro de batería para OwnTracks; si no, el sistema la duerme y no manda nada.</li>
          </ol>
          <p className="muted">
            Si el enlace no abre la app, en OwnTracks ve a Ajustes → Conexión, elige modo «HTTP» y pega estos datos (el código solo se muestra ahora;
            si lo pierdes, vuelve a conectar):
          </p>
          <div className="filter-row">
            <button type="button" className="chip" onClick={() => copy('url', ownTracksEndpointUrl())}>
              {copied === 'url' ? 'Copiado' : 'Copiar dirección'}
            </button>
            <button type="button" className="chip" onClick={() => copy('user', setup.memberId)}>
              {copied === 'user' ? 'Copiado' : 'Copiar usuario'}
            </button>
            <button type="button" className="chip" onClick={() => copy('pass', setup.token)}>
              {copied === 'pass' ? 'Copiado' : 'Copiar contraseña'}
            </button>
          </div>
          <button type="button" className="link-button" onClick={() => setSetup(null)}>
            Ocultar estos datos
          </button>
        </div>
      )}

      <div className="event-list">
        {members.map((m) => {
          const enabled = consents.find((c) => c.memberId === m.id)?.enabled ?? false
          const status = statuses.find((s) => s.memberId === m.id)
          const last = status?.lastUsedAt ? describePositionAge(status.lastUsedAt, Date.now()) : null
          return (
            <div key={m.id} className="card task-card">
              <MemberAvatar member={m} size={32} />
              <div className="task-card-main">
                <strong>{m.name}</strong>
                <p className="muted">
                  {!enabled
                    ? 'Activa antes su ubicación arriba.'
                    : !status
                      ? 'No conectada.'
                      : last
                        ? `Conectada · último dato ${last.ageLabel}`
                        : 'Código creado, todavía sin ningún dato. Abre OwnTracks en su móvil.'}
                </p>
              </div>
              {enabled && (
                <button type="button" className="task-toggle" disabled={busy === m.id} onClick={() => handleConnect(m)}>
                  {busy === m.id ? 'Generando…' : status ? 'Volver a conectar' : 'Conectar'}
                </button>
              )}
              {status && <ConfirmButton onConfirm={() => handleDisconnect(m)} label="Desconectar" confirmMessage="¿Dejar de recibir su posición con la app cerrada?" />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
