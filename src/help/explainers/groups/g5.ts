import { EXPLAINERS_AYUDA } from '@/help/explainers/g5/ayuda'
import { EXPLAINERS_CONFIGURACION } from '@/help/explainers/g5/configuracion'
import { EXPLAINERS_CUENTAS } from '@/help/explainers/g5/cuentas'
import { EXPLAINERS_FAMILIA } from '@/help/explainers/g5/familia'
import { EXPLAINERS_UBICACION } from '@/help/explainers/g5/ubicacion'
import type { HelpExplainer } from '@/help/explainers/types'

// Explicaciones «Cómo funciona PEPA» del grupo g5: Familia, Cuentas (compartidas o separadas, privacidad), Configuración y avisos, Ubicación y Ayuda (sugerencias y reseñas).
export const EXPLAINERS_G5: HelpExplainer[] = [...EXPLAINERS_FAMILIA, ...EXPLAINERS_CUENTAS, ...EXPLAINERS_CONFIGURACION, ...EXPLAINERS_UBICACION, ...EXPLAINERS_AYUDA]
