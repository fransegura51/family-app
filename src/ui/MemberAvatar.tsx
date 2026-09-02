import { useEffect, useState } from 'react'
import { getMemberPhotoUrl } from '@/data/family'
import type { FamilyMember } from '@/domain/types'

// Foto de perfil circular con el emoji/inicial de siempre como reserva
// si el miembro no tiene foto subida o falla la descarga — para poder
// usarse en cualquier sitio (chips, mapa...) sin comprobaciones aparte.
export function MemberAvatar({ member, size = 32 }: { member: FamilyMember; size?: number }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!member.photoPath) {
      setUrl(null)
      return
    }
    let cancelled = false
    getMemberPhotoUrl(member.photoPath)
      .then((u) => {
        if (!cancelled) setUrl(u)
      })
      .catch(() => {
        if (!cancelled) setUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [member.photoPath])

  const style = { width: size, height: size, fontSize: size * 0.45, borderColor: member.color }

  if (url) {
    return <img src={url} alt={member.name} className="member-avatar" style={style} />
  }
  return (
    <span className="member-avatar member-avatar-fallback" style={{ ...style, background: member.color }}>
      {member.avatar || member.name.charAt(0)}
    </span>
  )
}
