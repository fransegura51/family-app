import pepaAvatar from '@/assets/pepa/pepa-avatar.jpg'
import '@/ui/community/communityProfile.css'

// Icono de quien escribe. La cuenta oficial «Pepa» (la del emoji 👵 amarillo) se enseña con la miniatura de la imagen oficial de Pepa; el resto, con su emoji de
// siempre. La foto solo se usa en cuentas OFICIALES: una persona que elija ese emoji no obtiene la imagen de Pepa.
export const PEPA_OFFICIAL_EMOJI = '👵'

export function isPepaAccount(official: boolean | undefined, emoji: string | null | undefined): boolean {
  return official === true && emoji === PEPA_OFFICIAL_EMOJI
}

export function AuthorAvatar({ emoji, official, fallback = '🙂' }: { emoji: string | null | undefined; official?: boolean; fallback?: string }) {
  if (isPepaAccount(official, emoji)) return <img className="community-pepa-mini" src={pepaAvatar} alt="" width={20} height={20} decoding="async" />
  return <>{emoji ?? fallback}</>
}
