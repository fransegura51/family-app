import { createGeminiProvider } from './gemini.ts'
import type { AiProvider } from './types.ts'

// Único sitio que conoce los proveedores disponibles. Para añadir OpenAI u
// otro: un archivo nuevo que cumpla AiProvider y una línea aquí; los
// propósitos (pepa-intent, split-grocery-list...) no cambian.
export function createProvider(name: string, apiKey: string): AiProvider {
  switch (name) {
    case 'gemini':
      return createGeminiProvider(apiKey)
    default:
      throw new Error(`unknown_ai_provider:${name}`)
  }
}

// Nombre del secreto en el Vault de Supabase para cada proveedor.
export function secretNameFor(providerName: string): string {
  return providerName === 'gemini' ? 'gemini_api_key' : `${providerName}_api_key`
}
