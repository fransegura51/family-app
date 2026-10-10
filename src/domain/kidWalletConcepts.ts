// Pequeños Grandes, Fase 9 (orden de recuperación de requisitos, autorización directa del usuario
// 2026-10-10) — "conceptos con emojis (niños que no leen)": un catálogo cerrado de chips emoji+texto que
// un niño puede tocar en vez de tener que escribir la descripción — mismo patrón "catálogo cerrado +
// texto libre" ya usado en toda la app (p. ej. ANIMACION_CATALOG en eventMusicaFiesta.ts). Tocar un chip
// solo RELLENA el campo de descripción (editable después); nunca sustituye el texto libre, que sigue
// disponible para cualquier cosa que no esté en la lista.
import type { WalletTransactionType } from '@/domain/types'

export interface WalletConceptOption {
  key: string
  emoji: string
  label: string
}

const INCOME_CONCEPTS: WalletConceptOption[] = [
  { key: 'paga', emoji: '💶', label: 'Paga semanal' },
  { key: 'regalo', emoji: '🎁', label: 'Regalo' },
  { key: 'ayudar', emoji: '🧹', label: 'Ayudar en casa' },
  { key: 'cumpleanos', emoji: '🎂', label: 'Cumpleaños' },
  { key: 'encontrado', emoji: '🔍', label: 'Encontrado' },
]

const EXPENSE_CONCEPTS: WalletConceptOption[] = [
  { key: 'chuches', emoji: '🍬', label: 'Chuches' },
  { key: 'juguete', emoji: '🧸', label: 'Juguete' },
  { key: 'videojuego', emoji: '🎮', label: 'Videojuego' },
  { key: 'libro', emoji: '📚', label: 'Libro' },
  { key: 'regalo_a_alguien', emoji: '🎀', label: 'Regalo para alguien' },
  { key: 'cromos', emoji: '🃏', label: 'Cromos o cartas' },
]

// Ahorro/impuesto son movimientos del reparto automático (o, en el caso de ahorro, aportes manuales
// hacia un objetivo) — ninguno de los dos tiene un concepto típico que proponer; el formulario sigue
// con solo el texto libre de siempre para esos dos tipos.
export function conceptsForWalletType(type: WalletTransactionType): WalletConceptOption[] {
  if (type === 'ingreso') return INCOME_CONCEPTS
  if (type === 'gasto') return EXPENSE_CONCEPTS
  return []
}

// Pequeños Grandes, Fase 10 — emoji de un objetivo de ahorro: un catálogo cerrado + "escribir el tuyo"
// (cualquier emoji o texto corto), nunca limitado a esta lista.
export const GOAL_EMOJI_OPTIONS: readonly string[] = ['🚲', '🎮', '📱', '🎁', '⚽', '🎨', '🧸', '📚', '🎸', '👟', '🏖️', '🛹']

