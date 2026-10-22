import { supabase } from '@/data/supabaseClient'
import type { PrefsTransport, PrefValue, SetResult, SignalHint } from '@/state/prefs/prefsEngine'

// Red real de las preferencias (tabla `user_prefs` y función `set_user_pref`, migración 0305). Una sola suscripción de tiempo real por dispositivo.
const PAGE = 1000

function asValue(v: unknown): PrefValue {
  return typeof v === 'string' ? v : null
}

// Forma del valor que viene en el aviso de tiempo real (solo para el diagnóstico; el valor NO se usa).
function kindOf(v: unknown): string {
  if (v === undefined) return 'missing'
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

export function createSupabasePrefsTransport(userId: string): PrefsTransport {
  return {
    async fetchSince(afterRev) {
      const { data, error } = await supabase.from('user_prefs').select('key, value, rev').gt('rev', afterRev).order('rev', { ascending: true }).limit(PAGE)
      if (error) throw error
      return (data ?? []).map((r) => ({ key: r.key as string, value: asValue(r.value), rev: Number(r.rev) }))
    },
    async set(key, value, baseRev): Promise<SetResult> {
      const { data, error } = await supabase.rpc('set_user_pref', { p_key: key, p_value: value, p_base_rev: baseRev })
      if (error) throw error
      const row = (Array.isArray(data) ? data[0] : data) as { applied?: boolean; rev?: number | string; value?: unknown } | null
      if (!row || typeof row.applied !== 'boolean') throw new Error('Respuesta inesperada de set_user_pref')
      return { applied: row.applied, rev: Number(row.rev), value: asValue(row.value) }
    },
    subscribe(onSignal, onStatus) {
      const channel = supabase
        .channel(`user-prefs:${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_prefs', filter: `user_id=eq.${userId}` }, (payload) => {
          // Tiempo real = solo un AVISO. El valor se descarga con fetchSince (ver prefsEngine.ts): el que viaja aquí no se usa.
          const next = payload.new as { key?: string; value?: unknown; rev?: number | string } | undefined
          const hint: SignalHint = {
            key: typeof next?.key === 'string' ? next.key : undefined,
            rev: next?.rev === undefined ? undefined : Number(next.rev),
            valueKind: kindOf(next?.value),
            valueLength: typeof next?.value === 'string' ? next.value.length : undefined,
          }
          onSignal(hint)
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') onStatus('up')
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') onStatus('down')
        })
      return () => {
        void supabase.removeChannel(channel)
      }
    },
  }
}
