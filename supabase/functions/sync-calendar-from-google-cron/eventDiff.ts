// Comparación pura (sin Deno ni red) entre el evento que ya está guardado y lo que trae Google: la sincronización horaria solo debe ESCRIBIR cuando algo ha cambiado de verdad.
// Antes hacía un `update` de todos los eventos importados en cada vuelta (aunque no cambiara nada): cada update se anotaba en «Actividad reciente» como «Alguien modificó un evento».
export interface ImportedEventFields {
  title: string
  description: string | null
  start_at: string
  end_at: string | null
  all_day: boolean
  recurrence_rule: string | null
  exception_dates: unknown
}

const time = (v: string | null | undefined): number | null => (v ? new Date(v).getTime() : null)
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** true si el evento guardado ya tiene exactamente lo que dice Google (la hora se compara como instante: el formato de texto puede variar). */
export function importedEventUnchanged(stored: ImportedEventFields | null | undefined, incoming: ImportedEventFields): boolean {
  if (!stored) return false
  return (
    stored.title === incoming.title &&
    (stored.description ?? null) === (incoming.description ?? null) &&
    time(stored.start_at) === time(incoming.start_at) &&
    time(stored.end_at) === time(incoming.end_at) &&
    stored.all_day === incoming.all_day &&
    (stored.recurrence_rule ?? null) === (incoming.recurrence_rule ?? null) &&
    same(stored.exception_dates, incoming.exception_dates)
  )
}
