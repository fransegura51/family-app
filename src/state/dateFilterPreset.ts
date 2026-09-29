import type { SpendRangePreset } from '@/domain/dateRanges'

// Bloque 5 de la cola nocturna — motor global de filtros temporales. El SELECTOR ya era compartido
// (DateFilterTab, un único componente reutilizado en Economía y Compras, FinanceScreen.tsx) y la
// resolución de fechas ya vivía en domain/dateRanges.ts — lo que faltaba era un "favorito" persistido,
// DISTINTO del filtro seleccionado en la sesión: cada pantalla arrancaba siempre en 'mes' (mes contable)
// a pelo, así que alguien que casi siempre mira "Mes real" tenía que cambiarlo cada vez, en cada pantalla,
// sin que ese cambio se recordara para la siguiente vez. Por dispositivo, en localStorage — mismo patrón
// que movementColorMode.ts/tabOrder.ts (cada persona de la familia puede preferir un filtro distinto).
// El favorito se actualiza SOLO con una acción explícita (marcar como favorito) — cambiar el filtro de la
// sesión (el desplegable de siempre) nunca lo sobrescribe solo, para no "perder" el favorito sin querer.
const STORAGE_KEY = 'familyapp:date-filter-favorite'
const DEFAULT_PRESET: SpendRangePreset = 'mes'
const VALID_PRESETS: SpendRangePreset[] = ['dia', 'semana', 'mes', 'mes_real', 'año', 'rango']

export function loadFavoriteDateFilterPreset(): SpendRangePreset {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    // 'rango' no se guarda como favorito: un rango de fechas concreto (desde/hasta) deja de tener sentido
    // pasado el tiempo — si alguna vez se guardó (versión anterior de este ajuste), se ignora y se cae al
    // valor por defecto, en vez de arrancar siempre en un rango fijo que ya no corresponde a "ahora".
    return raw && VALID_PRESETS.includes(raw as SpendRangePreset) && raw !== 'rango' ? (raw as SpendRangePreset) : DEFAULT_PRESET
  } catch {
    return DEFAULT_PRESET
  }
}

export function saveFavoriteDateFilterPreset(preset: SpendRangePreset): void {
  if (preset === 'rango') return
  try {
    localStorage.setItem(STORAGE_KEY, preset)
  } catch {
    // localStorage no disponible (privado/bloqueado): se pierde recordar el favorito, no es crítico.
  }
}
