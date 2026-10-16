// Guarda de ejecución contra datos de SALUD (alergias e intolerancias de la ficha privada, migración 0279) en cualquier petición a un proveedor de IA.
// Código puro (sin APIs de Deno ni de navegador): lo usan createProvider() (servidor, punto único de salida hacia Gemini) y callAiFunction() (cliente,
// puerta única hacia las funciones de IA). Si una carga lleva una CLAVE o un identificador de esos datos, NO sale: se lanza un error sin contenido.
//
// LÍMITE HONESTO: esta guarda detecta ERRORES DE PROGRAMACIÓN (alguien conecta la ficha a una petición). No puede saber si una frase libre que escribe
// o dicta la persona («apunta que Eric es alérgico a los cacahuetes») contiene un dato de salud, ni controla lo que ocurra en el proveedor.
// La barrera real es estructural: ninguna función de servidor puede leer la tabla (permisos revocados a service_role) y ningún archivo de IA importa
// el módulo de alergias (prueba estática src/data/dietaryPrivacyLock.test.ts).

import { AiProviderError } from './types.ts'

// Identificadores técnicos que NUNCA deben aparecer dentro del texto de una petición (tablas, funciones, módulos y campos de la ficha).
export const HEALTH_FORBIDDEN_MARKERS: readonly string[] = [
  'member_dietary_restrictions',
  'member_health_consent',
  'dietary_restrictions',
  'dietaryrestrictions',
  'allergen_key',
  'allergenkey',
  'dietary_grant_consent',
  'dietary_revoke_consent',
  'dietary_list',
  'dietary_add',
  'dietary_update',
  'dietary_delete',
  'health_consent',
]

// Nombres de CAMPO (sin guiones bajos, en minúsculas) que no pueden viajar en el cuerpo ni en el esquema de una petición.
export const HEALTH_FORBIDDEN_KEYS: readonly string[] = [
  'allergenkey',
  'customlabel',
  'dietaryrestrictions',
  'dietaryrestriction',
  'memberdietaryrestrictions',
  'memberhealthconsent',
  'healthconsent',
  'allergies',
  'alergias',
  'intolerancias',
  'healthdata',
  'datosdesalud',
]

// Es un AiProviderError (estado 400) para que la puerta central lo trate como cualquier fallo del proveedor: «no se ha podido preparar».
export class HealthDataBlockedError extends AiProviderError {
  constructor() {
    // Mensaje fijo: jamás incluye el contenido bloqueado.
    super(400, 'health_data_blocked')
    this.name = 'HealthDataBlockedError'
  }
}

const MAX_DEPTH = 12
// Las imágenes y documentos van en base64: no se recorren (no son texto de la persona y pueden pesar megas).
const SKIP_KEYS = new Set(['data', 'inlinedata', 'inline_data'])

function walk(value: unknown, depth: number): boolean {
  if (depth > MAX_DEPTH) return true // demasiado anidado: se bloquea por prudencia
  if (typeof value === 'string') {
    const lower = value.toLowerCase()
    return HEALTH_FORBIDDEN_MARKERS.some((m) => lower.includes(m))
  }
  if (Array.isArray(value)) return value.some((v) => walk(v, depth + 1))
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const flat = k.toLowerCase().replace(/[_-]/g, '')
      if (HEALTH_FORBIDDEN_KEYS.includes(flat)) return true
      const lowerKey = k.toLowerCase()
      if (HEALTH_FORBIDDEN_MARKERS.some((m) => lowerKey.includes(m))) return true
      if (SKIP_KEYS.has(lowerKey) && typeof v === 'string') continue
      if (walk(v, depth + 1)) return true
    }
  }
  return false
}

// Devuelve true si la carga lleva claves o identificadores de datos de salud.
export function containsHealthData(payload: unknown): boolean {
  return walk(payload, 0)
}

// Lanza HealthDataBlockedError (sin contenido) si la carga lleva datos de salud.
export function assertNoHealthData(payload: unknown): void {
  if (containsHealthData(payload)) throw new HealthDataBlockedError()
}
