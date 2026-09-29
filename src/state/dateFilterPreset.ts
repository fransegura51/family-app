import { useEffect, useState } from 'react'
import { getDateFilterPreferences } from '@/data/family'
import type { SpendRangePreset } from '@/domain/dateRanges'

// "Configuración → Filtros temporales" — el favorito pasó de localStorage (por dispositivo) a `profiles`
// (por USUARIO real, ver data/family.ts) tras la validación real en iPhone: cambiar de móvil perdía el
// favorito, y dos personas compartiendo el mismo dispositivo/navegador se pisaban el favorito sin querer.
// Este hook es solo la comodidad de arranque para cada pantalla con "📅 Fecha" — sigue siendo un [preset,
// setPreset] normal (el filtro de LA SESIÓN de esa pantalla), solo que el valor inicial llega de forma
// asíncrona desde el favorito real en vez de partir siempre de 'mes' a pelo. El favorito en sí (marcarlo/
// desmarcarlo) se administra desde Configuración → Filtros temporales (MenuSettingsScreen.tsx), nunca desde
// aquí — FAVORITO != FILTRO ACTUAL: elegir un filtro para esta sesión nunca reescribe el favorito guardado.
export function useDateFilterPreset(): [SpendRangePreset, (p: SpendRangePreset) => void] {
  const [preset, setPreset] = useState<SpendRangePreset>('mes')
  useEffect(() => {
    getDateFilterPreferences()
      .then(({ favorite }) => {
        if (favorite) setPreset(favorite)
      })
      .catch(() => {
        // Sin favorito disponible (sin sesión, red...) — se queda en 'mes', el valor por defecto de
        // siempre, exactamente el mismo comportamiento que antes de que existiera esta preferencia.
      })
    // Solo al montar — cambiar el preset después (el usuario elige otro filtro para esta sesión) nunca
    // debe volver a sobrescribirse solo con el favorito.
  }, [])
  return [preset, setPreset]
}
