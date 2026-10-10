// Lista de deseos, Parte C del prompt — llama a la función de servidor "extract-wishlist-item-image" al
// pegar un enlace de producto. Mismo patrón que services/providerContactDocument.ts: la clave/credenciales
// nunca pasan por aquí, el servidor hace la descarga real (evita CORS y protege contra SSRF).
import { supabase } from '@/data/supabaseClient'

export interface WishlistItemImageDetection {
  // Ruta ya subida al bucket privado "wishlist_items" (familyId/uuid.ext) — null si no se encontró ninguna
  // imagen, o si falló la descarga; el formulario sigue funcionando igual en ambos casos.
  imagePath: string | null
  mimeType: string | null
}

export async function detectWishlistItemImage(productUrl: string): Promise<WishlistItemImageDetection> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return { imagePath: null, mimeType: null }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/extract-wishlist-item-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ productUrl }),
    })
    if (!res.ok) return { imagePath: null, mimeType: null }
    const json = await res.json()
    return {
      imagePath: typeof json.imagePath === 'string' ? json.imagePath : null,
      mimeType: typeof json.mimeType === 'string' ? json.mimeType : null,
    }
  } catch {
    // Nunca rompe el formulario — sin foto automática, se sigue pudiendo subir una a mano o guardar sin ella.
    return { imagePath: null, mimeType: null }
  }
}
