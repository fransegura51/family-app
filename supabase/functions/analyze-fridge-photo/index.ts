import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

// Reconoce alimentos en una foto del frigorífico/despensa con Gemini
// (nivel gratuito de Google AI Studio) — la clave vive en Vault, nunca en
// el código ni en el cliente (la app es un sitio estático público, así
// que la clave no puede ir ahí sin quedar expuesta). El cliente solo
// manda la foto y recibe una lista de nombres; es él quien decide qué
// guardar en el inventario, con las políticas RLS normales del usuario.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS })

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      })
    }

    // Cliente "como el usuario que llama" — solo para confirmar que hay
    // una sesión válida. No hace falta más: el cliente ya filtra por su
    // propia familia al guardar, vía RLS normal.
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      })
    }

    const { imageBase64, mimeType } = await req.json()
    if (!imageBase64 || !mimeType) {
      return new Response(JSON.stringify({ error: "missing image" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      })
    }

    // Cliente admin SOLO para leer el secreto — get_app_secret está
    // restringido a service_role a propósito (ver 0004_push_notifications_schema.sql).
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: geminiKey, error: keyError } = await adminClient.rpc("get_app_secret", {
      p_name: "gemini_api_key",
    })
    if (keyError || !geminiKey) {
      return new Response(JSON.stringify({ error: "service not configured" }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      })
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text:
                    "Enumera los alimentos y productos visibles en esta foto de una nevera, congelador o despensa. " +
                    'Responde ÚNICAMENTE un array JSON de strings en español, cada uno un nombre corto de producto ' +
                    '(ejemplo: ["leche", "huevos", "tomates", "yogures"]). Sin texto adicional ni markdown, solo el array JSON.',
                },
                { inline_data: { mime_type: mimeType, data: imageBase64 } },
              ],
            },
          ],
        }),
      },
    )

    if (!geminiRes.ok) {
      const detail = await geminiRes.text()
      return new Response(JSON.stringify({ error: "gemini_error", detail }), {
        status: 502,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      })
    }

    const geminiJson = await geminiRes.json()
    const rawText: string = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]"

    let items: string[] = []
    try {
      const cleaned = rawText.replace(/```json|```/g, "").trim()
      const parsed = JSON.parse(cleaned)
      if (Array.isArray(parsed)) items = parsed.filter((x) => typeof x === "string")
    } catch {
      items = []
    }

    return new Response(JSON.stringify({ items }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    })
  }
})
