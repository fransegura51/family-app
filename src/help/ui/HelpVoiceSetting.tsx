import { useHelp } from '@/help/ui/helpContext'
import '@/help/ui/help.css'

// Preferencia de voz de la Ayuda: «Hablando» (Pepa explica las respuestas con su voz) o «Por escrito» (solo texto). Es INDEPENDIENTE de «Hablar con PEPA» (otra preferencia) y
// viaja con la cuenta entre dispositivos por el sistema de preferencias cuando esté activada su sincronización. En ambos modos el texto se ve siempre y hay controles de voz.
export function HelpVoiceSetting({ compact = false }: { compact?: boolean }) {
  const help = useHelp()
  return (
    <div className={`help-voice-setting${compact ? ' help-voice-setting-compact' : ''}`} role="radiogroup" aria-label="Cómo te explica la Ayuda">
      {!compact && <span className="help-voice-setting-label">Cómo te explica la Ayuda</span>}
      <button type="button" role="radio" aria-checked={help.voiceMode === 'voice'} className={`help-seg${help.voiceMode === 'voice' ? ' help-seg-on' : ''}`} onClick={() => help.setVoiceMode('voice')}>
        🔊 Hablando
      </button>
      <button type="button" role="radio" aria-checked={help.voiceMode === 'text'} className={`help-seg${help.voiceMode === 'text' ? ' help-seg-on' : ''}`} onClick={() => help.setVoiceMode('text')}>
        💬 Por escrito
      </button>
      {!compact && (
        <p className="muted help-voice-setting-note">
          Hablando: Pepa lee en voz alta cada respuesta (el texto se ve siempre). Es independiente de «Hablar con PEPA».
        </p>
      )}
    </div>
  )
}
