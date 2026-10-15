import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  deleteMyCommunityContent,
  followUser,
  getCommunityUserPrefs,
  getFavoriteTopics,
  listBlocks,
  listCommunityTopics,
  listFollowing,
  listMyComments,
  listMyRemovalRequests,
  listPosts,
  requestContentRemoval,
  requestReadmission,
  setCommunityUserPrefs,
  setFavoriteTopics,
  unblockUser,
  unfollowUser,
  type CommunityUserPrefs,
  type MyCommentItem,
  type MyRemovalRequest,
} from '@/data/community'
import { getNotificationPrefs, saveNotificationPrefs } from '@/data/notifications'
import { COMMENT_ORDER_LABELS, SECTIONS, type CommentOrder, type CommunityCardItem, type CommunityTopic, type FollowMode } from '@/domain/community'
import { communityErrorText } from '@/domain/communityErrors'
import {
  FOLLOW_MODES,
  REMOVAL_SENT_TEXT,
  banNotice,
  commentOptionLabel,
  followModeLabel,
  removalRequestTitle,
  removalStatusLabel,
  validateRemovalRequest,
  type RemovalScope,
  type RemovalTargetKind,
} from '@/domain/communityProfile'
import type { NotificationPrefs } from '@/domain/notificationPrefs'
import { AliasDialog } from '@/ui/community/AliasDialog'
import { Breadcrumbs } from '@/ui/community/Breadcrumbs'
import { CommunityNoticePrefs } from '@/ui/community/CommunityNoticePrefs'
import { useCommunity } from '@/ui/community/CommunityProvider'
import { pageCrumbs, paths } from '@/ui/community/communityNav'
import { PostCardView } from '@/ui/community/PostCardView'
import { CommunityAvatar } from '@/ui/community/ProfileParts'
import '@/ui/community/communityProfile.css'

// Mi perfil y ajustes de Comunidad (sec. 1 punto 4-6, 8, 10 y COM-144). Cada bloque se pliega y SOLO pide sus datos la primera vez que se abre: así la pantalla
// no hace una avalancha de consultas al entrar (a Jennifer le preocupa el coste de Supabase).
export function MySettingsPage() {
  const { me, loading, refresh, requireParticipation } = useCommunity()
  const [aliasOpen, setAliasOpen] = useState(false)
  const notice = banNotice(me)
  const hasProfile = me?.hasProfile === true && !!me.id

  return (
    <>
      <Breadcrumbs crumbs={pageCrumbs('Mi perfil')} />
      <h1>Mi perfil y ajustes</h1>

      {notice && <BanBox notice={notice} onChanged={refresh} />}

      <Section id="perfil" title="Mi alias y mi icono" defaultOpen>
        {loading && !me && <p className="muted">Cargando…</p>}
        {!loading && !hasProfile && (
          <>
            <p>Todavía no tienes alias público. Solo lo necesitas para publicar, comentar, valorar o seguir; para leer no hace falta.</p>
            <button type="button" className="primary" onClick={() => void requireParticipation().then(() => refresh())}>
              Elegir mi alias
            </button>
          </>
        )}
        {hasProfile && me && (
          <>
            <div className="community-profile-head">
              <CommunityAvatar alias={me.alias} emoji={me.avatarEmoji} size="lg" />
              <div>
                <p className="community-profile-name">{me.alias}</p>
                <p className="muted">Es lo único que ven las demás familias de ti. No es tu nombre real ni el de tu familia.</p>
              </div>
            </div>
            <div className="community-settings-links">
              <button type="button" onClick={() => setAliasOpen(true)}>
                Cambiar alias o icono
              </button>
              <Link to={paths.profile(me.id!)} className="link-button">
                Ver mi perfil público
              </Link>
              <Link to={paths.medals} className="link-button">
                Mis medallas
              </Link>
            </div>
            <p className="muted">Si cambias de alias, tus publicaciones, comentarios, medallas y a quienes sigues se conservan: tu identidad sigue siendo la misma.</p>
          </>
        )}
      </Section>

      {hasProfile && me?.id && (
        <Section id="publicaciones" title="Mis publicaciones">
          <MyPosts profileId={me.id} />
        </Section>
      )}
      {hasProfile && (
        <Section id="sigo" title="Personas que sigo">
          <FollowingList />
        </Section>
      )}
      {hasProfile && (
        <Section id="bloqueadas" title="Personas bloqueadas">
          <BlockedList />
        </Section>
      )}
      {hasProfile && (
        <Section id="temas" title="Temas favoritos (opcional)">
          <FavoriteTopics />
        </Section>
      )}
      <Section id="lectura" title="Cómo leo los comentarios">
        <ReadingPrefs />
      </Section>
      <Section id="avisos" title="Avisos de Comunidad">
        <CommunityNotices />
      </Section>
      {hasProfile && me?.id && (
        <Section id="supresion" title="Mis datos y su eliminación">
          <RemovalTools profileId={me.id} />
        </Section>
      )}

      <p className="muted">
        <Link to={paths.rules} className="link-button">
          Leer las normas de Comunidad
        </Link>
      </p>

      {aliasOpen && (
        <AliasDialog
          current={me}
          onDone={async () => {
            setAliasOpen(false)
            await refresh()
          }}
          onCancel={() => setAliasOpen(false)}
        />
      )}
    </>
  )
}

