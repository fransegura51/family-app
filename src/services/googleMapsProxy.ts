// Llama a la función de servidor "google-maps" (acciones autocomplete / details / geocode / nearby
// / route) — petición real, 30/09/2026: "Pepa no encuentra Madrid... en otro teléfono, en un
// iPhone, con otra cuenta, sigue igual". Antes estas llamadas salían directas desde el navegador
// con una clave restringida por sitio web, y esa restricción depende de que el navegador mande
// exactamente el Referer que Google espera — fiable en Chrome/Android, no fiable en Safari/iOS
// (confirmado con fallos reales en dos dispositivos distintos, dos cuentas distintas). Ahora las
// piden el servidor, con una clave de servidor aparte que no depende del navegador de nadie — mismo
// patrón que ya usan fatsecretRecipes.ts/food.ts con "fatsecret-food". La carga del mapa en sí
// (script de Google, googleMapsLoader.ts) sigue siendo del navegador — eso no se puede mover aquí.
import { supabase } from '@/data/supabaseClient'

export async function callGoogleMaps(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('No autenticado')
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const res = await fetch(`${supabaseUrl}/functions/v1/google-maps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('No se pudo conectar con Google Maps ahora mismo.')
  return res.json()
}
