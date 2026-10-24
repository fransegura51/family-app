import { TOURS_G9_COMUNIDAD } from '@/help/tours/defs/g9/comunidad'
import { TOURS_G9_CONTACTOS_GALERIA } from '@/help/tours/defs/g9/contactosGaleria'
import { TOURS_G9_ECONOMIA } from '@/help/tours/defs/g9/economia'
import { TOURS_G9_FAMILIA } from '@/help/tours/defs/g9/familia'
import { TOURS_G9_PEQUENOS } from '@/help/tours/defs/g9/pequenos'
import { TOURS_G9_UBICACION } from '@/help/tours/defs/g9/ubicacion'
import type { TourDef } from '@/help/tours/types'

// Tutoriales «Enséñame» del grupo g9: funciones de la Ayuda que no tenían recorrido (Economía, Pequeños Grandes, Familia, Contactos, Galería, Ubicación y Comunidad).
// Ninguno hace nada por la persona: solo señalan y esperan (o explican, si la acción es del banco, de compartir, de dar acceso o de denunciar).
export const TOURS_G9: TourDef[] = [
  ...TOURS_G9_ECONOMIA,
  ...TOURS_G9_PEQUENOS,
  ...TOURS_G9_FAMILIA,
  ...TOURS_G9_CONTACTOS_GALERIA,
  ...TOURS_G9_UBICACION,
  ...TOURS_G9_COMUNIDAD,
]
