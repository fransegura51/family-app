import { createGeminiProvider } from './gemini.ts'
import { assertNoHealthData } from './healthGuard.ts'
import type { AiProvider } from './types.ts'

// Único sitio que conoce los proveedores disponibles. Para añadir OpenAI u
// otro: un archivo nuevo que cumpla AiProvider y una línea aquí; los
// propósitos (pepa-intent, split-grocery-list...) no cambian.
//
// Todo proveedor sale envuelto en la guarda de datos de salud (healthGuard.ts):
// es el punto único de salida hacia la IA para la puerta central, para las dos
// funciones que llaman directamente y para Comunidad, así que también cubre
// funciones que se escriban en el futuro.
export function createProvider(name: string, apiKey: string): AiProvider {
  switch (name) {
    case 'gemini':
      return guardHealthData(createGeminiProvider(apiKey))
    default:
      throw new Error(`unknown_ai_provider:${name}`)
  }
}

export function guardHealthData(provider: AiProvider): AiProvider {
  return {
    name: provider.name,
    async generate(req) {
      // Se revisa lo que realmente saldría: textos y esquema de respuesta (las imágenes en base64 no se recorren).
      assertNoHealthData({ parts: req.parts, responseSchema: req.responseSchema })
      return provider.generate(req)
    },
  }
}

// Nombre del secreto en el Vault de Supabase para cada proveedor.
export function secretNameFor(providerName: string): string {
  return providerName === 'gemini' ? 'gemini_api_key' : `${providerName}_api_key`
}
