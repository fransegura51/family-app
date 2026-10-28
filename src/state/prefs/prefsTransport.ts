import { supabase } from '@/data/supabaseClient'
import type { PrefsTransport, PrefValue, SetResult, SignalHint } from '@/state/prefs/prefsEngine'
import { isFamilyPrefKey } from '@/state/prefs/prefsRegistry'

// Red real de las preferencias: las PERSONALES van a la tabla `user_prefs` con `set_user_pref` (migración 0305) y las de la FAMILIA (modo y orden del Comparador) a `family_prefs`
// con `set_family_pref` (migración 0343). Las dos tablas comparten la secuencia de revisiones, así que el motor las trata como un único flujo ordenado: no hay un segundo motor.
// Una suscripción de tiempo real por tabla y dispositivo.
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

function hintOf(payload: { new?: unknown }): SignalHint {
  const next = payload.new as { key?: string; value?: unknown; rev?: number | string } | undefined
  return {
    key: typeof next?.key === 'string' ? next.key : undefined,
    rev: next?.rev === undefined ? undefined : Number(next.rev),
    valueKind: kindOf(next?.value),
    valueLength: typeof next?.value === 'string' ? next.value.length : undefined,
  }
}

export function createSupabasePrefsTransport(userId: string): PrefsTransport {
  // La familia se averigua una vez (la RLS ya limita las filas a la propia; el id solo sirve para filtrar el tiempo real).
  let familyId: Promise<string | null> | null = null
  const getFamilyId = (): Promise<string | null> => {
    familyId ??= (async () => {
      try {
        const { data } = await supabase.from('profiles').select('family_id').eq('id', userId).maybeSingle()
        return (data?.family_id as string | null | undefined) ?? null
      } catch {
        return null
      }
    })()
    return familyId
  }

  return {
    async fetchSince(afterRev) {
      const [mine, family] = await Promise.all([
        supabase.from('user_prefs').select('key, value, rev').gt('rev', afterRev).order('rev', { ascending: true }).limit(PAGE),
        supabase.from('family_prefs').select('key, value, rev').gt('rev', afterRev).order('rev', { ascending: true }).limit(PAGE),
      ])
      if (mine.error) throw mine.error
      if (family.error) throw family.error
      // Una clave familiar que quedó guardada como personal (valores anteriores a la 0343) se ignora: manda la de la familia.
      const rows = [
        ...(mine.data ?? []).filter((r) => !isFamilyPrefKey(r.key as string)),
        ...(family.data ?? []).filter((r) => isFamilyPrefKey(r.key as string)),
      ].map((r) => ({ key: r.key as string, value: asValue(r.value), rev: Number(r.rev) }))
      rows.sort((a, b) => a.rev - b.rev)
      return rows
    },
    async set(key, value, baseRev): Promise<SetResult> {
      const rpc = isFamilyPrefKey(key) ? 'set_family_pref' : 'set_user_pref'
      const { data, error } = await supabase.rpc(rpc, { p_key: key, p_value: value, p_base_rev: baseRev })
      if (error) throw error
      const row = (Array.isArray(data) ? data[0] : data) as { applied?: boolean; rev?: number | string; value?: unknown } | null
      if (!row || typeof row.applied !== 'boolean') throw new Error(`Respuesta inesperada de ${rpc}`)
      return { applied: row.applied, rev: Number(row.rev), value: asValue(row.value) }
    },
    subscribe(onSignal, onStatus) {
      let closed = false
      const status = { user: 'pending' as 'pending' | 'up' | 'down', family: 'pending' as 'pending' | 'up' | 'down' | 'none' }
      const report = () => {
        // «up» solo cuando todos los canales que se pidieron están arriba; cualquiera caído = caído.
        if (status.user === 'down' || status.family === 'down') onStatus('down')
        else if (status.user === 'up' && (status.family === 'up' || status.family === 'none')) onStatus('up')
      }
      const track = (name: 'user' | 'family') => (s: string) => {
        if (s === 'SUBSCRIBED') status[name] = 'up'
        else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') status[name] = 'down'
        report()
      }
      const channels: ReturnType<typeof supabase.channel>[] = []

      const userChannel = supabase
        .channel(`user-prefs:${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_prefs', filter: `user_id=eq.${userId}` }, (payload) => {
          // Tiempo real = solo un AVISO. El valor se descarga con fetchSince (ver prefsEngine.ts): el que viaja aquí no se usa.
          onSignal(hintOf(payload))
        })
        .subscribe(track('user'))
      channels.push(userChannel)

      void getFamilyId().then((fid) => {
        if (closed) return
        if (!fid) {
          status.family = 'none'
          report()
          return
        }
        const familyChannel = supabase
          .channel(`family-prefs:${fid}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'family_prefs', filter: `family_id=eq.${fid}` }, (payload) => {
            onSignal(hintOf(payload))
          })
          .subscribe(track('family'))
        channels.push(familyChannel)
      })

      return () => {
        closed = true
        for (const ch of channels) void supabase.removeChannel(ch)
      }
    },
  }
}
