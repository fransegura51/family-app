import { useEffect, useRef, useState } from 'react'
import { addComment, getMyCommunityProfile, removeCommunityPhoto, uploadCommunityPhoto } from '@/data/community'
import { communityErrorText } from '@/domain/communityErrors'
import { MAX_COMMENT } from '@/domain/community'
import { prepareCommunityPhoto } from '@/services/communityPhoto'
import { useCommunity } from '@/ui/community/CommunityProvider'
import '@/ui/community/communityPost.css'

export interface ReplyTarget {
  // Comentario al que se responde (puede ser una respuesta: el servidor la cuelga igualmente del comentario raíz, con un solo nivel de sangría).
  id: string
  rootId: string
  alias: string
}

// Campo para escribir un comentario. SIEMPRE accesible: en móvil queda fijo abajo (por encima del menú inferior) aunque la conversación esté plegada.
// Una foto como máximo, con texto opcional. La foto se prepara al elegirla (se re-codifica y pierde ubicación/EXIF) pero NO se sube hasta pulsar «Publicar»,
// para no dejar fotos huérfanas si la persona se arrepiente. Pide alias/normas la primera vez (requireParticipation).
export function CommentComposer({
  postId,
  replyTarget,
  onCancelReply,
  onPosted,
}: {
  postId: string
  replyTarget: ReplyTarget | null
  onCancelReply: () => void
  onPosted: (newId: string, replyTo: ReplyTarget | null) => void
}) {
  const { requireParticipation, me } = useCommunity()
  const [text, setText] = useState('')
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null)
  // Una vez abierto el campo se queda abierto (si se cerrara al perder el foco, al tocar «Añadir foto» desaparecería el botón antes de pulsarlo).
  const [opened, setOpened] = useState(false)
  const [sending, setSending] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // Ruta de la foto ya subida (si falla la publicación y la persona reintenta, no se vuelve a subir).
  const uploadedRef = useRef<string | null>(null)
  const photoUrlRef = useRef<string | null>(null)
  photoUrlRef.current = photo?.url ?? null

  // Al elegir «Responder» el cursor va directo al campo.
  useEffect(() => {
    if (replyTarget) textRef.current?.focus()
  }, [replyTarget])

  // Se libera la vista previa de la foto al desmontar.
  useEffect(() => {
    return () => {
      if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current)
    }
  }, [])

  function dropPhoto() {
    if (photo) URL.revokeObjectURL(photo.url)
    setPhoto(null)
    if (uploadedRef.current) {
      void removeCommunityPhoto(uploadedRef.current)
      uploadedRef.current = null
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  async function onPick(file: File | undefined) {
    if (!file) return
    setError(null)
    setPreparing(true)
    try {
      const blob = await prepareCommunityPhoto(file)
      if (photo) URL.revokeObjectURL(photo.url)
      if (uploadedRef.current) {
        void removeCommunityPhoto(uploadedRef.current)
        uploadedRef.current = null
      }
      setPhoto({ blob, url: URL.createObjectURL(blob) })
    } catch (e) {
      setError(communityErrorText(e))
    } finally {
      setPreparing(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function submit() {
    const body = text.trim()
    if ((!body && !photo) || sending) return
    setError(null)
    setSending(true)
    try {
      if (!(await requireParticipation())) return
      let path = uploadedRef.current
      if (photo && !path) {
        // El perfil público (su id es la carpeta de las fotos) puede haberse creado justo ahora al pedir el alias.
        const profileId = me?.id ?? (await getMyCommunityProfile())?.id
        if (!profileId) {
          setError('Antes de participar elige tu alias público.')
          return
        }
        path = await uploadCommunityPhoto(profileId, photo.blob)
        uploadedRef.current = path
      }
      const newId = await addComment(postId, body, path, replyTarget?.id ?? null)
      if (photo) URL.revokeObjectURL(photo.url)
      uploadedRef.current = null
      setPhoto(null)
      setText('')
      setOpened(false)
      onPosted(newId, replyTarget)
    } catch (e) {
      setError(communityErrorText(e))
    } finally {
      setSending(false)
    }
  }

  const expanded = opened || text.length > 0 || photo !== null || replyTarget !== null
  const left = MAX_COMMENT - text.length

  return (
    <form
      className="community-composer"
      aria-label="Escribir un comentario"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      {replyTarget && (
        <p className="community-composer-reply">
          <span>
            Respondiendo a <strong>{replyTarget.alias}</strong>
          </span>
          <button type="button" className="link-button" aria-label="Dejar de responder a este comentario" onClick={onCancelReply}>
            Cancelar
          </button>
        </p>
      )}
      <div className="community-composer-row">
        <label className="community-composer-field">
          <span className="community-sr-only">{replyTarget ? `Tu respuesta a ${replyTarget.alias}` : 'Tu comentario'}</span>
          <textarea
            ref={textRef}
            value={text}
            rows={expanded ? 3 : 1}
            maxLength={MAX_COMMENT}
            placeholder={replyTarget ? `Responde a ${replyTarget.alias}…` : 'Escribe un comentario…'}
            onFocus={() => setOpened(true)}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <button type="submit" className="primary community-composer-send" disabled={sending || preparing || (!text.trim() && !photo)}>
          {sending ? 'Enviando…' : 'Publicar'}
        </button>
      </div>
      {expanded && (
        <div className="community-composer-tools">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="community-sr-only"
            id={`comment-photo-${postId}`}
            aria-label="Añadir una foto al comentario"
            onChange={(e) => void onPick(e.target.files?.[0])}
          />
          {!photo && (
            <label htmlFor={`comment-photo-${postId}`} className="link-button community-composer-photo-btn" aria-disabled={preparing}>
              {preparing ? 'Preparando la foto…' : '📷 Añadir foto'}
            </label>
          )}
          {photo && (
            <span className="community-composer-preview">
              <img src={photo.url} alt="Foto que vas a añadir" />
              <button type="button" className="link-button" aria-label="Quitar la foto" onClick={dropPhoto}>
                Quitar foto
              </button>
            </span>
          )}
          <span className="muted community-composer-count" aria-live="polite">
            {left < 200 ? `${left} caracteres` : 'Una foto como máximo'}
          </span>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
