import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { communityStatus, getMyCommunityProfile, requestReadmission } from '@/data/community'
import { communityErrorText, onCommunityAccessError, type CommunityAccessErrorCode } from '@/domain/communityErrors'
import type { CommunityStatus, MyCommunityProfile } from '@/domain/community'
import {
  accessErrorNotice,
  accessFromStatus,
  canParticipateLevel,
  canReadLevel,
  type AccessNotice,
  type CommunityAccess,
} from '@/domain/communityAccess'
import { AliasDialog } from '@/ui/community/AliasDialog'

// Estado de Comunidad para todas las pantallas: si está abierta (o solo para administración), el perfil público de quien mira (alias, expulsión), el ACCESO por
// edad y permisos de la familia (ninguno / solo lectura / completo; migración 0277) y la forma única de pedir «¿puede participar?» justo antes de publicar,
// comentar, valorar, seguir o guardar: si aún no tiene alias, se le pide en ese momento (y se le enseñan las normas la primera vez). Leer no exige nada.
export interface CommunityContextValue {
  status: CommunityStatus | null
  me: MyCommunityProfile | null
  loading: boolean
  refresh: () => Promise<void>
  // Acceso actual (sale de `status`, sin otra consulta). Mientras no se sabe se considera completo: el servidor decide y la pantalla se corrige sola.
  access: CommunityAccess
  canRead: boolean
  canParticipate: boolean
  // Vuelve a pedir el estado al servidor (una consulta) y devuelve el acceso que corresponde ahora. Se llama sola si el servidor rechaza una acción.
  refreshAccess: () => Promise<CommunityAccess>
  // true = ya puede participar. false = canceló, está en solo lectura o sin acceso, o está expulsado/a (se le explica).
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
  const [accessNotice, setAccessNotice] = useState<AccessNotice | null>(null)
  const access = useMemo(() => accessFromStatus(status), [status])
  const accessRef = useRef(access)
  accessRef.current = access
  const accessBusy = useRef(false)

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

  // Solo el estado (una consulta): ya trae el acceso y si Comunidad sigue visible para esta persona.
  const refreshAccess = useCallback(async (): Promise<CommunityAccess> => {
    try {
      const s = await communityStatus()
      setStatus(s)
      const next = accessFromStatus(s)
      accessRef.current = next
      return next
    } catch {
      return accessRef.current // Sin red: se queda lo que hubiera.
    }
  }, [])

  // El servidor rechaza una acción con COMMUNITY_ACCESS_DENIED / PARTICIPATION_NOT_ALLOWED (la familia cambió los permisos con la sesión abierta): se vuelve a
  // consultar el acceso (la pantalla pasa sola a «solo lectura» o a «no disponible») y se avisa una vez, con amabilidad. Varios errores seguidos → un solo aviso.
  useEffect(() => {
    return onCommunityAccessError((code: CommunityAccessErrorCode) => {
      if (accessBusy.current) return
      accessBusy.current = true
      void refreshAccess()
        .then((next) => {
          // Sin acceso, la pantalla «Comunidad no está disponible» ya lo explica: no se apila un diálogo encima.
          if (next.level !== 'none') setAccessNotice(accessErrorNotice(code, next.level, next.reason))
        })
        .finally(() => {
          accessBusy.current = false
        })
    })
  }, [refreshAccess])

  const requireParticipation = useCallback(async () => {
    // Red de seguridad: si por cualquier motivo se llega aquí sin permiso para participar, se explica en vez de intentar nada.
    const level = accessRef.current.level
    if (level !== 'participate') {
      setAccessNotice(accessErrorNotice(level === 'none' ? 'COMMUNITY_ACCESS_DENIED' : 'PARTICIPATION_NOT_ALLOWED', level, accessRef.current.reason))
      return false
    }
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

  const value = useMemo(
    () => ({
      status,
      me,
      loading,
      refresh,
      access,
      canRead: canReadLevel(access.level),
      canParticipate: canParticipateLevel(access.level),
      refreshAccess,
      requireParticipation,
    }),
    [status, me, loading, refresh, access, refreshAccess, requireParticipation],
  )

  return (
    <CommunityContext.Provider value={value}>
      {children}
      {accessNotice && <AccessNoticeDialog notice={accessNotice} onClose={() => setAccessNotice(null)} />}
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

// Aviso amable cuando cambian los permisos (o no se tienen) y se intentó participar. Nunca bloquea la lectura.
function AccessNoticeDialog({ notice, onClose }: { notice: AccessNotice; onClose: () => void }) {
  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="modal-sheet" role="alertdialog" aria-modal="true" aria-label={notice.title} onClick={(e) => e.stopPropagation()}>
        <h2>{notice.title}</h2>
        <p>{notice.text}</p>
        <div className="modal-actions">
          <button type="button" className="primary" onClick={onClose}>
            Entendido
          </button>
        </div>
      </div>
    </div>
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