// ---- Bloque plegable: el contenido se monta (y pide sus datos) solo la primera vez que se abre
function Section({ id, title, defaultOpen = false, children }: { id: string; title: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  const [seen, setSeen] = useState(defaultOpen)
  return (
    <section className="card community-settings-section" aria-labelledby={`settings-${id}-title`}>
      <h2 id={`settings-${id}-title`}>
        <button
          type="button"
          className="community-settings-toggle"
          aria-expanded={open}
          aria-controls={`settings-${id}-body`}
          onClick={() => {
            setOpen(!open)
            setSeen(true)
          }}
        >
          <span>{title}</span>
          <span aria-hidden="true">{open ? '▲' : '▼'}</span>
        </button>
      </h2>
      <div id={`settings-${id}-body`} hidden={!open}>
        {seen && children}
      </div>
    </section>
  )
}

// ---- Expulsión / readmisión
function BanBox({ notice, onChanged }: { notice: NonNullable<ReturnType<typeof banNotice>>; onChanged: () => Promise<void> }) {
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function ask() {
    setBusy(true)
    setMessage(null)
    try {
      await requestReadmission()
      setMessage('Solicitud enviada. La revisará la administración.')
      await onChanged()
    } catch (e) {
      setMessage(communityErrorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="community-notice" role="status">
      <strong>{notice.title}</strong>
      <p>{notice.text}</p>
      {notice.canRequest && (
        <button type="button" className="primary" disabled={busy} onClick={() => void ask()}>
          {busy ? 'Enviando…' : 'Pedir la readmisión'}
        </button>
      )}
      {message && <p>{message}</p>}
    </div>
  )
}

// ---- Mis publicaciones
const PAGE_SIZE = 10

function MyPosts({ profileId }: { profileId: string }) {
  const [items, setItems] = useState<CommunityCardItem[]>([])
  const [done, setDone] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const more = useCallback(
    async (offset: number) => {
      setLoading(true)
      setError(null)
      try {
        const page = await listPosts({ author: profileId, limit: PAGE_SIZE, offset })
        setItems((prev) => (offset === 0 ? page : [...prev, ...page]))
        setDone(page.length < PAGE_SIZE)
        setLoaded(true)
      } catch (e) {
        setError(communityErrorText(e))
      } finally {
        setLoading(false)
      }
    },
    [profileId],
  )

  useEffect(() => {
    void more(0)
  }, [more])

  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!loaded && loading && <p className="muted">Cargando…</p>}
      {loaded && items.length === 0 && (
        <p className="muted">
          Todavía no has publicado nada. <Link to={paths.newPost()}>Escribe tu primera publicación</Link>.
        </p>
      )}
      <div className="community-card-list">
        {items.map((it) => (
          <PostCardView key={it.id} item={it} />
        ))}
      </div>
      {loaded && !done && (
        <button type="button" className="link-button" disabled={loading} onClick={() => void more(items.length)}>
          {loading ? 'Cargando…' : 'Ver más'}
        </button>
      )}
    </>
  )
}

// ---- Personas que sigo (con su modo de aviso)
function FollowingList() {
  const [list, setList] = useState<{ id: string; alias: string; avatarEmoji: string | null; notifyMode: FollowMode }[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    listFollowing().then(setList, (e) => setError(communityErrorText(e)))
  }, [])

  async function change(id: string, mode: FollowMode) {
    setBusyId(id)
    setError(null)
    try {
      await followUser(id, mode)
      setList((prev) => prev?.map((f) => (f.id === id ? { ...f, notifyMode: mode } : f)) ?? prev)
    } catch (e) {
      setError(communityErrorText(e))
    } finally {
      setBusyId(null)
    }
  }

  async function stop(id: string) {
    setBusyId(id)
    setError(null)
    try {
      await unfollowUser(id)
      setList((prev) => prev?.filter((f) => f.id !== id) ?? prev)
    } catch (e) {
      setError(communityErrorText(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {list === null && !error && <p className="muted">Cargando…</p>}
      {list && list.length === 0 && <p className="muted">Todavía no sigues a nadie. Puedes seguir a una persona desde su perfil.</p>}
      <ul className="community-people-list">
        {list?.map((f) => (
          <li key={f.id}>
            <Link to={paths.profile(f.id)} className="community-person-link">
              <CommunityAvatar alias={f.alias} emoji={f.avatarEmoji} size="sm" />
              <span>{f.alias}</span>
            </Link>
            <label>
              <select value={f.notifyMode} disabled={busyId === f.id} onChange={(e) => void change(f.id, e.target.value as FollowMode)} aria-label={`Avisos de ${f.alias}: ${followModeLabel(f.notifyMode)}`}>
                {FOLLOW_MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="link-button" disabled={busyId === f.id} onClick={() => void stop(f.id)} aria-label={`Dejar de seguir a ${f.alias}`}>
              Dejar de seguir
            </button>
          </li>
        ))}
      </ul>
      {list && list.length > 0 && <p className="muted">Avisos: «inteligente» (recomendado) te avisa sin saturarte; «cada publicación» avisa siempre; «sin avisos» solo la sigue.</p>}
    </>
  )
}

// ---- Personas bloqueadas
function BlockedList() {
  const [list, setList] = useState<{ id: string; alias: string; avatarEmoji: string | null }[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    listBlocks().then(setList, (e) => setError(communityErrorText(e)))
  }, [])

  async function unblock(id: string) {
    setBusyId(id)
    setError(null)
    try {
      await unblockUser(id)
      setList((prev) => prev?.filter((b) => b.id !== id) ?? prev)
    } catch (e) {
      setError(communityErrorText(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {list === null && !error && <p className="muted">Cargando…</p>}
      {list && list.length === 0 && <p className="muted">No has bloqueado a nadie.</p>}
      <ul className="community-people-list">
        {list?.map((b) => (
          <li key={b.id}>
            <span className="community-person-link">
              <CommunityAvatar alias={b.alias} emoji={b.avatarEmoji} size="sm" />
              <span>{b.alias}</span>
            </span>
            <button type="button" disabled={busyId === b.id} onClick={() => void unblock(b.id)} aria-label={`Desbloquear a ${b.alias}`}>
              Desbloquear
            </button>
          </li>
        ))}
      </ul>
      <p className="muted">La persona bloqueada no recibe ningún aviso de que la has bloqueado.</p>
    </>
  )
}

// ---- Temas favoritos (opcionales): ayudan a ordenar «Para mí»
function FavoriteTopics() {
  const [topics, setTopics] = useState<CommunityTopic[] | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([listCommunityTopics(), getFavoriteTopics()]).then(
      ([all, fav]) => {
        setTopics(all)
        setSelected(fav)
      },
      (e) => setError(communityErrorText(e)),
    )
  }, [])

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
    setDirty(true)
    setMessage(null)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await setFavoriteTopics(selected)
      setDirty(false)
      setMessage('Guardado')
    } catch (e) {
      setError(communityErrorText(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <p className="muted">Elige los temas que más te interesan para que «Para mí» te enseñe antes lo que te gusta. No es obligatorio.</p>
      {topics === null && !error && <p className="muted">Cargando…</p>}
      {topics &&
        SECTIONS.map((s) => (
          <fieldset key={s.id} className="community-topic-group">
            <legend>
              {s.icon} {s.title}
            </legend>
            {topics
              .filter((t) => t.section === s.id)
              .map((t) => (
                <label key={t.id} className="checkbox-label">
                  <input type="checkbox" checked={selected.includes(t.id)} onChange={() => toggle(t.id)} />
                  {t.label}
                </label>
              ))}
          </fieldset>
        ))}
      {topics && (
        <button type="button" className="primary" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? 'Guardando…' : 'Guardar mis temas'}
        </button>
      )}
      {message && <p role="status">{message}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}

// ---- Preferencias de lectura (se sincronizan entre dispositivos). Orden y plegado son INDEPENDIENTES.
function ReadingPrefs() {
  const [prefs, setPrefs] = useState<CommunityUserPrefs | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    getCommunityUserPrefs().then(setPrefs, (e) => setError(communityErrorText(e)))
  }, [])

  async function change(patch: { commentOrder?: CommentOrder; foldReadComments?: boolean }) {
    if (!prefs) return
    const previous = prefs
    setPrefs({ ...prefs, ...patch })
    setError(null)
    setMessage(null)
    try {
      // Solo se manda lo que cambia: así tocar una preferencia nunca cambia la otra.
      setPrefs(await setCommunityUserPrefs(patch))
      setMessage('Guardado')
    } catch (e) {
      setPrefs(previous)
      setError(communityErrorText(e))
    }
  }

  return (
    <>
      {!prefs && !error && <p className="muted">Cargando…</p>}
      {prefs && (
        <>
          <label>
            Orden de los comentarios
            <select value={prefs.commentOrder} onChange={(e) => void change({ commentOrder: e.target.value as CommentOrder })}>
              {(Object.keys(COMMENT_ORDER_LABELS) as CommentOrder[]).map((o) => (
                <option key={o} value={o}>
                  {COMMENT_ORDER_LABELS[o]}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">Es el orden con el que se abren las conversaciones. Dentro de una conversación puedes cambiarlo solo para esa vez.</p>
          <label className="checkbox-label">
            <input type="checkbox" checked={prefs.foldReadComments} onChange={(e) => void change({ foldReadComments: e.target.checked })} />
            Plegar los comentarios que ya he leído
          </label>
          <p className="muted">Se guarda en tu cuenta, así que vale en todos tus dispositivos.</p>
        </>
      )}
      {message && <p role="status">{message}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}

// ---- Avisos de Comunidad (COM-144): el bloque de ajustes es el componente compartido CommunityNoticePrefs (también está en Familia → Horarios de tus avisos)
function CommunityNotices() {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getNotificationPrefs().then(setPrefs, () => setError('No he podido cargar tus ajustes de avisos.'))
  }, [])

  async function save(patch: Partial<NotificationPrefs>) {
    if (!prefs) return
    const previous = prefs
    setPrefs({ ...prefs, ...patch })
    setError(null)
    setMessage(null)
    try {
      await saveNotificationPrefs(patch)
      setMessage('Guardado')
    } catch {
      setPrefs(previous)
      setError('No se ha podido guardar. Inténtalo de nuevo.')
    }
  }

  return (
    <>
      {!prefs && !error && <p className="muted">Cargando…</p>}
      {prefs && <CommunityNoticePrefs prefs={prefs} onSave={save} showZoneHint />}
      {message && <p role="status">{message}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}

// ---- Derecho de supresión
type Phase = 'idle' | 'armed' | 'working'

function RemovalTools({ profileId }: { profileId: string }) {
  // Eliminar todo lo mío: dos toques (primero se arma, luego se confirma).
  const [phase, setPhase] = useState<Phase>('idle')
  const [deleteResult, setDeleteResult] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Pedir que se elimine un contenido.
  const [scope, setScope] = useState<RemovalScope>('all_my_content')
  const [target, setTarget] = useState('')
  const [detail, setDetail] = useState('')
  const [myPosts, setMyPosts] = useState<{ id: string; title: string }[] | null>(null)
  const [sending, setSending] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [requests, setRequests] = useState<MyRemovalRequest[] | null>(null)
  const [justSent, setJustSent] = useState(false)
  const [targetKind, setTargetKind] = useState<RemovalTargetKind>('post')
  const [myComments, setMyComments] = useState<MyCommentItem[] | null>(null)
  const [commentsDone, setCommentsDone] = useState(false)
  const [loadingComments, setLoadingComments] = useState(false)

  // El estado de mis solicitudes viene del servidor (persistente) y se pide solo cuando se abre este bloque (el bloque se monta al abrirlo).
  const loadRequests = useCallback(async () => {
    try {
      setRequests(await listMyRemovalRequests())
    } catch (e) {
      setRequestError(communityErrorText(e))
      setRequests((prev) => prev ?? [])
    }
  }, [])

  useEffect(() => {
    void loadRequests()
  }, [loadRequests])

  // Mis comentarios, de 30 en 30 y solo cuando se necesitan.
  async function loadComments(offset: number) {
    setLoadingComments(true)
    try {
      const page = await listMyComments(30, offset)
      setMyComments((prev) => (offset === 0 ? page : [...(prev ?? []), ...page]))
      setCommentsDone(page.length < 30)
    } catch (e) {
      setRequestError(communityErrorText(e))
      setMyComments((prev) => prev ?? [])
    } finally {
      setLoadingComments(false)
    }
  }

  async function chooseKind(next: RemovalTargetKind) {
    setTargetKind(next)
    setTarget('')
    setRequestError(null)
    if (next === 'comment' && myComments === null) await loadComments(0)
  }

  async function eraseAll() {
    setPhase('working')
    setDeleteError(null)
    try {
      const n = await deleteMyCommunityContent()
      setDeleteResult(n === 0 ? 'No tenías nada publicado que eliminar.' : n === 1 ? 'Se ha eliminado 1 elemento de Comunidad.' : `Se han eliminado ${n} elementos de Comunidad.`)
      setPhase('idle')
    } catch (e) {
      setDeleteError(communityErrorText(e))
      setPhase('idle')
    }
  }

  async function chooseScope(next: RemovalScope) {
    setScope(next)
    setJustSent(false)
    setRequestError(null)
    // La lista de publicaciones propias se pide solo la primera vez que se necesita.
    if (next === 'specific' && myPosts === null) {
      try {
        const items = await listPosts({ author: profileId, limit: 50 })
        setMyPosts(items.filter((i): i is Exclude<CommunityCardItem, { blockedByMe: true }> => !i.blockedByMe).map((i) => ({ id: i.id, title: i.title })))
      } catch (e) {
        setRequestError(communityErrorText(e))
      }
    }
  }

  async function send() {
    const problem = validateRemovalRequest(scope, target || null, detail, targetKind)
    if (problem) {
      setRequestError(problem)
      return
    }
    setSending(true)
    setRequestError(null)
    try {
      await requestContentRemoval(scope, scope === 'specific' ? targetKind : null, scope === 'specific' ? target : null, detail.trim())
      setJustSent(true)
      setDetail('')
      setTarget('')
      await loadRequests()
    } catch (e) {
      setRequestError(communityErrorText(e))
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <h3>Eliminar mis publicaciones y comentarios de Comunidad</h3>
      <p className="muted">
        Se borran todas tus publicaciones, recetas publicadas, comentarios y fotos de Comunidad, y no se pueden recuperar. No afecta a tu cuenta de PEPA ni a los datos de tu familia, y tus
        recetas privadas de Cocina siguen donde están.
      </p>
      {phase === 'idle' && (
        <button type="button" onClick={() => setPhase('armed')}>
          Eliminar mis publicaciones y comentarios
        </button>
      )}
      {phase !== 'idle' && (
        <div className="community-notice" role="alertdialog" aria-label="Confirmar eliminación">
          <p>
            <strong>¿Seguro?</strong> Toca otra vez para confirmar. Esto no se puede deshacer.
          </p>
          <button type="button" className="primary danger" disabled={phase === 'working'} onClick={() => void eraseAll()}>
            {phase === 'working' ? 'Eliminando…' : 'Sí, eliminar todo'}
          </button>
          <button type="button" className="link-button" disabled={phase === 'working'} onClick={() => setPhase('idle')}>
            No, cancelar
          </button>
        </div>
      )}
      {deleteResult && <p role="status">{deleteResult}</p>}
      {deleteError && (
        <p className="error" role="alert">
          {deleteError}
        </p>
      )}

      <h3>Pedir que se elimine un contenido</h3>
      <p className="muted">Si prefieres que lo revise la administración, o quieres que se elimine algo concreto, envía una solicitud. Quedará registrada y, cuando se resuelva, te avisaremos.</p>
      <fieldset className="community-notice-group">
        <legend>¿Qué quieres que se elimine?</legend>
        <label className="checkbox-label">
          <input type="radio" name="removal-scope" checked={scope === 'all_my_content'} onChange={() => void chooseScope('all_my_content')} />
          Todo lo que he publicado
        </label>
        <label className="checkbox-label">
          <input type="radio" name="removal-scope" checked={scope === 'specific'} onChange={() => void chooseScope('specific')} />
          Algo concreto
        </label>
      </fieldset>
      {scope === 'specific' && (
        <>
          <fieldset className="community-notice-group">
            <legend>¿Es una publicación o un comentario?</legend>
            <label className="checkbox-label">
              <input type="radio" name="removal-kind" checked={targetKind === 'post'} onChange={() => void chooseKind('post')} />
              Una publicación
            </label>
            <label className="checkbox-label">
              <input type="radio" name="removal-kind" checked={targetKind === 'comment'} onChange={() => void chooseKind('comment')} />
              Un comentario
            </label>
          </fieldset>
          {targetKind === 'post' ? (
            <label>
              Publicación
              <select value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">{myPosts === null ? 'Cargando…' : myPosts.length === 0 ? 'No tienes publicaciones' : 'Elige una publicación'}</option>
                {myPosts?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label>
                Comentario
                <select value={target} onChange={(e) => setTarget(e.target.value)}>
                  <option value="">{myComments === null ? 'Cargando…' : myComments.length === 0 ? 'No tienes comentarios' : 'Elige un comentario'}</option>
                  {myComments?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {commentOptionLabel(c)}
                    </option>
                  ))}
                </select>
              </label>
              {myComments !== null && !commentsDone && (
                <button type="button" className="link-button" disabled={loadingComments} onClick={() => void loadComments(myComments.length)}>
                  {loadingComments ? 'Cargando…' : 'Ver más comentarios'}
                </button>
              )}
            </>
          )}
        </>
      )}
      <label>
        {scope === 'specific' ? 'Cuéntanos por qué y qué debemos quitar' : 'Detalle (opcional)'}
        <textarea value={detail} maxLength={2000} rows={3} onChange={(e) => setDetail(e.target.value)} />
      </label>
      <button type="button" className="primary" disabled={sending} onClick={() => void send()}>
        {sending ? 'Enviando…' : 'Enviar solicitud'}
      </button>
      {requestError && (
        <p className="error" role="alert">
          {requestError}
        </p>
      )}
      {justSent && <p role="status">{REMOVAL_SENT_TEXT}</p>}
      <h3>Mis solicitudes</h3>
      {requests === null && <p className="muted">Cargando…</p>}
      {requests && requests.length === 0 && <p className="muted">Todavía no has enviado ninguna solicitud.</p>}
      {requests && requests.length > 0 && (
        <ul className="community-people-list" aria-label="Mis solicitudes de eliminación">
          {requests.map((r) => (
            <li key={r.id}>
              <span>
                {removalRequestTitle(r)} · {new Date(r.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
              <span className={r.status === 'done' ? 'community-tag-official' : r.status === 'rejected' ? 'community-tag-unanswered' : 'community-tag-featured'}>{removalStatusLabel(r.status)}</span>
              {r.handledNote && <span className="muted">Nota de la administración: {r.handledNote}</span>}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
