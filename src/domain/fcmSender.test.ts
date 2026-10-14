// Avisos nativos por Firebase (FCM): firma real del acceso de Google, forma del mensaje, borrado de móviles caducados y que las dos Edge
// Functions usan el mismo código. Se prueba con una llave RSA generada aquí, sin tocar Firebase.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { apnsCollapseId, buildFcmPayload, FCM_PREFIX, getFcmAccessToken, resetFcmTokenCacheForTests, sendFcm, type FcmServiceAccount } from '../../supabase/functions/send-due-reminders/fcm'
import dueReminderFcm from '../../supabase/functions/send-due-reminders/fcm.ts?raw'
import familyPushFcm from '../../supabase/functions/send-family-push/fcm.ts?raw'
import userPushFcm from '../../supabase/functions/send-user-push/fcm.ts?raw'
import userPushIndex from '../../supabase/functions/send-user-push/index.ts?raw'
import dueReminderIndex from '../../supabase/functions/send-due-reminders/index.ts?raw'
import familyPushIndex from '../../supabase/functions/send-family-push/index.ts?raw'

let sa: FcmServiceAccount
let publicKey: CryptoKey

function toPem(der: ArrayBuffer): string {
  const b64 = btoa(String.fromCharCode(...new Uint8Array(der)))
  return `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`
}
function fromB64Url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )
  publicKey = pair.publicKey
  sa = { client_email: 'fcm@pepa-test.iam.gserviceaccount.com', project_id: 'pepa-test', private_key: toPem(await crypto.subtle.exportKey('pkcs8', pair.privateKey)) }
})

beforeEach(() => resetFcmTokenCacheForTests())

function okJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('acceso a Firebase (OAuth con la cuenta de servicio)', () => {
  it('firma un JWT RS256 válido con la clave privada y lo cambia por un token de acceso', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(okJson({ access_token: 'ya29.token', expires_in: 3600 }))
    const token = await getFcmAccessToken(sa, { fetchFn: fetchFn as unknown as typeof fetch, nowMs: () => 1_800_000_000_000 })
    expect(token).toBe('ya29.token')

    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://oauth2.googleapis.com/token')
    const form = new URLSearchParams(init.body as string)
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer')

    const [h, c, s] = form.get('assertion')!.split('.')
    expect(JSON.parse(new TextDecoder().decode(fromB64Url(h)))).toEqual({ alg: 'RS256', typ: 'JWT' })
    const claim = JSON.parse(new TextDecoder().decode(fromB64Url(c)))
    expect(claim).toMatchObject({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: 1_800_000_000 })
    expect(claim.exp - claim.iat).toBe(3600)
    // La firma es de verdad: se verifica con la clave pública.
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, fromB64Url(s) as BufferSource, new TextEncoder().encode(`${h}.${c}`) as BufferSource)
    expect(valid).toBe(true)
  })
  it('reutiliza el token mientras no caduque y pide otro cuando caduca', async () => {
    let now = 1_800_000_000_000
    const fetchFn = vi.fn().mockImplementation(async () => okJson({ access_token: `t${fetchFn.mock.calls.length}`, expires_in: 3600 }))
    const deps = { fetchFn: fetchFn as unknown as typeof fetch, nowMs: () => now }
    expect(await getFcmAccessToken(sa, deps)).toBe('t1')
    now += 30 * 60_000
    expect(await getFcmAccessToken(sa, deps)).toBe('t1')
    expect(fetchFn).toHaveBeenCalledTimes(1)
    now += 31 * 60_000
    expect(await getFcmAccessToken(sa, deps)).toBe('t2')
  })
  it('si Google rechaza la firma, el error lleva el código HTTP', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(okJson({ error: 'invalid_grant' }, 400))
    await expect(getFcmAccessToken(sa, { fetchFn: fetchFn as unknown as typeof fetch })).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('mensaje de aviso', () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date('2026-10-05T10:00:00Z') }))
  afterEach(() => vi.useRealTimers())
  const NOW_S = Math.floor(new Date('2026-10-05T10:00:00Z').getTime() / 1000)

  it('lleva título, texto, prioridad alta, caducidad, y la etiqueta y la pantalla de destino cuando las hay', () => {
    const p = buildFcmPayload('TOKEN', { title: 'Reunión', body: 'Empieza a las 16:30', tag: 'reminder:e1:2026-10-05:start:60', url: '/calendario', ttlSeconds: 3600 })
    expect(p).toEqual({
      message: {
        token: 'TOKEN',
        notification: { title: 'Reunión', body: 'Empieza a las 16:30' },
        data: { url: '/calendario', tag: 'reminder:e1:2026-10-05:start:60' },
        android: { priority: 'HIGH', ttl: '3600s', notification: { channel_id: 'pepa-avisos', tag: 'reminder:e1:2026-10-05:start:60' } },
        apns: {
          headers: { 'apns-priority': '10', 'apns-expiration': String(NOW_S + 3600), 'apns-collapse-id': 'reminder:e1:2026-10-05:start:60' },
          payload: { aps: { sound: 'default' } },
        },
      },
    })
  })
  it('iPhone: el aviso se entrega al momento, con sonido, y sin etiqueta no sustituye a ninguno', () => {
    const p = buildFcmPayload('T', { title: 'a', body: 'b', ttlSeconds: 600 })
    expect(p.message.apns).toEqual({ headers: { 'apns-priority': '10', 'apns-expiration': String(NOW_S + 600) }, payload: { aps: { sound: 'default' } } })
  })
  it('iPhone: las etiquetas de más de 64 bytes (recordatorios con identificador largo) se resumen, y siempre igual', () => {
    const long = 'reminder:0b3f2a6e-1c1d-4e53-9a64-8f6c2d1a7b90:2026-10-05:start:60'
    expect(new TextEncoder().encode(long).length).toBeGreaterThan(64)
    const id = apnsCollapseId(long)
    expect(id).toMatch(/^h[0-9a-f]{16}$/)
    expect(apnsCollapseId(long)).toBe(id)
    expect(apnsCollapseId(long.replace(':60', ':30'))).not.toBe(id)
    expect(apnsCollapseId('corta')).toBe('corta')
  })
  it('sin etiqueta ni destino no lleva esos campos', () => {
    const p = buildFcmPayload('T', { title: 'a', body: 'b' })
    expect(p.message).not.toHaveProperty('data')
    expect(p.message.android).toEqual({ priority: 'HIGH', ttl: '3600s', notification: { channel_id: 'pepa-avisos' } })
  })
})

