// Catálogo de iconos (avatares) de Comunidad. El «identificador» es el propio emoji (así se guarda en community_profiles.avatar_emoji: sin cambios en la base de datos). El
// servidor solo exige ≤ 16 caracteres y ni letras ni dígitos (community_set_alias), así que cualquier emoji de esta lista vale. Se usan emojis de Unicode ≤ 13 (iOS 14+, Android 11+),
// sin imágenes ni servicios externos. Los 20 iconos que ya existían se conservan TODOS (marcados abajo con su categoría de siempre).
export type AvatarCategoryId = 'caras' | 'animales' | 'comida' | 'aficiones' | 'naturaleza' | 'personajes'

export interface AvatarCategory {
  id: AvatarCategoryId
  label: string
  /** Icono de la pestaña (uno de los propios de la categoría). */
  tab: string
  icons: string[]
}

export const AVATAR_CATEGORIES: AvatarCategory[] = [
  {
    id: 'caras',
    label: 'Caras',
    tab: '🙂',
    icons: ['🙂', '😀', '😄', '😎', '🤗', '😊', '😁', '🤩', '🥳', '😇', '🤓', '😋', '😌', '🥰', '😺', '🤠', '😴', '🤭'],
  },
  {
    id: 'animales',
    label: 'Animales',
    tab: '🐶',
    icons: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🦉', '🦄', '🐝', '🦋', '🐢', '🐙', '🐬', '🦒', '🐘', '🦔'],
  },
  {
    id: 'comida',
    label: 'Comida',
    tab: '🍳',
    icons: ['🧑‍🍳', '👩‍🍳', '👨‍🍳', '🍳', '🥘', '🍰', '🍎', '🍓', '🍋', '🥑', '🍕', '🍔', '🌮', '🥐', '🍞', '🧀', '🥕', '🍪', '🍩', '🍦', '🥗', '🍜', '🥞', '☕'],
  },
  {
    id: 'aficiones',
    label: 'Aficiones',
    tab: '🎨',
    icons: ['🎨', '🧸', '🧺', '⚽', '🏀', '🎾', '🏐', '🏊', '🚴', '🎸', '🎹', '🎮', '🎲', '🧩', '📚', '🎯', '🎣', '⛺', '🧶', '🛹'],
  },
  {
    id: 'naturaleza',
    label: 'Naturaleza',
    tab: '🌻',
    icons: ['🌿', '🏡', '🌻', '⭐', '🌳', '🌲', '🌴', '🌵', '🌷', '🌹', '🍀', '🍄', '🌈', '☀️', '🌙', '❄️', '🔥', '🌊', '🌸', '🍁'],
  },
  {
    id: 'personajes',
    label: 'Personajes',
    tab: '🦸',
    icons: ['🦸', '🧙', '🧚', '🧜', '🧞', '🤖', '👻', '👽', '🥷', '👸', '🤴', '🧑‍🚀', '🧑‍🎨', '🧑‍🏫', '🧑‍🔬', '🧑‍🚒', '🧑‍✈️', '🧑‍⚕️', '🧑‍🌾'],
  },
]

/** Los 20 iconos que ya existían antes de ampliar el catálogo: nunca se quitan (hay personas que los tienen elegidos). */
export const LEGACY_AVATARS = ['🙂', '😀', '😄', '😎', '🤗', '🧑‍🍳', '👩‍🍳', '👨‍🍳', '🍳', '🥘', '🍰', '🌿', '🏡', '🧺', '🧸', '🎨', '🌻', '🐶', '🐱', '⭐'] as const

export const ALL_AVATARS: string[] = AVATAR_CATEGORIES.flatMap((c) => c.icons)

/** Categoría que contiene un icono (para abrir el selector en la pestaña del icono elegido). */
export function categoryOfAvatar(emoji: string | null | undefined): AvatarCategoryId {
  if (!emoji) return 'caras'
  return AVATAR_CATEGORIES.find((c) => c.icons.includes(emoji))?.id ?? 'caras'
}

/** Misma regla que community_set_alias en el servidor: ≤ 16 caracteres (code points) y sin letras ni dígitos. */
export function isValidAvatar(emoji: string): boolean {
  return [...emoji].length <= 16 && emoji.trim().length > 0 && !/[A-Za-z0-9À-ÿ]/.test(emoji)
}
