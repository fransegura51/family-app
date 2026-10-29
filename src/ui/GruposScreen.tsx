import { useParams } from 'react-router-dom'
import { GroupDetail } from '@/ui/groups/GroupDetail'
import { GruposHome } from '@/ui/groups/GruposHome'
import { FundScreen } from '@/ui/groups/FundScreen'
import { ParticipantsScreen } from '@/ui/groups/ParticipantsScreen'
import { ReceiveGroup } from '@/ui/groups/ReceiveGroup'

// Gestión de grupos. Rutas: /grupos · /grupos/recibir · /grupos/<grupo> · /grupos/<grupo>/participantes · /grupos/<grupo>/bote/<bote>
export function GruposScreen() {
  const parts = (useParams()['*'] ?? '').split('/').filter(Boolean)
  if (parts.length === 0) return <GruposHome />
  if (parts[0] === 'recibir') return <ReceiveGroup />
  const groupId = parts[0]
  if (parts[1] === 'participantes') return <ParticipantsScreen groupId={groupId} />
  if (parts[1] === 'bote' && parts[2]) return <FundScreen groupId={groupId} fundId={parts[2]} />
  return <GroupDetail groupId={groupId} />
}

export default GruposScreen
