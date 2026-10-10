// «Pepa, ¿dónde está Eric?»: tras contestar, Pepa abre la pantalla de Ubicación con esa persona seleccionada y el mapa centrado en ella. Como la
// pantalla puede no estar montada todavía cuando Pepa lo pide (se navega a ella justo después), el aviso se deja guardado un momento y la pantalla lo
// recoge al montarse; si ya estaba abierta, lo recoge por el evento.
export interface MemberFocus {
  memberId: string
  latitude: number
  longitude: number
}

const FOCUS_EVENT = 'family-app:focus-member'
const MAX_AGE_MS = 60_000

let pending: (MemberFocus & { at: number }) | null = null

export function requestMemberFocus(focus: MemberFocus): void {
  pending = { ...focus, at: Date.now() }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(FOCUS_EVENT, { detail: focus }))
}

// Lo pendiente de hace menos de un minuto, y lo da por recogido (no se vuelve a aplicar al volver a entrar a la pantalla más tarde).
export function consumeMemberFocus(nowMs: number = Date.now()): MemberFocus | null {
  const found = pending
  pending = null
  if (!found || nowMs - found.at > MAX_AGE_MS) return null
  return { memberId: found.memberId, latitude: found.latitude, longitude: found.longitude }
}

export function onMemberFocus(listener: (focus: MemberFocus) => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  const handler = (event: Event) => {
    pending = null // lo atiende este oyente: que no se aplique otra vez al montar
    listener((event as CustomEvent<MemberFocus>).detail)
  }
  window.addEventListener(FOCUS_EVENT, handler)
  return () => window.removeEventListener(FOCUS_EVENT, handler)
}