describe('envío y móviles caducados', () => {
  const msg = { title: 't', body: 'b' }
  const deps = (responses: Response[]) => {
    const fetchFn = vi.fn().mockResolvedValueOnce(okJson({ access_token: 'tok', expires_in: 3600 }))
    for (const r of responses) fetchFn.mockResolvedValueOnce(r)
    return { fetchFn: fetchFn as unknown as typeof fetch, mock: fetchFn }
  }
  it('manda a la API v1 del proyecto, con el token de acceso', async () => {
    const d = deps([okJson({ name: 'projects/pepa-test/messages/1' })])
    await sendFcm(sa, 'DEVICE', msg, d)
    const [url, init] = d.mock.mock.calls[1] as [string, RequestInit]
    expect(url).toBe('https://fcm.googleapis.com/v1/projects/pepa-test/messages:send')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect(JSON.parse(init.body as string).message.token).toBe('DEVICE')
  })
  it('un móvil que ya no existe (UNREGISTERED / token inválido) se traduce en 404, que borra la suscripción', async () => {
    for (const r of [okJson({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }, 404), okJson({ error: { status: 'INVALID_ARGUMENT', message: 'The registration token is not a valid FCM registration token' } }, 400)]) {
      resetFcmTokenCacheForTests()
      await expect(sendFcm(sa, 'DEAD', msg, deps([r]))).rejects.toMatchObject({ statusCode: 404 })
    }
  })
  it('otros fallos (servidor, cuota, permisos) NO borran la suscripción: conservan su código', async () => {
    for (const status of [500, 429, 403]) {
      resetFcmTokenCacheForTests()
      await expect(sendFcm(sa, 'OK', msg, deps([okJson({ error: { message: 'x' } }, status)]))).rejects.toMatchObject({ statusCode: status })
    }
  })
})

describe('las dos Edge Functions usan el mismo código', () => {
  it('fcm.ts es idéntico en send-due-reminders, send-family-push y send-user-push', () => {
    expect(dueReminderFcm).toBe(familyPushFcm)
    expect(userPushFcm).toBe(familyPushFcm)
  })
  it('la dirección «fcm:» decide el camino y el resto sigue por Web Push', () => {
    expect(FCM_PREFIX).toBe('fcm:')
    for (const src of [dueReminderIndex, familyPushIndex, userPushIndex]) {
      expect(src).toContain('sub.endpoint.startsWith(FCM_PREFIX)')
      expect(src).toContain('await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), options)')
      // Todo envío pasa por deliverPush: el único webpush.sendNotification directo es el de dentro del propio helper.
      expect((src.match(/webpush\.sendNotification\(/g) ?? []).length).toBe(1)
    }
  })
  it('la cuenta de servicio sale del Vault (secreto fcm_service_account) y, si falta, solo fallan los móviles nativos', () => {
    for (const src of [dueReminderIndex, familyPushIndex, userPushIndex]) {
      expect(src).toContain('"fcm_service_account"')
      expect(src).toContain('FCM sin configurar')
    }
  })
  it('el servidor sigue borrando suscripciones caducadas (404/410) para los dos caminos', () => {
    expect(dueReminderIndex).toContain('status === 404 || status === 410')
    expect(familyPushIndex).toContain('status === 404 || status === 410')
    expect(userPushIndex).toContain('status === 404 || status === 410')
  })
})

describe('send-user-push (aviso a UNA persona)', () => {
  it('solo lee las suscripciones de la persona indicada (nunca las de toda la familia)', () => {
    expect(userPushIndex).toContain('.eq("profile_id", input.profile_id)')
    expect(userPushIndex).not.toContain('family_id')
  })
  it('exige el secreto compartido y un id de persona válido', () => {
    expect(userPushIndex).toContain('x-cron-secret')
    expect(userPushIndex).toContain('return new Response("unauthorized", { status: 401 })')
    expect(userPushIndex).toContain('return new Response("bad profile_id", { status: 400 })')
  })
  it('responde 502 si había a quién avisar y falló todo, para que el buzón reintente', () => {
    expect(userPushIndex).toContain('if (failed > 0 && sent === 0)')
    expect(userPushIndex).toContain('{ status: 502 }')
  })
  it('solo acepta rutas internas como destino del aviso', () => {
    expect(userPushIndex).toContain('input.url.startsWith("/") && !input.url.startsWith("//")')
  })
})

describe('send-due-reminders anota los avisos en el historial', () => {
  it('una vez por persona y recordatorio, con la misma etiqueta anti-repeticiones, y sin bloquear el envío', () => {
    expect(dueReminderIndex).toContain('rpc("record_notifications"')
    expect(dueReminderIndex).toContain('dedupe_key: tag')
    expect(dueReminderIndex).toContain('if (historyError) console.error("record_notifications failed (calendar)", historyError)')
  })
})
