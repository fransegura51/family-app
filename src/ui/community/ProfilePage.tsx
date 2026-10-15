import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { blockUser, followUser, getMedals, getPublicProfile, listFollowing, listPosts, unblockUser, unfollowUser } from '@/data/community'
import type { CommunityCardItem, FollowMode, MedalsView, PublicProfileInfo } from '@/domain/community'
import { communityErrorText } from '@/domain/communityErrors'
import { useCommunityAccess } from '@/ui/community/useCommunityAccess'
import { DEFAULT_FOLLOW_MODE, FOLLOW_MODES, constancyText, earnedMedals, formatLongDate } from '@/domain/communityProfile'
import { Breadcrumbs } from '@/ui/community/Breadcrumbs'
import { useCommunity } from '@/ui/community/CommunityProvider'
import { pageCrumbs, paths } from '@/ui/community/communityNav'
import { PostCardView } from '@/ui/community/PostCardView'
import { CommunityAvatar, ConfirmDialog, ReportUserDialog } from '@/ui/community/ProfileParts'
import '@/ui/community/communityProfile.css'

const PAGE_SIZE = 10

type Tab = 'todo' | 'recetas'

// Perfil público (sec. 1 punto 5 y sec. 8): SOLO alias, icono, publicaciones, recetas, valoraciones dadas y medallas. Nunca datos de la familia, nombres
// reales, seguidores como ranking ni mensajes privados (el servidor ni siquiera los envía).
export function ProfilePage() {
  const { id = '' } = useParams()
  const { requireParticipation } = useCommunity()
  // Con permiso solo de lectura se puede ver el perfil, pero no seguir, bloquear, desbloquear ni denunciar.
  const { canParticipate } = useCommunityAccess()
  // undefined = cargando; null = no disponible (usuario eliminado o inexistente)
  const [profile, setProfile] = useState<PublicProfileInfo | null | undefined>(undefined)
  const [medals, setMedals] = useState<MedalsView | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [followMode, setFollowMode] = useState<FollowMode>(DEFAULT_FOLLOW_MODE)
  const [confirmBlock, setConfirmBlock] = useState(false)
  const [reporting, setReporting] = useState(false)
  // Evita que una respuesta lenta de un perfil anterior pise al actual si la persona navega de un perfil a otro.
  const current = useRef(id)
  current.current = id

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const p = await getPublicProfile(id)
      if (current.current !== id) return
      setProfile(p)
      setMedals(null)
      if (p && !p.blockedByMe && !p.isOfficial) {
        // Las medallas solo se piden si hay perfil visible (una llamada más, no en bucle).
        getMedals(id).then(
          (m) => {
            if (current.current === id) setMedals(m)
          },
          () => undefined,
        )
      }
      if (p?.following) {
        // El perfil solo dice «la sigo»: el modo de aviso concreto está en la lista de personas seguidas (se pide solo si hace falta).
        listFollowing().then(
          (list) => {
            const mine = list.find((f) => f.id === id)
            if (mine && current.current === id) setFollowMode(mine.notifyMode)
          },
          () => undefined,
        )
      } else {
        setFollowMode(DEFAULT_FOLLOW_MODE)
      }
    } catch (e) {
      if (current.current === id) setLoadError(communityErrorText(e))
    }
  }, [id])

  useEffect(() => {
    setProfile(undefined)
    setActionError(null)
    void load()
  }, [load])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setActionError(null)
    try {
      await action()
    } catch (e) {
      setActionError(communityErrorText(e))
    } finally {
      setBusy(false)
    }
  }

  const follow = () =>
    run(async () => {
      if (!(await requireParticipation())) return
      await followUser(id, DEFAULT_FOLLOW_MODE)
      setFollowMode(DEFAULT_FOLLOW_MODE)
      setProfile((p) => (p ? { ...p, following: true } : p))
    })

  const unfollow = () =>
    run(async () => {
      await unfollowUser(id)
      setProfile((p) => (p ? { ...p, following: false } : p))
    })

  const changeMode = (mode: FollowMode) =>
    run(async () => {
      if (!(await requireParticipation())) return
      await followUser(id, mode)
      setFollowMode(mode)
    })

  const block = () =>
    run(async () => {
      if (!(await requireParticipation())) {
        setConfirmBlock(false)
        return
      }
      await blockUser(id)
      setConfirmBlock(false)
      await load()
    })

  const unblock = () =>
    run(async () => {
      await unblockUser(id)
      await load()
    })

  const crumbs = <Breadcrumbs crumbs={pageCrumbs('Perfil')} />

  if (loadError) {
    return (
      <>
        {crumbs}
        <p className="error" role="alert">
          {loadError}
        </p>
        <button type="button" className="link-button" onClick={() => void load()}>
          Volver a intentarlo
        </button>
      </>
    )
  }
  if (profile === undefined) {
    return (
      <>
        {crumbs}
        <p className="muted" role="status">
          Cargando perfil…
        </p>
      </>
    )
  }
  // Usuario eliminado o que no existe: mensaje neutro, sin revelar nada.
  if (profile === null) {
    return (
      <>
        {crumbs}
        <h1>Este perfil ya no está disponible</h1>
        <p className="muted">Puede que la persona haya eliminado su cuenta o que el enlace no sea correcto.</p>
        <Link to={paths.home} className="link-button">
          Volver a la portada de Comunidad
        </Link>
      </>
    )
  }
  // Persona bloqueada por mí: capa neutra, sin contenido real debajo.
  if (profile.blockedByMe) {
    return (
      <>
        {crumbs}
        <div className="community-blocked-card" role="group" aria-label="Perfil de usuario bloqueado por ti">
          <p>Contenido de usuario bloqueado por ti</p>
          <button type="button" className="link-button" disabled={busy || !canParticipate} onClick={() => void unblock()}>
            Desbloquear
          </button>
          {actionError && (
            <p className="error" role="alert">
              {actionError}
            </p>
          )}
        </div>
      </>
    )
  }

  const alias = profile.alias ?? 'Alguien'
  const earned = earnedMedals(medals)
  // El servidor no deja seguir a las cuentas oficiales (Pepa / Equipo PEPA) y tampoco se bloquean ni se denuncian como una persona.
  const canFollow = canParticipate && !profile.isMe && !profile.isOfficial && profile.canInteract !== false
  const canModerate = canParticipate && !profile.isMe && !profile.isOfficial

  return (
    <>
      {crumbs}
      <header className="community-profile-head">
        <CommunityAvatar alias={alias} emoji={profile.avatarEmoji} size="lg" />
        <div>
          <h1 className="community-profile-name">{alias}</h1>
          {profile.isOfficial && <span className="community-tag-official">Cuenta oficial</span>}
          {profile.memberSince && <p className="muted">En Comunidad desde {formatLongDate(profile.memberSince)}</p>}
        </div>
      </header>

      <ul className="community-profile-stats" aria-label="Resumen del perfil">
        <li>
          <strong>{profile.postCount ?? 0}</strong>
          <span>Publicaciones</span>
        </li>
        <li>
          <strong>{profile.recipeCount ?? 0}</strong>
          <span>Recetas</span>
        </li>
        <li>
          <strong>{profile.ratingCount ?? 0}</strong>
          <span>Valoraciones dadas</span>
        </li>
      </ul>

      {profile.isMe && (
        <p className="card">
          Este es tu perfil público, tal como lo ven las demás familias.{' '}
          <Link to={paths.myProfile} className="link-button">
            Cambiar mi alias y mis ajustes
          </Link>
        </p>
      )}

      {canFollow && (
        <div className="community-profile-actions">
          {profile.following ? (
            <button type="button" disabled={busy} onClick={() => void unfollow()}>
              Dejar de seguir
            </button>
          ) : (
            <button type="button" className="primary" disabled={busy} onClick={() => void follow()}>
              Seguir
            </button>
          )}
        </div>
      )}
      {canFollow && profile.following && (
        <label className="community-profile-mode">
          Avisos de {alias}
          <select value={followMode} disabled={busy} onChange={(e) => void changeMode(e.target.value as FollowMode)} aria-describedby="follow-mode-help">
            {FOLLOW_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <span id="follow-mode-help" className="muted">
            {FOLLOW_MODES.find((m) => m.id === followMode)?.help}
          </span>
        </label>
      )}
      {canModerate && (
        <div className="community-profile-actions secondary">
          <button type="button" className="link-button" disabled={busy} onClick={() => setConfirmBlock(true)}>
            Bloquear
          </button>
          <button type="button" className="link-button" onClick={() => setReporting(true)}>
            Denunciar
          </button>
        </div>
      )}
      {actionError && !confirmBlock && (
        <p className="error" role="alert">
          {actionError}
        </p>
      )}

      {!profile.isOfficial && (
        <section className="card" aria-labelledby="profile-medals">
          <h2 id="profile-medals">Medallas</h2>
          {medals === null && <p className="muted">Cargando medallas…</p>}
          {medals && earned.length === 0 && <p className="muted">Todavía no tiene ninguna medalla.</p>}
          {earned.length > 0 && (
            <ul className="community-medal-chips">
              {earned.map((m) => (
                <li key={m.key} className="community-medal-chip" title={m.description}>
                  🏅 {m.name}
                </li>
              ))}
            </ul>
          )}
          {medals?.constancy && <p className="community-constancy-line">🔥 {constancyText(medals.constancy)}</p>}
        </section>
      )}

      <ProfilePosts profileId={id} recipeCount={profile.recipeCount ?? 0} alias={alias} />

      {confirmBlock && (
        <ConfirmDialog title={`¿Bloquear a ${alias}?`} confirmLabel="Sí, bloquear" busy={busy} error={actionError} onConfirm={() => void block()} onCancel={() => setConfirmBlock(false)}>
          <p>No verás sus publicaciones ni comentarios y no podréis interactuar. No se le avisa. Puedes desbloquear a esta persona cuando quieras, desde su perfil o desde «Mi perfil».</p>
        </ConfirmDialog>
      )}
      {reporting && <ReportUserDialog profileId={id} onClose={() => setReporting(false)} />}
    </>
  )
}

