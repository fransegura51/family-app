import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { communityStatus, getMyCommunityProfile, requestReadmission } from '@/data/community'
import { communityErrorText } from '@/domain/communityErrors'
import type { CommunityStatus, MyCommunityProfile } from '@/domain/community'
import { AliasDialog } from '@/ui/community/AliasDialog'

// Estado de Comunidad para todas las pantallas: si está abierta (o solo para administración), el perfil público de quien mira (alias, expulsión) y la forma
// única de pedir «¿puede participar?» justo antes de publicar, comentar, valorar, seguir o guardar: si aún no tiene alias, se le pide en ese momento (y se le
// enseñan las normas la primera vez). Leer no exige nada.
export interface CommunityContextValue {
  status: CommunityStatus | null
  me: MyCommunityProfile | null
  loading: boolean
  refresh: () => Promise<void>
  // true = ya puede participar. false = canceló, o está expulsado/a (se le explica).
  requireParticipation: () => Promise<boolean>
}

const CommunityContext = createContext<CommunityContextValue | null>(null)

export function useCommunity(): CommunityContextValue {
  const ctx = useContext(CommunityContext)
  if (!ctx) throw new Error('useCommunity debe usarse dentro de CommunityProvider')
  return ctx
}

export function CommunityProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<CommunityStatus | null>(null)
  const [me, setMe] = useState<MyCommunityProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [aliasOpen, setAliasOpen] = useState(false)
  const [banOpen, setBanOpen] = useState(false)
  const pending = useRef<((ok: boolean) => void) | null>(null)
  const meRef = useRef<MyCommunityProfile | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([communityStatus(), getMyCommunityProfile()])
      setStatus(s)
      setMe(p)
      meRef.current = p
    } catch {
      // Sin red: se queda lo que hubiera.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const requireParticipation = useCallback(async () => {
    let current = meRef.current
    if (!current) {
      try {
        current = await getMyCommunityProfile()
        setMe(current)
        meRef.current = current
      } catch {
        return false
      }
    }
    if (current?.hasProfile && current.rulesAccepted) {
      if (current.banState && current.banState !== 'ok') {
        setBanOpen(true)
        return false
      }
      return true
    }
    return new Promise<boolean>((resolve) => {
      pending.current = resolve
      setAliasOpen(true)
    })
  }, [])

  const value = useMemo(() => ({ status, me, loading, refresh, requireParticipation }), [status, me, loading, refresh, requireParticipation])

  return (
    <CommunityContext.Provider value={value}>
      {children}
      {aliasOpen && (
        <AliasDialog
          current={me}
          onDone={async () => {
            setAliasOpen(false)
            await refresh()
            pending.current?.(true)
            pending.current = null
          }}
          onCancel={() => {
            setAliasOpen(false)
            pending.current?.(false)
            pending.current = null
          }}
        />
      )}
      {banOpen && <BanNotice me={me} onClose={() => setBanOpen(false)} onChanged={refresh} />}
    </CommunityContext.Provider>
  )
}

function BanNotice({ me, onClose, onChanged }: { me: MyCommunityProfile | null; onClose: () => void; onChanged: () => Promise<void> }) {
  const [message, setMessage] = useState<string | null>(null)
  const readmission = me?.banState === 'readmission'
  const requested = me?.readmissionStatus === 'requested'
  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="modal-sheet" role="dialog" aria-modal="true" aria-label="No puedes participar ahora" onClick={(e) => e.stopPropagation()}>
        <h2>No puedes participar ahora</h2>
        {!readmission && (
          <p>
            Tu acceso a Comunidad está en pausa
            {me?.banEndsAt ? ` hasta el ${new Date(me.banEndsAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}. Puedes seguir
            leyendo. Tu cuenta de PEPA y los datos de tu familia no se ven afectados.
          </p>
        )}
        {readmission && (
          <p>
            Ya ha pasado el plazo. Para volver a participar tienes que pedir la readmisión y la revisará la administración. Puedes seguir leyendo mientras tanto.
          </p>
        )}
        {message && <p className="muted">{message}</p>}
        <div className="modal-actions">
          {readmission && !requested && (
            <button
              type="button"
              className="primary"
              onClick={async () => {
                try {
                  await requestReadmission()
                  setMessage('Solicitud enviada. Te avisaremos cuando se revise.')
                  await onChanged()
                } catch (e) {
                  setMessage(communityErrorText(e))
                }
              }}
            >
              Pedir la readmisión
            </button>
          )}
          {readmission && requested && <p className="muted">Tu solicitud de readmisión está pendiente de revisión.</p>}
          <button type="button" className="link-button" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
