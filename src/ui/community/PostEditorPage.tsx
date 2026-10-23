import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  createPost,
  deleteDraft,
  getDraft,
  getMyCommunityProfile,
  getPost,
  listCommunityTopics,
  removeCommunityPhoto,
  saveDraft,
  similarPosts,
  updatePost,
} from '@/data/community'
import { ANECDOTE_TYPES, DRAFT_DAYS, MAX_TITLE, POST_KINDS, SECTIONS, parseAnecdoteType, type CommunityTopic, type PostCard } from '@/domain/community'
import { CommunityError, communityErrorCode, communityErrorText } from '@/domain/communityErrors'
import { MINORS_NO_PHOTOS_NOTE } from '@/domain/communityAccess'
import { bufferScope, clearBuffer, readBuffer, shouldOfferBuffer, writeBuffer, type BufferEntry } from '@/domain/communityDraftBuffer'
import {
  charCounter,
  daysLeftText,
  draftDaysLeft,
  draftToForm,
  DRAFT_EXPIRY_WARNING,
  emptyRecipe,
  hasErrors,
  initialFormFromQuery,
  isFormDirty,
  isSectionAllowed,
  recipeForServer,
  anecdoteTypeForServer,
  withAnecdoteType,
  recipeToInput,
  topicsForSection,
  unsavedPhotos,
  validateForDraft,
  validateForPublish,
  withKind,
  withSection,
  type FormErrors,
  type PostForm,
} from '@/domain/communityPostForm'
import { UNSAVED_ACTIONS } from '@/domain/unsavedChangesGuard'
import { AutoGrowTextarea } from '@/ui/AutoGrowTextarea'
import { Breadcrumbs } from '@/ui/community/Breadcrumbs'
import { ConfirmDiscardDialog } from '@/ui/community/ConfirmDiscardDialog'
import { DraftExpiryNotice } from '@/ui/community/DraftExpiryNotice'
import { PhotoPicker } from '@/ui/community/PhotoPicker'
import { PostEditorActions } from '@/ui/community/PostEditorActions'
import { RichTextEditor } from '@/ui/community/RichTextEditor'
import { UnsavedChangesDialog } from '@/ui/community/UnsavedChangesDialog'
import { useCommunity } from '@/ui/community/CommunityProvider'
import { pageCrumbs, paths } from '@/ui/community/communityNav'
import { RecipeConsentCheckbox } from '@/ui/community/recipes/RecipeConsentCheckbox'
import { RecipeFields } from '@/ui/community/recipes/RecipeFields'
import { useCommunityPhotosAllowed } from '@/ui/community/useCommunityPhotosAllowed'
import { useRecipeSeed } from '@/ui/community/useRecipeSeed'
import { useUnsavedChangesGuard } from '@/ui/community/useUnsavedChangesGuard'
import { emitHelpEvent } from '@/help/tours/helpBus'
import '@/ui/community/communityEditor.css'

// «Nueva publicación» y «Editar publicación» (rutas `nueva` y `editar/:id`). Especificación sección 4 y recorridos B y C.
//  - Obligatorio: tipo, sección, tema, título y texto (en una Receta el texto es opcional: es la presentación).
//  - Publicar es inmediato (sin aprobación). Editar se puede en cualquier momento: el servidor mantiene los comentarios y marca «Editado».
//  - Tres botones apilados en este orden: Descartar, Guardar borrador, Publicar.
//  - Cambios sin guardar: diálogo con tres acciones (ver useUnsavedChangesGuard). Autoguardado TEMPORAL solo en este dispositivo (no es un borrador).

