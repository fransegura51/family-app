import type { AiPurposeSpec } from '../types.ts'
import { asCleanString, asRecord, parseJsonLoose } from '../validate.ts'

// PEPA Eventos, prompt maestro Parte A6 — "Importar datos con foto": tarjeta de visita, captura de Google
// Maps, foto o documento de un proveedor. Un solo lector genérico, mismo patrón que eventFoodDocument.ts
// (gateway/proveedor/cuota comunes en _shared/ai/gateway.ts). La salida es SIEMPRE una propuesta que la
// familia revisa y corrige antes de guardar — esta función nunca guarda nada ni crea ninguna ficha.
// REGLA FUNDAMENTAL: nunca inventar ni completar un dato que no esté escrito con claridad en la imagen.

export interface ProviderContactDocumentInput {
  fileBase64: string
  mimeType: string
}

export interface ProviderContactDocumentOutput {
  name: string | null
  type: string | null
  contactPerson: string | null
  phone: string | null
  email: string | null
  website: string | null
  address: string | null
}

const PROVIDER_CONTACT_DOCUMENT_PROMPT =
  'Esta imagen o documento es una TARJETA DE VISITA, una CAPTURA DE GOOGLE MAPS (ficha de un negocio) o algo ' +
  'similar de un proveedor para un evento familiar (floristería, catering, fotógrafo, DJ, local, etc.). Tu trabajo ' +
  'es EXTRAER los datos de contacto reales que aparezcan, para que una persona los revise después.\n' +
  'Reglas estrictas:\n' +
  '- NUNCA inventes ni completes ningún dato. Si un campo no aparece con claridad, devuélvelo como null — ni ' +
  'siquiera un prefijo de país del teléfono si no está escrito, ni una categoría que no se pueda deducir del ' +
  'propio documento.\n' +
  '- "name": el nombre COMERCIAL del negocio/proveedor (nunca el de una persona suelta, salvo que el negocio se ' +
  'llame así).\n' +
  '- "type": una categoría o servicio corto en español (p. ej. "Floristería", "Catering", "Fotógrafo", "DJ", ' +
  '"Local de celebraciones") SOLO si se deduce con razonable seguridad del propio documento (el rubro del ' +
  'negocio); si no está claro, null.\n' +
  '- "contactPerson": una persona de contacto concreta, SOLO si aparece explícitamente (p. ej. "Atiende: Marta", ' +
  'un nombre bajo un cargo). Si solo hay el nombre del negocio, null.\n' +
  '- "phone": un único teléfono, el principal si hay varios, tal como aparece escrito.\n' +
  '- "email" y "website": tal como aparecen escritos.\n' +
  '- "address": la dirección postal completa tal como aparece, o null si no aparece.\n' +
  'Responde ÚNICAMENTE un objeto JSON con esta forma exacta, sin texto adicional ni markdown:\n' +
  '{"name": "texto o null", "type": "texto o null", "contactPerson": "texto o null", "phone": "texto o null", ' +
  '"email": "texto o null", "website": "texto o null", "address": "texto o null"}\n' +
  'Si la imagen no es una tarjeta de contacto ni tiene datos de un negocio, o no se puede leer casi nada, responde ' +
  'con todos los campos en null.'

export const providerContactDocumentSpec: AiPurposeSpec<ProviderContactDocumentInput, ProviderContactDocumentOutput> = {
  purpose: 'analyze-provider-contact-document',
  maxOutputTokens: 1024,

  readInput(body) {
    const { fileBase64, mimeType } = body
    if (typeof fileBase64 !== 'string' || !fileBase64 || typeof mimeType !== 'string' || !mimeType) return { ok: false, error: 'missing file' }
    return { ok: true, input: { fileBase64, mimeType } }
  },

  buildParts({ fileBase64, mimeType }) {
    return [{ text: PROVIDER_CONTACT_DOCUMENT_PROMPT }, { inlineData: { mimeType, data: fileBase64 } }]
  },

  // Nunca lanza: una respuesta ilegible se trata igual que "no se pudo leer nada" (todo null), nunca rompe
  // la importación.
  parseOutput(rawText) {
    const empty: ProviderContactDocumentOutput = { name: null, type: null, contactPerson: null, phone: null, email: null, website: null, address: null }
    const parsed = asRecord(parseJsonLoose(rawText))
    if (!parsed) return empty
    return {
      name: asCleanString(parsed.name, 160),
      type: asCleanString(parsed.type, 80),
      contactPerson: asCleanString(parsed.contactPerson, 160),
      phone: asCleanString(parsed.phone, 60),
      email: asCleanString(parsed.email, 160),
      website: asCleanString(parsed.website, 200),
      address: asCleanString(parsed.address, 300),
    }
  },
}
