import { AiProviderError, type AiGenerateRequest, type AiGenerateResult, type AiProvider } from './types.ts'

// gemini-flash-lite-latest da 1500 peticiones/día gratis, pero solo 15 por
// MINUTO — compartidas entre todas las funciones que usan IA. Reintentar
// unos segundos después (el cupo de minuto se resetea solo) evita que un
// pico puntual de uso familiar se traduzca en un fallo silencioso. Mismos
// tiempos que tenían las funciones antes de la capa central.
const RETRY_DELAYS_MS = [4000, 8000]

export function createGeminiProvider(apiKey: string): AiProvider {
  return {
    name: 'gemini',
    async generate(req: AiGenerateRequest): Promise<AiGenerateResult> {
      const body = {
        contents: [
          {
            parts: req.parts.map((p) =>
              'text' in p ? { text: p.text } : { inline_data: { mime_type: p.inlineData.mimeType, data: p.inlineData.data } },
            ),
          },
        ],
      }

      let res: Response
      for (let attempt = 0; ; attempt++) {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${req.model}:generateContent`, {
          method: 'POST',
          // La clave va en cabecera, no en la URL, para que no acabe en
          // registros de acceso.
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify(body),
        })
        if (res.status !== 429 || attempt >= RETRY_DELAYS_MS.length) break
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]))
      }

      if (!res.ok) {
        // No se lee ni se devuelve el cuerpo del error: no hace falta y
        // podría arrastrar contenido de la petición.
        await res.body?.cancel()
        throw new AiProviderError(res.status, `gemini_http_${res.status}`)
      }

      const json = await res.json()
      return {
        text: json.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
        tokensIn: Number(json.usageMetadata?.promptTokenCount) || 0,
        tokensOut: Number(json.usageMetadata?.candidatesTokenCount) || 0,
      }
    },
  }
}
