// Envío de avisos por Firebase Cloud Messaging (FCM, API HTTP v1) a los móviles de la APP NATIVA de Android: su dirección en push_subscriptions es
// «fcm:<token>» (ver src/services/nativePush.ts). Los demás móviles siguen por Web Push, sin cambios.
//
// COPIA IDÉNTICA en supabase/functions/send-due-reminders/fcm.ts y supabase/functions/send-family-push/fcm.ts (las Edge Functions no comparten
// carpetas); un test compara las dos. Los errores llevan `statusCode` con la misma forma que los de web-push, para que el código que borra
// suscripciones caducadas (404/410) valga tal cual.

export const FCM_PREFIX = "fcm:"

export interface FcmServiceAccount {
  client_email: string
  private_key: string
  project_id: string
}

export interface FcmMessage {
  title: string
  body: string
  tag?: string
  url?: string
  ttlSeconds?: number
}

export interface FcmDeps {
  fetchFn?: typeof fetch
  nowMs?: () => number
}

function base64url(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input
  let binary = ""
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function pemToDer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s+/g, "")
  const raw = atob(body)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes.buffer
}

function fcmError(message: string, statusCode: number): Error {
  return Object.assign(new Error(message), { statusCode })
}

let cachedToken: { forEmail: string; token: string; expiresAtMs: number } | null = null

// Token de acceso de Google (OAuth2, 1 h) a partir de la cuenta de servicio de Firebase: se firma un JWT con su clave privada y se cambia por el token.
export async function getFcmAccessToken(sa: FcmServiceAccount, deps: FcmDeps = {}): Promise<string> {
  const fetchFn = deps.fetchFn ?? fetch
  const nowMs = (deps.nowMs ?? Date.now)()
  if (cachedToken && cachedToken.forEmail === sa.client_email && cachedToken.expiresAtMs - 60_000 > nowMs) return cachedToken.token

  const iat = Math.floor(nowMs / 1000)
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat,
    exp: iat + 3600,
  }
  const signingInput = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(JSON.stringify(claim))}`
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"])
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput)))
  const assertion = `${signingInput}.${base64url(signature)}`

  const res = await fetchFn("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
  })
  if (!res.ok) throw fcmError(`FCM auth failed (${res.status})`, res.status)
  const json = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!json.access_token) throw fcmError("FCM auth: sin access_token", 500)
  cachedToken = { forEmail: sa.client_email, token: json.access_token, expiresAtMs: nowMs + (json.expires_in ?? 3600) * 1000 }
  return json.access_token
}

export function buildFcmPayload(deviceToken: string, msg: FcmMessage) {
  const data: Record<string, string> = {}
  if (msg.url) data.url = msg.url
  if (msg.tag) data.tag = msg.tag
  return {
    message: {
      token: deviceToken,
      notification: { title: msg.title, body: msg.body },
      ...(Object.keys(data).length > 0 ? { data } : {}),
      android: {
        priority: "HIGH",
        ttl: `${msg.ttlSeconds ?? 3600}s`,
        // Con etiqueta, Android sustituye el aviso anterior de ese mismo recordatorio en vez de acumularlos.
        ...(msg.tag ? { notification: { tag: msg.tag } } : {}),
      },
    },
  }
}

// Manda un aviso a UN móvil. Si el token ya no vale (app desinstalada, token renovado) lanza un error con statusCode 404, que el llamador
// traduce en borrar esa suscripción.
export async function sendFcm(sa: FcmServiceAccount, deviceToken: string, msg: FcmMessage, deps: FcmDeps = {}): Promise<void> {
  const fetchFn = deps.fetchFn ?? fetch
  const accessToken = await getFcmAccessToken(sa, deps)
  const res = await fetchFn(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(buildFcmPayload(deviceToken, msg)),
  })
  if (res.ok) return

  let detail = ""
  try {
    detail = JSON.stringify(await res.json())
  } catch {
    // Sin cuerpo legible: se usa solo el código.
  }
  // 404 UNREGISTERED = el token ya no existe; 400 INVALID_ARGUMENT sobre el token = no es un token de FCM válido: en los dos casos se borra.
  if (res.status === 404 || /UNREGISTERED/.test(detail) || (res.status === 400 && /registration token/i.test(detail))) {
    throw fcmError("FCM: token ya no válido", 404)
  }
  throw fcmError(`FCM send failed (${res.status}) ${detail.slice(0, 200)}`, res.status)
}

// Pruebas: reinicia la caché del token de acceso.
export function resetFcmTokenCacheForTests(): void {
  cachedToken = null
}