const KIND_COPY: Record<string, { label: string; placeholder: string; help: string }> = {
  pregunta: { label: 'Tu pregunta, con detalle', placeholder: 'Cuenta qué necesitas saber y qué has probado ya.', help: 'Cuantos más datos des, mejor te podrán ayudar.' },
  consejo: { label: 'Tu consejo', placeholder: 'Explica el truco o consejo paso a paso.', help: 'Puedes usar negrita, listas y enlaces con la barra de arriba.' },
  anecdota: { label: 'Tu anécdota', placeholder: 'Cuéntanos esa historia graciosa, bonita o emotiva.', help: 'Sin nombres reales ni datos privados de nadie, por favor.' },
  receta: {
    label: 'Presentación de la receta (opcional)',
    placeholder: 'Cuenta de dónde viene la receta, cuándo la haces o qué la hace especial.',
    help: 'Los ingredientes y los pasos se escriben más abajo.',
  },
}

type Phase = 'loading' | 'ready' | 'blocked'
type Busy = null | 'draft' | 'publish' | 'discard'

function formatDate(iso: string | number | Date): string {
  return new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}

function focusField(key: keyof FormErrors) {
  const wrap = document.getElementById(`ce-field-${key}`)
  if (!wrap) return
  wrap.scrollIntoView({ block: 'center', behavior: 'smooth' })
  wrap.querySelector<HTMLElement>('textarea, input, select, button')?.focus({ preventScroll: true })
}

