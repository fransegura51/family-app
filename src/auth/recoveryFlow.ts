import { useSyncExternalStore } from 'react'

// «Contraseña olvidada» con código de seis cifras. Con el enlace antiguo, la app sabía que estaba recuperando la contraseña por el #type=recovery de la
// dirección (App.tsx → isPasswordRecoveryLink). Con el código no hay dirección que mirar: al confirmar el código Supabase abre una sesión de
// recuperación y, sin este aviso, la app creería que la persona ya había entrado y se saltaría la pantalla de «elige tu contraseña nueva».
// El aviso vive solo en memoria: al recargar, la persona queda dentro con esa sesión (igual que ya ocurría con el enlace) y puede cambiarla desde
// Configuración → Seguridad.
let active = false
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach((l) => l())
}

export const recoveryFlow = {
  begin(): void {
    active = true
    emit()
  },
  end(): void {
    active = false
    emit()
  },
  isActive(): boolean {
    return active
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

export function useRecoveryFlowActive(): boolean {
  return useSyncExternalStore(recoveryFlow.subscribe, recoveryFlow.isActive, () => false)
}
