// Preferencias del Comparador de precios: modo (productos idénticos / alternativas comparables) y ordenación. Son de la FAMILIA: las comparten todos los miembros y sus
// dispositivos mediante el sistema de preferencias de siempre (prefsRegistry + tabla `family_prefs`, migración 0343); sin conexión se recuerdan en el aparato.
import { useEffect, useState } from 'react'
import { COMPARE_MODES, COMPARE_SORTS, type CompareMode, type CompareSort } from '@/domain/comparisonModes'
import { prefSet } from '@/state/prefs/prefsWrite'
import { onPrefChange } from '@/state/prefs/usePrefChange'

export const COMPARE_MODE_KEY = 'familyapp:compras-compare-mode'
export const COMPARE_SORT_KEY = 'familyapp:compras-compare-sort'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function readCompareMode(): CompareMode {
  const v = read(COMPARE_MODE_KEY)
  return (COMPARE_MODES as readonly string[]).includes(v ?? '') ? (v as CompareMode) : 'identicos'
}

export function readCompareSort(): CompareSort {
  const v = read(COMPARE_SORT_KEY)
  return (COMPARE_SORTS as readonly string[]).includes(v ?? '') ? (v as CompareSort) : 'categoria'
}

export function useCompareViewPrefs(): { mode: CompareMode; sort: CompareSort; setMode: (m: CompareMode) => void; setSort: (s: CompareSort) => void } {
  const [mode, setModeState] = useState<CompareMode>(readCompareMode)
  const [sort, setSortState] = useState<CompareSort>(readCompareSort)
  useEffect(() => {
    const off1 = onPrefChange(COMPARE_MODE_KEY, () => setModeState(readCompareMode()))
    const off2 = onPrefChange(COMPARE_SORT_KEY, () => setSortState(readCompareSort()))
    return () => {
      off1()
      off2()
    }
  }, [])
  return {
    mode,
    sort,
    setMode: (m) => {
      setModeState(m)
      try {
        prefSet(COMPARE_MODE_KEY, m)
      } catch {
        /* sin almacenamiento: vale mientras la pantalla esté abierta */
      }
    },
    setSort: (s) => {
      setSortState(s)
      try {
        prefSet(COMPARE_SORT_KEY, s)
      } catch {
        /* idem */
      }
    },
  }
}
