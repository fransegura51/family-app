import { Link } from 'react-router-dom'
import { HELP_VIDEOS } from '@/help/legacy/legacyHelp'
import { HELP_MODULE_BY_ID } from '@/help/catalog'
import { canOfferActions } from '@/help/access'
import type { SearchHit } from '@/help/search/searchEngine'
import { getTourProgress } from '@/help/prefs'
import { helpSpeechSupported } from '@/help/voice'
import { HELP_FEEDBACK_ENABLED } from '@/help/feedback'
import { HelpFeedback } from '@/help/ui/HelpFeedback'
import { HelpVideo } from '@/help/ui/HelpVideo'
import { useHelp } from '@/help/ui/helpContext'
import '@/help/ui/help.css'

// Respuesta de la Ayuda a una pregunta o a una ficha: texto breve siempre visible, pasos y explicación avanzada desplegables, aviso claro si la función está a medias o
// apagada, y los botones «Llévame» / «Enséñame» / «Ver vídeo» solo cuando de verdad se pueden ofrecer a esta persona. Si la persona no tiene permiso para lo que pregunta,
// se le explica por qué y a quién pedirlo (nunca se le ofrecen botones que no le van a funcionar).
export function HelpAnswer({ hit, compact = false }: { hit: SearchHit; compact?: boolean }) {
  const help = useHelp()
  const access = help.accessOf(hit.doc)
  if (access.status === 'hidden') return null

  if (hit.doc.kind === 'legacy') {
    const e = hit.doc.entry
    const mod = HELP_MODULE_BY_ID.get(e.module)
    const short = e.text.length > 320 ? `${e.text.slice(0, 320).trimEnd()}…` : e.text
    return (
      <article className="help-answer help-answer-legacy" aria-label={e.title}>
        <p className="help-answer-module">
          {mod?.icon} {mod?.label}
        </p>
        <h4 className="help-answer-title">{e.title}</h4>
        <p className="help-answer-quick">{short}</p>
        {e.text.length > 320 && (
          <details className="help-more">
            <summary>Leer la explicación completa</summary>
            <p>{e.text}</p>
          </details>
        )}
        <div className="help-actions">
          <SpeakButtons text={`${e.title}. ${short}`} />
          {mod && (
            <Link to={mod.path} className="help-btn help-btn-primary" onClick={() => help.minimize()}>
              Llévame
            </Link>
          )}
        </div>
      </article>
    )
  }

  const card = hit.doc.card
  const mod = HELP_MODULE_BY_ID.get(card.module)
  const video = card.video ? HELP_VIDEOS[card.video] : undefined
  const restricted = access.status === 'restricted'
  const actions = canOfferActions(card, access)
  const spoken = card.state === 'disponible' ? card.quick : `${card.quick} ${card.limits ?? ''}`

  return (
    <article className={`help-answer${compact ? ' help-answer-compact' : ''}`} aria-label={card.title}>
      <p className="help-answer-module">
        {mod?.icon} {mod?.label}
      </p>
      <h4 className="help-answer-title">{card.title}</h4>
      {restricted ? (
        <>
          <p className="help-answer-quick">{card.quick}</p>
          <p className="help-note help-note-restricted" role="note">
            🔒 {access.reason}
          </p>
        </>
      ) : (
        <>
          {card.state === 'parcial' && (
            <p className="help-badge help-badge-partial" role="note">
              Funciona, pero con limitaciones
            </p>
          )}
          {card.state === 'desactivada' && (
            <p className="help-badge help-badge-off" role="note">
              Todavía no está disponible
            </p>
          )}
          <p className="help-answer-quick">{card.quick}</p>
          {card.state !== 'disponible' && card.limits && <p className="help-note">{card.state === 'parcial' ? 'Limitación: ' : 'Por qué: '}{card.limits}</p>}
          {card.steps && card.steps.length > 0 && (
            <details className="help-more" open={!compact && card.steps.length <= 4}>
              <summary>Ver los pasos</summary>
              <ol>
                {card.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </details>
          )}
          {card.more && (
            <details className="help-more">
              <summary>Explicación avanzada</summary>
              <p>{card.more}</p>
            </details>
          )}
          {video && <HelpVideo src={video.src} poster={video.poster} dur={video.dur} />}
        </>
      )}
      <div className="help-actions">
        {!restricted && <SpeakButtons text={spoken} />}
        {actions && card.go && (
          <button type="button" className="help-btn help-btn-primary" onClick={() => help.goTo(card)}>
            {card.go.label ?? 'Llévame'}
          </button>
        )}
        {actions && help.canStartTour(card) && (
          <button type="button" className="help-btn" onClick={() => help.startTour(card)}>
            Enséñame
            {card.tour && getTourProgress(card.tour)?.status === 'completed' ? ' ✓' : ''}
          </button>
        )}
      </div>
      {HELP_FEEDBACK_ENABLED && !restricted && <HelpFeedback cardId={card.id} />}
    </article>
  )
}

// Controles de voz: en AMBOS modos (Hablando / Por escrito) el texto está siempre visible y se puede escuchar, detener y repetir.
function SpeakButtons({ text }: { text: string }) {
  const help = useHelp()
  if (!helpSpeechSupported()) return null
  const speakingThis = help.speakingText === text
  return speakingThis ? (
    <>
      <button type="button" className="help-btn" onClick={() => help.stopSpeaking()} aria-label="Detener la voz">
        ⏹ Detener
      </button>
      <button type="button" className="help-btn" onClick={() => help.speak(text)} aria-label="Repetir la explicación en voz alta">
        🔁 Repetir
      </button>
    </>
  ) : (
    <button type="button" className="help-btn" onClick={() => help.speak(text)} aria-label="Escuchar la explicación en voz alta">
      🔊 Escuchar
    </button>
  )
}
