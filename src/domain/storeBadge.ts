import { normalizeStoreName } from '@/domain/storeChains'

// Insignia de texto de una tienda sin logotipo: iniciales y un color estable (el mismo nombre siempre sale igual). Contraste de texto blanco ≥ 4,5:1 en todos los colores.
const PALETTE = ['#2f6f4e', '#b4452d', '#3b5bb5', '#7a3fa0', '#9a5b13', '#0f766e', '#a1294f', '#4a5568']
// Palabras que no dicen nada de la tienda (el nombre del banco suele traer «SUPERMERCADO …»).
const GENERIC = new Set(['supermercado', 'supermercados', 'tienda', 'super', 'hipermercado', 'de', 'la', 'el', 'los', 'las', 'y', 'sl', 'sa', 'distribucion'])

export interface StoreBadgeSpec {
  text: string
  background: string
  color: string
}

export function storeBadge(name: string): StoreBadgeSpec {
  const words = normalizeStoreName(name)
    .split(' ')
    .filter((w) => w && !GENERIC.has(w))
  const picked = words.length ? words : normalizeStoreName(name).split(' ').filter(Boolean)
  const text = picked.length >= 2 ? picked[0][0] + picked[1][0] : (picked[0] ?? '?').slice(0, 2)
  let h = 0
  for (const ch of normalizeStoreName(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return { text: text.charAt(0).toUpperCase() + text.slice(1).toLowerCase(), background: PALETTE[h % PALETTE.length], color: '#ffffff' }
}
