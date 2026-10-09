// Registro de uso de la app (migración 0226): cuántas veces se abre y qué pantallas se visitan. SOLO contadores con el nombre de la
// pantalla — nunca contenido, rutas con identificadores ni datos de la familia.
//
// Coste de llamadas a Supabase (a propósito, muy bajo): los contadores se acumulan en el móvil y se mandan juntos en UNA sola llamada
// como mucho cada 5 minutos de uso, más una al pasar la app a segundo plano. Lo que no llega a enviarse queda guardado en el móvil
// y se manda en la siguiente ocasión (no se pierde).
import { supabase } from '@/data/supabaseClient'
import { OPEN_KEY } from '@/domain/usageSections'

const PENDING_KEY = 'family-app:usage-pending'
const FLUSH_EVERY_MS = 5 * 60_000
const CHECK_EVERY_MS = 60_000
// Volver a la app tras más de este tiempo en segundo plano cuenta como una apertura nueva.
const REOPEN_AFTER_HIDDEN_MS = 30 * 60_000

type Counts = Record<string, number>

let pending: Counts = loadPending()
let lastFlushAt = 0
let flushing = false
let hiddenAt: number | null = null

function loadPending(): Counts {
  try {
    const raw = localStorage.getItem(PENDING_KEY)
    return raw ? (JSON.parse(raw) as Counts) : {}
  } catch {
    return {}
  }
}

function savePending(): void {
  try {
    if (Object.keys(pending).length === 0) localStorage.removeItem(PENDING_KEY)
    else localStorage.setItem(PENDING_KEY, JSON.stringify(pending))
  } catch {
    // Sin almacenamiento: solo se pierde lo que no llegue a enviarse antes de cerrar.
  }
}

function add(key: string): void {
  pending[key] = (pending[key] ?? 0) + 1
  savePending()
}

export function recordOpen(): void {
  add(OPEN_KEY)
}

export function recordSection(key: string): void {
  add(key)
}

// Manda lo acumulado. Si falla, se devuelve a la cola para el siguiente intento; nunca lanza (el registro no debe romper la app).
export async function flushUsage(): Promise<void> {
  if (flushing || Object.keys(pending).length === 0) return
  flushing = true
  const batch = pending
  pending = {}
  savePending()
  try {
    const { error } = await supabase.rpc('record_app_usage', { p_counts: batch })
    if (error) throw error
    lastFlushAt = Date.now()
  } catch {
    for (const [key, n] of Object.entries(batch)) pending[key] = (pending[key] ?? 0) + n
    savePending()
  } finally {
    flushing = false
  }
}

// Arranca el registro de ESTA sesión: cuenta la apertura y deja el envío periódico. Devuelve la función para pararlo.
export function startUsageTracking(): () => void {
  recordOpen()
  void flushUsage() // lo que quedara pendiente de antes + esta apertura

  const timer = setInterval(() => {
    if (document.visibilityState === 'visible' && Date.now() - lastFlushAt >= FLUSH_EVERY_MS) void flushUsage()
  }, CHECK_EVERY_MS)

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now()
      void flushUsage()
    } else {
      if (hiddenAt !== null && Date.now() - hiddenAt >= REOPEN_AFTER_HIDDEN_MS) recordOpen()
      hiddenAt = null
    }
  }
  document.addEventListener('visibilitychange', onVisibility)

  return () => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}
