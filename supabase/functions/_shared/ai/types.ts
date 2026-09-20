// Contrato común de la capa de IA de PEPA. Ninguna función de negocio habla
// con un proveedor concreto (Gemini, OpenAI...): pide algo a través de
// AiProvider, y cambiar de proveedor es escribir otro archivo que cumpla
// esta interfaz y cambiar el ajuste `provider` en la tabla ai_config.

export type AiPart = { text: string } | { inlineData: { mimeType: string; data: string } }

export interface AiGenerateRequest {
  model: string
  parts: AiPart[]
  // Salida estructurada: el proveedor obliga al modelo a devolver JSON con
  // esta forma. Sigue haciendo falta validar el resultado en código.
  responseSchema?: unknown
  // Tope de palabras que puede generar el modelo (control de coste).
  maxOutputTokens?: number
}

export interface AiGenerateResult {
  text: string
  tokensIn: number
  tokensOut: number
}

export interface AiProvider {
  readonly name: string
  generate(req: AiGenerateRequest): Promise<AiGenerateResult>
}

export class AiProviderError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// Lo que cada propósito de IA (clasificar una pregunta, separar una lista...)
// declara: cómo leer y validar su entrada, qué pide al modelo y cómo
// comprobar —de forma estricta— lo que devuelve. El modelo nunca decide
// nada por sí mismo: solo rellena un formato que el código vuelve a validar.
export interface AiPurposeSpec<TInput, TOutput> {
  purpose: string
  // Opcionales: solo los propósitos que piden JSON estructurado los usan.
  responseSchema?: unknown
  maxOutputTokens?: number
  readInput(body: Record<string, unknown>): { ok: true; input: TInput } | { ok: false; error: string }
  buildParts(input: TInput): AiPart[]
  // Si la respuesta no es válida puede lanzar un error: la puerta lo traduce en
  // "no se ha podido preparar" (502) sin romper nada.
  parseOutput(rawText: string, input: TInput): TOutput
}
