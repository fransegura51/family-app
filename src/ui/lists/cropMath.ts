// Rectángulo de recorte en fracciones de la imagen (0..1): así sigue valiendo con cualquier zoom o tamaño de pantalla.
export interface CropRect {
  x: number
  y: number
  w: number
  h: number
}
export type Corner = 'nw' | 'ne' | 'sw' | 'se'
export const MIN_CROP = 0.06
export const FULL_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 }
export const DEFAULT_CROP: CropRect = { x: 0.08, y: 0.08, w: 0.84, h: 0.84 }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function moveRect(r: CropRect, dx: number, dy: number): CropRect {
  return { ...r, x: clamp(r.x + dx, 0, 1 - r.w), y: clamp(r.y + dy, 0, 1 - r.h) }
}

// Arrastrar una esquina: la esquina contraria se queda quieta; nunca se sale de la imagen ni baja del tamaño mínimo.
export function resizeRect(r: CropRect, corner: Corner, dx: number, dy: number): CropRect {
  let left = r.x
  let top = r.y
  let right = r.x + r.w
  let bottom = r.y + r.h
  if (corner === 'nw' || corner === 'sw') left = clamp(left + dx, 0, right - MIN_CROP)
  else right = clamp(right + dx, left + MIN_CROP, 1)
  if (corner === 'nw' || corner === 'ne') top = clamp(top + dy, 0, bottom - MIN_CROP)
  else bottom = clamp(bottom + dy, top + MIN_CROP, 1)
  return { x: left, y: top, w: right - left, h: bottom - top }
}

// Píxeles reales del recorte sobre una imagen de ancho × alto; siempre dentro de la imagen y de al menos 1 px.
export function pixelRect(r: CropRect, width: number, height: number): { sx: number; sy: number; sw: number; sh: number } {
  const sx = clamp(Math.round(r.x * width), 0, width - 1)
  const sy = clamp(Math.round(r.y * height), 0, height - 1)
  const sw = clamp(Math.round(r.w * width), 1, width - sx)
  const sh = clamp(Math.round(r.h * height), 1, height - sy)
  return { sx, sy, sw, sh }
}

// Tamaño de salida: se reduce si pasa de maxDim por el lado largo (nunca se amplía).
export function outputSize(sw: number, sh: number, maxDim = 1600): { w: number; h: number } {
  const scale = Math.min(1, maxDim / Math.max(sw, sh))
  return { w: Math.max(1, Math.round(sw * scale)), h: Math.max(1, Math.round(sh * scale)) }
}