// Publicaciones del perfil: «Todo lo publicado» (con recetas incluidas) y «Recetas» (se pide solo si se abre esa pestaña), con paginación.
function ProfilePosts({ profileId, recipeCount, alias }: { profileId: string; recipeCount: number; alias: string }) {
  const [tab, setTab] = useState<Tab>('todo')
  const [lists, setLists] = useState<Record<Tab, { items: CommunityCardItem[]; done: boolean; loaded: boolean }>>({
    todo: { items: [], done: false, loaded: false },
    recetas: { items: [], done: false, loaded: false },
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadMore = useCallback(
    async (which: Tab, offset: number) => {
      setLoading(true)
      setError(null)
      try {
        const page = await listPosts({ author: profileId, kind: which === 'recetas' ? 'receta' : null, limit: PAGE_SIZE, offset })
        setLists((prev) => ({
          ...prev,
          [which]: { items: offset === 0 ? page : [...prev[which].items, ...page], done: page.length < PAGE_SIZE, loaded: true },
        }))
      } catch (e) {
        setError(communityErrorText(e))
      } finally {
        setLoading(false)
      }
    },
    [profileId],
  )

  useEffect(() => {
    setLists({ todo: { items: [], done: false, loaded: false }, recetas: { items: [], done: false, loaded: false } })
    setTab('todo')
    void loadMore('todo', 0)
  }, [loadMore])

  const list = lists[tab]

  function choose(next: Tab) {
    setTab(next)
    // La lista de recetas solo se pide la primera vez que se abre.
    if (!lists[next].loaded) void loadMore(next, 0)
  }

  return (
    <section aria-labelledby="profile-posts">
      <h2 id="profile-posts">Lo que ha compartido</h2>
      <div className="community-profile-tabs" role="group" aria-label="Qué ver">
        <button type="button" aria-pressed={tab === 'todo'} className={tab === 'todo' ? 'active' : ''} onClick={() => choose('todo')}>
          Todo lo publicado
        </button>
        <button type="button" aria-pressed={tab === 'recetas'} className={tab === 'recetas' ? 'active' : ''} onClick={() => choose('recetas')}>
          Recetas ({recipeCount})
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="community-card-list">
        {list.items.map((item) => (
          <PostCardView key={item.id} item={item} onUnblocked={() => void loadMore(tab, 0)} />
        ))}
      </div>
      {!list.loaded && loading && <p className="muted">Cargando…</p>}
      {list.loaded && list.items.length === 0 && (
        <p className="muted">{tab === 'recetas' ? `${alias} todavía no ha publicado recetas.` : `${alias} todavía no ha publicado nada.`}</p>
      )}
      {list.loaded && !list.done && (
        <button type="button" className="link-button" disabled={loading} onClick={() => void loadMore(tab, list.items.length)}>
          {loading ? 'Cargando…' : 'Ver más'}
        </button>
      )}
    </section>
  )
}
