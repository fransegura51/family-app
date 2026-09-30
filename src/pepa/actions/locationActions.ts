// Acción de "Hablar con PEPA": guardar un sitio encontrado por voz como lugar frecuente de
// Ubicación. Mismo contrato que el resto (pepa/actions/types.ts) — se enseña en una tarjeta y solo
// se escribe al confirmar.
import { addPlace } from '@/data/location'
import { defineAction, type Selection } from '@/pepa/actions/types'
import { asRecord, unknownKeys } from '@/pepa/actions/validators'

export interface LocationAddPlaceParams {
  name: string
  latitude: number
  longitude: number
  radiusM: number
}

const KEYS = ['name', 'latitude', 'longitude', 'radiusM'] as const
// Mismo radio por defecto que el formulario de siempre (ui/LocationScreen.tsx, AddPlaceForm).
const DEFAULT_RADIUS_M = 150

function isFiniteInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

export const locationAddPlaceAction = defineAction<LocationAddPlaceParams>({
  id: 'location.addPlace',

  validate(raw) {
    const rec = asRecord(raw)
    if (!rec) return { ok: false, errors: ['Petición no válida'] }
    const errors: string[] = []
    const extra = unknownKeys(rec, KEYS)
    if (extra.length > 0) errors.push(`Campos no permitidos: ${extra.join(', ')}`)

    const name = typeof rec.name === 'string' ? rec.name.trim() : ''
    if (name.length === 0 || name.length > 80) errors.push('El nombre no es válido')
    if (!isFiniteInRange(rec.latitude, -90, 90)) errors.push('La ubicación no es válida')
    if (!isFiniteInRange(rec.longitude, -180, 180)) errors.push('La ubicación no es válida')
    const radiusM = isFiniteInRange(rec.radiusM, 10, 5000) ? Math.round(rec.radiusM as number) : undefined
    if (radiusM === undefined) errors.push('El radio no es válido')
    if (errors.length > 0) return { ok: false, errors }

    return { ok: true, params: { name, latitude: rec.latitude as number, longitude: rec.longitude as number, radiusM: radiusM as number } }
  },

  initialSelection(params): Selection {
    return { choices: {}, checked: [], values: { name: params.name } }
  },

  applySelection(params, selection) {
    const name = selection.values?.name
    return name !== undefined ? { ...params, name: name.trim() || params.name } : params
  },

  present(params) {
    return {
      title: '📍 Guardar lugar',
      lines: [`Radio: ${params.radiusM} m`],
      warnings: [],
      choices: [],
      checks: [],
      fields: [{ id: 'name', label: 'Nombre', inputMode: 'text' }],
      confirmLabel: 'Guardar lugar',
    }
  },

  async execute(params) {
    await addPlace({ name: params.name, latitude: params.latitude, longitude: params.longitude, radiusM: params.radiusM })
    // LocationScreen (Ubicación) refresca sola cada 30s, pero igual que en el resto de acciones de
    // Pepa (shopping.add, calendar.create) conviene que se vea al momento si esa pantalla ya está abierta.
    window.dispatchEvent(new CustomEvent('family-app:location-changed'))
    return `Guardado «${params.name}» en tus lugares frecuentes.`
  },
})

export const DEFAULT_PLACE_RADIUS_M = DEFAULT_RADIUS_M
