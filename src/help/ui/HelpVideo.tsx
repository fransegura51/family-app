import { useState } from 'react'
import '@/help/ui/help.css'

// Vídeo explicativo existente (alojado en la web, no en Supabase): no se descarga nada hasta que se pulsa «Ver vídeo».
export function HelpVideo({ src, poster, dur }: { src: string; poster: string; dur: string }) {
  const [show, setShow] = useState(false)
  return show ? (
    <video src={src} poster={poster} controls autoPlay playsInline preload="metadata" className="help-video">
      Tu navegador no puede reproducir este vídeo.
    </video>
  ) : (
    <button type="button" className="help-btn help-btn-video" onClick={() => setShow(true)}>
      ▶ Ver vídeo ({dur}, con la voz de Pepa)
    </button>
  )
}
