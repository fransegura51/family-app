import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { DEFAULT_NAME_PREFS, makeNamer, sortByPrefs, type NamePrefs } from '@/domain/groupNames'
import type { Participant } from '@/domain/groups'

interface Value {
  prefs: NamePrefs
  /** «Nombre» de un participante según el formato del grupo (con la diferenciación de repetidos calculada sobre toda la lista del grupo). */
  namer: (p: Pick<Participant, 'id' | 'name' | 'surname'>) => string
  sort: <T extends Pick<Participant, 'id' | 'name' | 'surname'>>(list: T[]) => T[]
}

const fallback: Value = {
  prefs: DEFAULT_NAME_PREFS,
  namer: (p) => [p.name, p.surname].filter((x) => x && x.trim()).join(' ').trim(),
  sort: (list) => sortByPrefs(list, 'name'),
}

const Ctx = createContext<Value>(fallback)

/** Formato de nombres del grupo para todas las pantallas que lo cuelgan (listas, pagados/pendientes, pickers). Sin proveedor se muestra «Nombre Apellidos». */
export function NamePrefsProvider({ participants, prefs, children }: { participants: Participant[]; prefs: NamePrefs; children: ReactNode }) {
  const value = useMemo<Value>(() => {
    const live = participants.filter((p) => !p.leftAt)
    // La diferenciación de repetidos se calcula entre los participantes activos; las personas de baja no «ocupan» una inicial.
    const namer = makeNamer(live.length > 0 ? live : participants, prefs)
    const all = makeNamer(participants, prefs)
    return {
      prefs,
      namer: (p) => (live.some((x) => x.id === p.id) ? namer(p) : all(p)),
      sort: (list) => sortByPrefs(list, prefs.sortBy),
    }
  }, [participants, prefs])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useNamePrefs = () => useContext(Ctx)
