// `state` firmado de los retornos OAuth (Enable Banking y Google Calendar).
//
// Antes el `state` era solo base64 de un JSON: cualquiera podía fabricar uno con el familyId de OTRA familia y el callback (que no tiene sesión y escribe con
// service_role) lo creía. Ahora el `state` lleva una firma HMAC-SHA256 con un secreto del servidor (variable de entorno OAUTH_STATE_SECRET de las funciones),
// caducidad corta y el propósito (banco o Google), la familia y el usuario que lo inició. Sin dependencias de Deno: solo WebCrypto, para poder probarlo con Vitest.
//
// Formato: `v1.<payload en base64url>.<firma en base64url>`. El formato antiguo (base64 de JSON, sin puntos) NO se acepta nunca.

export const OAUTH_STATE_TTL_SECONDS = 600
const VERSION = 'v1'

export type OAuthPurpose = 'bank' | 'google'

export interface OAuthStatePayload {
  purpose: OAuthPurpose
  familyId: string
  profileId: string
  memberId?: string
  app?: boolean
}

export type VerifyResult =
  | { ok: true; payload: OAuthStatePayload }
  | { ok: false; reason: 'missing' | 'malformed' | 'bad_signature' | 'expired' | 'wrong_purpose' | 'not_configured' }

const enc = new TextEncoder()
const dec = new TextDecoder()

function toB64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64Url(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('bad base64url')
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)))
}

// Comparación en tiempo constante (no sale al primer byte distinto).
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}

function assertSecret(secret: string | undefined | null): string {
  if (!secret || secret.length < 32) throw new Error('OAUTH_STATE_SECRET no configurado o demasiado corto (mínimo 32 caracteres)')
  return secret
}

export async function signOAuthState(payload: OAuthStatePayload, secret: string | undefined | null, nowMs: number = Date.now()): Promise<string> {
  const s = assertSecret(secret)
  const body = {
    p: payload.purpose,
    f: payload.familyId,
    u: payload.profileId,
    ...(payload.memberId ? { m: payload.memberId } : {}),
    ...(payload.app ? { a: 1 } : {}),
    exp: Math.floor(nowMs / 1000) + OAUTH_STATE_TTL_SECONDS,
  }
  const encoded = toB64Url(enc.encode(JSON.stringify(body)))
  const sig = toB64Url(await hmac(s, `${VERSION}.${encoded}`))
  return `${VERSION}.${encoded}.${sig}`
}

export async function verifyOAuthState(
  token: string | null | undefined,
  expectedPurpose: OAuthPurpose,
  secret: string | undefined | null,
  nowMs: number = Date.now(),
): Promise<VerifyResult> {
  if (!token) return { ok: false, reason: 'missing' }
  if (!secret || secret.length < 32) return { ok: false, reason: 'not_configured' }
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== VERSION) return { ok: false, reason: 'malformed' }
  let given: Uint8Array
  try {
    given = fromB64Url(parts[2])
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  const expected = await hmac(secret, `${VERSION}.${parts[1]}`)
  if (!timingSafeEqual(given, expected)) return { ok: false, reason: 'bad_signature' }
  // La firma es válida: el contenido lo escribió el servidor.
  let body: { p?: unknown; f?: unknown; u?: unknown; m?: unknown; a?: unknown; exp?: unknown }
  try {
    body = JSON.parse(dec.decode(fromB64Url(parts[1])))
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (typeof body.exp !== 'number' || !Number.isFinite(body.exp)) return { ok: false, reason: 'malformed' }
  if (Math.floor(nowMs / 1000) > body.exp) return { ok: false, reason: 'expired' }
  if (body.p !== expectedPurpose) return { ok: false, reason: 'wrong_purpose' }
  if (typeof body.f !== 'string' || !body.f || typeof body.u !== 'string' || !body.u) return { ok: false, reason: 'malformed' }
  if (expectedPurpose === 'google' && (typeof body.m !== 'string' || !body.m)) return { ok: false, reason: 'malformed' }
  return {
    ok: true,
    payload: {
      purpose: expectedPurpose,
      familyId: body.f,
      profileId: body.u,
      ...(typeof body.m === 'string' ? { memberId: body.m } : {}),
      ...(body.a === 1 ? { app: true } : {}),
    },
  }
}

// Solo para decidir a dónde redirigir en un error: lee la marca `app` SIN confiar en ella para nada más (se comprueba la firma igualmente).
export async function readVerifiedAppFlag(token: string | null | undefined, purpose: OAuthPurpose, secret: string | undefined | null, nowMs: number = Date.now()): Promise<boolean> {
  const r = await verifyOAuthState(token, purpose, secret, nowMs)
  return r.ok && r.payload.app === true
}

// Lee la clave del state: primero de Vault (secreto `oauth_state_secret`, vía get_app_secret, solo service_role, como las demás claves) y, si no está, de la variable de entorno OAUTH_STATE_SECRET.
export async function loadStateSecret(admin: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown }> }): Promise<string | undefined> {
  try {
    const { data } = await admin.rpc('get_app_secret', { p_name: 'oauth_state_secret' })
    if (typeof data === 'string' && data.length >= 32) return data
  } catch {
    // cae a la variable de entorno
  }
  return (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get('OAUTH_STATE_SECRET')
}
