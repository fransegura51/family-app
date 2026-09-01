// Llama a la función de servidor "analyze-fridge-photo" (Gemini, nivel
// gratuito) para reconocer alimentos en una foto. La clave de Gemini
// nunca pasa por aquí: vive en Supabase Vault y solo la lee la función
// de servidor — este archivo solo manda la foto y lee la respuesta.
import { supabase } from '@/data/supabaseClient'

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1] ?? '')
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export async function analyzeFridgePhoto(file: File): Promise<string[]> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('No autenticado')

  const imageBase64 = await fileToBase64(file)
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string

  const res = await fetch(`${supabaseUrl}/functions/v1/analyze-fridge-photo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ imageBase64, mimeType: file.type || 'image/jpeg' }),
  })

  if (!res.ok) {
    throw new Error('No se pudo analizar la foto')
  }
  const json = await res.json()
  return Array.isArray(json.items) ? json.items : []
}