export function PostEditorPage() {
  const { id: editId } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { me, loading: communityLoading, requireParticipation } = useCommunity()
  const isEdit = Boolean(editId)
  const mode = isEdit ? 'edit' : 'create'
  const draftParam = params.get('borrador')
  const seed = useRecipeSeed()

  const [phase, setPhase] = useState<Phase>('loading')
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null)
  const [topics, setTopics] = useState<CommunityTopic[]>([])
  const [form, setForm] = useState<PostForm>(() => initialFormFromQuery({ tipo: params.get('tipo'), seccion: params.get('seccion'), titulo: params.get('titulo') }))
  // Lo último que el servidor conoce (borrador o publicación guardados) o el punto de partida: con esto se compara para saber si hay cambios sin guardar.
  const [baseline, setBaseline] = useState<PostForm>(form)
  const [draftId, setDraftId] = useState<string | null>(null)
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null)
  // Fotos que ya están guardadas en el servidor (en el borrador o en la publicación).
  const [persisted, setPersisted] = useState<ReadonlySet<string>>(new Set())
  const [photosBusy, setPhotosBusy] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [recoverable, setRecoverable] = useState<BufferEntry | null>(null)
  const [similar, setSimilar] = useState<PostCard[]>([])
  // La receta viene de la Cocina PRIVADA (?receta=): antes de publicarla hay que marcar el consentimiento explícito.
  const [needsConsent, setNeedsConsent] = useState(false)
  const [consent, setConsent] = useState(false)

  const dirty = phase === 'ready' && isFormDirty(form, baseline)
  const guard = useUnsavedChangesGuard(dirty && busy !== 'publish')

  const meRef = useRef(me)
  const finishedRef = useRef(false) // ya se publicó, descartó o salió a propósito: no hay nada que autoguardar
  const bufferChecked = useRef(false)
  const seedApplied = useRef(false)
  const scope = bufferScope({ postId: editId, draftId })

  useEffect(() => {
    meRef.current = me
  }, [me])

  // ---- Carga: temas + (publicación a editar | borrador). Una sola vez por pantalla.
  useEffect(() => {
    let cancelled = false
    function block(text: string) {
      setBlockedMessage(text)
      setPhase('blocked')
    }
    async function load() {
      setPhase('loading')
      try {
        const topicsPromise = listCommunityTopics()
        if (editId) {
          const [topicList, post] = await Promise.all([topicsPromise, getPost(editId)])
          if (cancelled) return
          setTopics(topicList)
          if (!post) return block('Esta publicación ya no está disponible.')
          if (post.status === 'hidden') return block('Esta publicación está oculta por la administración y ahora no se puede editar.')
          if (!post.isMine) return block('Solo puedes editar tus propias publicaciones.')
          const loaded: PostForm = {
            kind: post.kind === 'receta' || post.kind === 'pregunta' || post.kind === 'consejo' || post.kind === 'anecdota' ? post.kind : 'pregunta',
            section: post.section,
            topicId: post.topicId,
            title: post.title,
            body: post.body,
            photos: [...post.photos].sort((a, b) => a.position - b.position).map((p) => p.path),
            recipe: post.kind === 'receta' ? (recipeToInput(post.recipe) ?? emptyRecipe()) : null,
            anecdoteType: post.kind === 'anecdota' ? parseAnecdoteType(post.anecdoteType) : null,
          }
          setForm(loaded)
          setBaseline(loaded)
          setPersisted(new Set(loaded.photos))
        } else if (draftParam) {
          const [topicList, draft] = await Promise.all([topicsPromise, getDraft(draftParam)])
          if (cancelled) return
          setTopics(topicList)
          if (!draft) return block(`Este borrador ya no existe o ha caducado (los borradores se conservan ${DRAFT_DAYS} días desde el último guardado).`)
          const loaded = draftToForm(draft)
          // Un borrador de receta puede venir de la Cocina privada y el borrador no recuerda de dónde salió: antes de publicarla se vuelve a pedir el
          // consentimiento explícito (así nunca se publica una receta de la Cocina sin él, ni se pierde la constancia de la fecha).
          if (loaded.kind === 'receta') setNeedsConsent(true)
          setForm(loaded)
          setBaseline(loaded)
          setDraftId(draft.id)
          setDraftSavedAt(draft.savedAt)
          setPersisted(new Set(loaded.photos))
        } else {
          const topicList = await topicsPromise
          if (cancelled) return
          setTopics(topicList)
        }
        setPhase('ready')
      } catch (e) {
        if (!cancelled) block(communityErrorText(e))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [editId, draftParam])

  // ---- Autoguardado temporal: ¿hay algo más nuevo en este dispositivo? Se mira UNA vez, cuando ya se sabe quién es la persona.
  useEffect(() => {
    if (phase !== 'ready' || communityLoading || bufferChecked.current) return
    bufferChecked.current = true
    if (!me?.id) return
    const entry = readBuffer(me.id, scope)
    if (shouldOfferBuffer(entry, baseline, draftSavedAt)) setRecoverable(entry)
  }, [phase, communityLoading, me?.id, scope, baseline, draftSavedAt])

  // Semilla de receta (la rellenará el ayudante de recetas con `?receta=`): solo en una publicación nueva, una vez y sin pisar lo escrito.
  useEffect(() => {
    if (!seed || phase !== 'ready' || isEdit || draftParam || seedApplied.current) return
    seedApplied.current = true
    const next: PostForm = { ...withKind(form, 'receta'), recipe: seed.recipe, title: form.title || seed.title || '' }
    setForm(next)
    setNeedsConsent(seed.needsConsent)
    setBaseline(next) // venir de «compartir esta receta» no cuenta como cambios sin guardar
  }, [seed, phase, isEdit, draftParam, form])

  // ---- Autoguardado temporal: 1,5 s después del último cambio, SOLO en este dispositivo (sin peticiones al servidor).
  useEffect(() => {
    if (phase !== 'ready' || !me?.id || busy === 'publish') return
    const meId = me.id
    const t = window.setTimeout(() => {
      if (isFormDirty(form, baseline)) writeBuffer(meId, scope, form)
      else clearBuffer(meId, scope)
    }, 1500)
    return () => window.clearTimeout(t)
  }, [form, baseline, phase, me?.id, scope, busy])

  // Al salir con cambios (por cualquier camino, incluso uno no interceptado) se guarda de inmediato lo último, por si acaso.
  const latest = useRef({ form, dirty, meId: me?.id ?? null, scope })
  useEffect(() => {
    latest.current = { form, dirty, meId: me?.id ?? null, scope }
  })
  useEffect(() => {
    return () => {
      const l = latest.current
      if (!finishedRef.current && l.dirty && l.meId) writeBuffer(l.meId, l.scope, l.form)
    }
  }, [])

  // El aviso de un intento anterior no debe verse al abrir el diálogo de «cambios sin guardar».
  useEffect(() => {
    if (guard.open) setSubmitError(null)
  }, [guard.open])

  // ---- Publicaciones parecidas (solo Pregunta y Receta, solo al crear): pausa de 600 ms y al menos 4 letras. Nunca bloquea nada.
  useEffect(() => {
    const title = form.title.trim()
    if (phase !== 'ready' || isEdit || (form.kind !== 'pregunta' && form.kind !== 'receta') || title.length < 4) {
      setSimilar([])
      return
    }
    let cancelled = false
    const t = window.setTimeout(() => {
      similarPosts(title, form.kind, form.section)
        .then((list) => {
          if (!cancelled) setSimilar(list.filter((c) => (c as { blockedByMe?: boolean }).blockedByMe !== true).slice(0, 3))
        })
        .catch(() => {
          if (!cancelled) setSimilar([]) // las sugerencias son un extra: si fallan, se sigue sin ellas
        })
    }, 600)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [form.title, form.kind, form.section, phase, isEdit])

  const sectionTopics = useMemo(() => topicsForSection(topics, form.section), [topics, form.section])
  const update = useCallback((patch: Partial<PostForm>) => setForm((f) => ({ ...f, ...patch })), [])

  // Las personas menores de edad participan SIN fotos: se les oculta el selector (una consulta por sesión) y, si aun así el servidor responde PHOTOS_NOT_ALLOWED,
  // se quitan las fotos del formulario y se explica con amabilidad.
  const { photosAllowed, forbid: forbidPhotosForMe } = useCommunityPhotosAllowed()
  function failureText(e: unknown): string {
    if (communityErrorCode(e) !== 'PHOTOS_NOT_ALLOWED') return communityErrorText(e)
    forbidPhotosForMe()
    update({ photos: [] })
    return `${communityErrorText(e)} Hemos quitado las fotos del formulario: vuelve a intentarlo.`
  }

  // Id público de la persona (pidiéndole alias y normas si aún no los tiene): hace falta para subir fotos, guardar y publicar.
  const ensureProfileId = useCallback(async (): Promise<string | null> => {
    if (!(await requireParticipation())) return null
    if (meRef.current?.id) return meRef.current.id
    const profile = await getMyCommunityProfile()
    return profile?.id ?? null
  }, [requireParticipation])

  // Fotos subidas en esta sesión que el servidor aún no conoce: se borran del almacenamiento si se descarta (así no quedan archivos sueltos).
  const dropUnsavedPhotos = useCallback(async () => {
    await Promise.all(unsavedPhotos(form.photos, persisted).map((p) => removeCommunityPhoto(p)))
  }, [form.photos, persisted])

  function leaveTo(to: string) {
    finishedRef.current = true
    void guard.release().then(() => navigate(to, { replace: true }))
  }

  // ---- Guardar borrador (solo el guardado MANUAL garantiza conservarlo 30 días desde este momento)
  async function saveDraftManually(): Promise<boolean> {
    setSubmitError(null)
    setMessage(null)
    const problem = validateForDraft(form)
    if (problem) {
      setSubmitError(problem)
      return false
    }
    const profileId = await ensureProfileId()
    if (!profileId) return false
    setBusy('draft')
    const args = { kind: form.kind, section: form.section, topicId: form.topicId, title: form.title, body: form.body, photos: form.photos, recipe: recipeForServer(form), anecdoteType: anecdoteTypeForServer(form) }
    try {
      let id: string
      try {
        id = await saveDraft({ id: draftId, ...args })
      } catch (e) {
        // Si el borrador ya caducó y se borró mientras tanto, se guarda como uno nuevo en vez de perder lo escrito.
        if (draftId && e instanceof CommunityError && e.code === 'NOT_AVAILABLE') id = await saveDraft({ id: null, ...args })
        else throw e
      }
      clearBuffer(profileId, bufferScope({ draftId }))
      clearBuffer(profileId, bufferScope({ draftId: id }))
      const now = new Date()
      setDraftId(id)
      setDraftSavedAt(now.toISOString())
      setBaseline(form)
      setPersisted(new Set(form.photos))
      const until = new Date(now.getTime() + DRAFT_DAYS * 24 * 60 * 60 * 1000)
      setMessage(`Borrador guardado. Se conserva ${DRAFT_DAYS} días (hasta el ${until.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}) desde este último guardado.`)
      emitHelpEvent('comunidad.draft-saved') // para los tutoriales «Enséñame»: el borrador YA está guardado (nada se publica)
      return true
    } catch (e) {
      setSubmitError(failureText(e))
      return false
    } finally {
      setBusy(null)
    }
  }

  // ---- Publicar (o guardar los cambios, al editar)
  async function publish() {
    setSubmitError(null)
    setMessage(null)
    const found = validateForPublish(form, topics)
    setErrors(found)
    if (!isEdit && needsConsent && form.kind === 'receta' && !consent) {
      setSubmitError('Para publicar una receta de tu Cocina tienes que marcar la casilla de consentimiento.')
      return
    }
    if (hasErrors(found)) {
      setSubmitError('Faltan cosas por completar. Revisa los avisos en rojo.')
      const first = (['kind', 'section', 'topic', 'title', 'body', 'recipe', 'photos'] as const).find((k) => found[k])
      if (first) focusField(first)
      return
    }
    if (!(await requireParticipation())) return
    setBusy('publish')
    try {
      const common = { topicId: form.topicId as string, title: form.title.trim(), body: form.body.trim(), photos: form.photos, recipe: recipeForServer(form), anecdoteType: anecdoteTypeForServer(form) }
      let postId: string
      if (editId) {
        await updatePost(editId, common)
        postId = editId
      } else {
        postId = await createPost({ kind: form.kind, section: form.section as 'recetas' | 'hogar', fromDraft: draftId, recipeConsent: needsConsent && consent, ...common })
      }
      const profileId = meRef.current?.id
      if (profileId) clearBuffer(profileId, scope)
      leaveTo(paths.post(postId))
    } catch (e) {
      setSubmitError(failureText(e))
      setBusy(null)
    }
  }

  // ---- Descartar
  // Botón «Descartar» (con confirmación): en una publicación nueva tira todo lo escrito (y el borrador guardado, si lo hay); al editar solo deshace los cambios.
  async function discardAll() {
    setBusy('discard')
    setSubmitError(null)
    try {
      if (!isEdit && draftId) await deleteDraft(draftId) // el servidor borra también las fotos guardadas del borrador
      await dropUnsavedPhotos()
      const profileId = meRef.current?.id
      if (profileId) clearBuffer(profileId, scope)
      setConfirmDiscard(false)
      leaveTo(isEdit && editId ? paths.post(editId) : draftId ? paths.drafts : form.section ? paths.section(form.section) : paths.home)
    } catch (e) {
      setSubmitError(communityErrorText(e))
      setBusy(null)
    }
  }

  // Acciones del diálogo de «cambios sin guardar».
  async function dialogSave() {
    if (isEdit) {
      await publish() // al editar no hay borrador: «Guardar cambios» guarda la edición y lleva a la publicación
      return
    }
    if (await saveDraftManually()) await guard.proceed()
  }

  async function dialogDiscard() {
    setBusy('discard')
    try {
      await dropUnsavedPhotos()
      const profileId = meRef.current?.id
      if (profileId) clearBuffer(profileId, scope)
      finishedRef.current = true
      await guard.proceed()
    } finally {
      setBusy(null)
    }
  }

  function recover() {
    if (!recoverable) return
    setForm(recoverable.form)
    setRecoverable(null)
    setMessage('Hemos recuperado lo que estabas escribiendo. Pulsa «Guardar borrador» para conservarlo.')
  }

  function dismissRecovery() {
    const profileId = meRef.current?.id
    if (profileId) clearBuffer(profileId, scope)
    setRecoverable(null)
  }

  const crumbs = pageCrumbs(isEdit ? 'Editar publicación' : 'Nueva publicación')
  const copy = KIND_COPY[form.kind]
  const titleCount = charCounter(form.title, MAX_TITLE)
  const kindInfo = POST_KINDS.find((k) => k.id === form.kind)
  const sectionInfo = SECTIONS.find((s) => s.id === form.section)

  if (phase === 'loading') {
    return (
      <section className="ce-page" aria-busy="true">
        <Breadcrumbs crumbs={crumbs} />
        <p className="muted">Cargando…</p>
      </section>
    )
  }

  if (phase === 'blocked') {
    return (
      <section className="ce-page">
        <Breadcrumbs crumbs={crumbs} />
        <h1>{isEdit ? 'Editar publicación' : 'Nueva publicación'}</h1>
        <p role="alert">{blockedMessage}</p>
        <Link className="link-button" to={isEdit ? paths.home : paths.drafts}>
          {isEdit ? 'Volver a Comunidad' : 'Ir a mis borradores'}
        </Link>
      </section>
    )
  }

  const busyAny = busy !== null || photosBusy

  return (
    <section className="ce-page">
      <Breadcrumbs crumbs={crumbs} />
      <h1>{isEdit ? 'Editar publicación' : 'Nueva publicación'}</h1>
      {/* Aviso de caducidad: INMEDIATAMENTE debajo del título. */}
      {!isEdit && <DraftExpiryNotice />}
      {isEdit && <p className="muted">Puedes editarla cuando quieras. Se mantienen los comentarios y aparecerá marcada como «Editado».</p>}

      {draftSavedAt && !isEdit && (
        <p className="ce-saved-note" role="status">
          Último guardado manual: {formatDate(draftSavedAt)}. {daysLeftText(draftDaysLeft(draftSavedAt))} para que caduque.
        </p>
      )}

      {recoverable && (
        <div className="ce-recover" role="region" aria-label="Recuperar lo que estabas escribiendo">
          <p>
            <strong>Recuperar lo que estabas escribiendo</strong>
          </p>
          <p>
            Encontramos un texto que escribías en este dispositivo ({formatDate(recoverable.savedAt)}) y que no llegaste a guardar. Es solo una copia de seguridad
            temporal.
          </p>
          <div className="ce-row">
            <button type="button" className="ce-btn ce-btn-primary" onClick={recover}>
              Recuperar
            </button>
            <button type="button" className="ce-btn ce-btn-secondary" onClick={dismissRecovery}>
              No, empezar de cero
            </button>
          </div>
        </div>
      )}

      {/* Tipo */}
      <div id="ce-field-kind" className="ce-field" data-help-id="comunidad.editor-kind">
        <span className="ce-label" id="ce-kind-label">
          ¿Qué quieres publicar?
        </span>
        {isEdit ? (
          <p>
            {kindInfo?.icon} {kindInfo?.label} <span className="muted">(el tipo no se puede cambiar)</span>
          </p>
        ) : (
          <div className="ce-chips" role="radiogroup" aria-labelledby="ce-kind-label">
            {POST_KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                role="radio"
                aria-checked={form.kind === k.id}
                className={'ce-chip' + (form.kind === k.id ? ' selected' : '')}
                disabled={busyAny}
                onClick={() => setForm((f) => withKind(f, k.id))}
              >
                <span>
                  <span aria-hidden="true">{k.icon}</span> {k.label}
                </span>
                <small>{k.help}</small>
              </button>
            ))}
          </div>
        )}
        {errors.kind && (
          <p className="error" role="alert">
            {errors.kind}
          </p>
        )}
      </div>

      {/* Subtipo opcional de la Anécdota: solo una etiqueta (no crea secciones ni filtros). */}
      {form.kind === 'anecdota' && (
        <div id="ce-field-anecdote" className="ce-field">
          <span className="ce-label" id="ce-anecdote-label">
            ¿Qué tipo de historia es? <span className="muted">(opcional)</span>
          </span>
          <div className="ce-chips" role="radiogroup" aria-labelledby="ce-anecdote-label">
            <button
              type="button"
              role="radio"
              aria-checked={!form.anecdoteType}
              className={'ce-chip' + (!form.anecdoteType ? ' selected' : '')}
              disabled={busyAny}
              onClick={() => setForm((f) => withAnecdoteType(f, null))}
            >
              <span>Sin etiqueta</span>
            </button>
            {ANECDOTE_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={form.anecdoteType === t.id}
                className={'ce-chip' + (form.anecdoteType === t.id ? ' selected' : '')}
                disabled={busyAny}
                onClick={() => setForm((f) => withAnecdoteType(f, t.id))}
              >
                <span>
                  <span aria-hidden="true">{t.icon}</span> {t.label}
                </span>
              </button>
            ))}
          </div>
          <p className="muted">Es solo una etiqueta para quien la lea. Puedes dejarla sin elegir.</p>
        </div>
      )}

      {/* Sección */}
      <div id="ce-field-section" className="ce-field">
        <span className="ce-label" id="ce-section-label">
          ¿En qué sección va?
        </span>
        {isEdit || form.kind === 'receta' ? (
          <p>
            {sectionInfo?.icon} {sectionInfo?.title}{' '}
            <span className="muted">{form.kind === 'receta' ? '(las recetas solo van en esta sección)' : '(no se puede cambiar)'}</span>
          </p>
        ) : (
          <div className="ce-chips" role="radiogroup" aria-labelledby="ce-section-label">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={form.section === s.id}
                className={'ce-chip' + (form.section === s.id ? ' selected' : '')}
                disabled={busyAny || !isSectionAllowed(form.kind, s.id)}
                onClick={() => setForm((f) => withSection(f, s.id))}
              >
                <span>
                  <span aria-hidden="true">{s.icon}</span> {s.title}
                </span>
              </button>
            ))}
          </div>
        )}
        {errors.section && (
          <p className="error" role="alert">
            {errors.section}
          </p>
        )}
      </div>

      {/* Tema (solo los de la sección) */}
      <div id="ce-field-topic" className="ce-field">
        <label className="ce-label" htmlFor="ce-topic">
          Tema
        </label>
        <select
          id="ce-topic"
          value={form.topicId ?? ''}
          disabled={busyAny || !form.section}
          aria-invalid={errors.topic ? true : undefined}
          aria-describedby={!form.section ? 'ce-topic-hint' : errors.topic ? 'ce-topic-err' : undefined}
          onChange={(e) => update({ topicId: e.target.value || null })}
        >
          <option value="">{form.section ? 'Elige un tema' : 'Primero elige la sección'}</option>
          {sectionTopics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        {!form.section && (
          <p id="ce-topic-hint" className="muted ce-help">
            Los temas dependen de la sección.
          </p>
        )}
        {errors.topic && (
          <p id="ce-topic-err" className="error" role="alert">
            {errors.topic}
          </p>
        )}
      </div>

      {/* Título */}
      <div id="ce-field-title" className="ce-field" data-help-id="comunidad.editor-title">
        <span className="ce-label">Título</span>
        <AutoGrowTextarea
          value={form.title}
          ariaLabel="Título de la publicación"
          disabled={busy !== null}
          className="ce-title"
          onChange={(v) => update({ title: v.replace(/\s*\n+\s*/g, ' ').slice(0, MAX_TITLE) })}
        />
        <span className={'ce-counter' + (titleCount.nearLimit ? ' near' : '')}>
          {titleCount.used} de {MAX_TITLE} letras
        </span>
        {errors.title && (
          <p className="error" role="alert">
            {errors.title}
          </p>
        )}

        {similar.length > 0 && (
          <div className="ce-similar" role="region" aria-label="Publicaciones parecidas">
            <p>
              <strong>¿Es lo mismo que…?</strong>
            </p>
            <p className="muted ce-help">Quizá ya se ha hablado de esto. Es solo una ayuda: puedes seguir y publicar igualmente.</p>
            <ul>
              {similar.map((p) => (
                <li key={p.id}>
                  <Link to={paths.post(p.id)}>
                    <span aria-hidden="true">{POST_KINDS.find((k) => k.id === p.kind)?.icon ?? ''}</span> {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Texto */}
      <div id="ce-field-body" data-help-id="comunidad.editor-body">
        <RichTextEditor value={form.body} onChange={(v) => update({ body: v })} label={copy.label} help={copy.help} placeholder={copy.placeholder} disabled={busy !== null} error={errors.body} />
      </div>

      {/* Receta: el editor de Cocina */}
      {form.kind === 'receta' && (
        <div id="ce-field-recipe" className="ce-field">
          <h2 className="ce-h2">La receta</h2>
          <RecipeFields value={form.recipe ?? emptyRecipe()} onChange={(r) => update({ recipe: r })} disabled={busy !== null} />
          {errors.recipe && (
            <p className="error" role="alert">
              {errors.recipe}
            </p>
          )}
          {!isEdit && needsConsent && <RecipeConsentCheckbox checked={consent} onChange={setConsent} disabled={busy !== null} />}
        </div>
      )}

      {/* Fotos */}
      <div id="ce-field-photos" data-help-id="comunidad.editor-photos">
        {photosAllowed === false ? (
          // Persona menor de edad: sin selector de fotos (el servidor también las rechaza).
          <p className="muted ce-help" id="ce-photos-note">
            {MINORS_NO_PHOTOS_NOTE}
          </p>
        ) : (
          <PhotoPicker
            value={form.photos}
            onChange={(photos) => update({ photos })}
            ensureProfileId={ensureProfileId}
            persisted={persisted}
            disabled={busy !== null}
            onBusyChange={setPhotosBusy}
          />
        )}
        {errors.photos && (
          <p className="error" role="alert">
            {errors.photos}
          </p>
        )}
      </div>

      {message && (
        <p className="ce-message" role="status">
          {message}
        </p>
      )}
      {submitError && !guard.open && !confirmDiscard && (
        <p className="error" role="alert">
          {submitError}
        </p>
      )}
      {photosBusy && <p className="muted">Espera a que terminen de subirse las fotos…</p>}

      <PostEditorActions mode={mode} busy={busyAny} onDiscard={() => setConfirmDiscard(true)} onSaveDraft={() => void saveDraftManually()} onPublish={() => void publish()} />
      <p className="muted ce-help">
        {isEdit ? 'Al guardar, tus cambios se ven enseguida.' : `Al publicar, tu publicación se ve enseguida en Comunidad. ${DRAFT_EXPIRY_WARNING.autosave}`}
      </p>

      {confirmDiscard && (
        <ConfirmDiscardDialog
          title={isEdit ? '¿Descartar los cambios?' : '¿Descartar esta publicación?'}
          message={
            isEdit
              ? 'Se perderán los cambios que no hayas guardado. La publicación seguirá como estaba.'
              : draftId
                ? 'Se borrará este borrador guardado, con su texto y sus fotos. Esto no se puede deshacer.'
                : 'Se borrará lo que has escrito y las fotos que has subido. Esto no se puede deshacer.'
          }
          confirmLabel="Sí, descartar"
          cancelLabel="No, volver"
          busy={busy === 'discard'}
          error={submitError}
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={() => void discardAll()}
        />
      )}

      {guard.open && (
        <UnsavedChangesDialog
          saveLabel={isEdit ? 'Guardar cambios' : UNSAVED_ACTIONS.save}
          busy={busy !== null}
          error={submitError}
          onKeep={guard.stay}
          onSave={() => void dialogSave()}
          onDiscard={() => dialogDiscard()}
        />
      )}
    </section>
  )
}
