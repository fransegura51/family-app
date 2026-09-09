import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "npm:@simplewebauthn/server@10.0.1"
import { isoBase64URL } from "npm:@simplewebauthn/server@10.0.1/helpers"

// Huella/Face ID — capa opcional POR ENCIMA del PIN de bloqueo (ver
// 0083_profile_app_lock.sql), nunca lo sustituye. Todo pasa por aquí
// porque verificar una respuesta WebAuthn de verdad (firma criptográfica
// contra la clave pública guardada) no se puede hacer con una simple
// política RLS — hace falta código de servidor.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } })
}

// rpID/origin fijos a los dos sitios reales donde corre la app —
// WebAuthn exige que coincidan exactamente con el dominio que sirve la
// página, si no lo rechaza.
function resolveRp(req: Request): { rpID: string; origin: string } | null {
  const origin = req.headers.get("origin") ?? ""
  if (origin === "https://fransegura51.github.io") return { rpID: "fransegura51.github.io", origin }
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return { rpID: "localhost", origin }
  return null
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS })

  try {
    const rp = resolveRp(req)
    if (!rp) return json({ error: "origen no permitido" }, 400)

    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return json({ error: "unauthorized" }, 401)

    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) return json({ error: "unauthorized" }, 401)
    const user = userData.user

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { action, ...payload } = await req.json()

    if (action === "registerOptions") {
      const { data: existing } = await admin
        .from("profile_webauthn_credentials")
        .select("credential_id")
        .eq("profile_id", user.id)

      const options = await generateRegistrationOptions({
        rpName: "Family App",
        rpID: rp.rpID,
        userName: user.email ?? "usuario",
        attestationType: "none",
        excludeCredentials: (existing ?? []).map((c) => ({ id: c.credential_id, transports: ["internal"] })),
        authenticatorSelection: {
          residentKey: "discouraged",
          userVerification: "preferred",
          authenticatorAttachment: "platform",
        },
      })

      const { error } = await admin
        .from("profile_webauthn_challenges")
        .upsert({ profile_id: user.id, challenge: options.challenge, created_at: new Date().toISOString() })
      if (error) throw error
      return json(options)
    }

    if (action === "registerVerify") {
      const { data: challengeRow } = await admin
        .from("profile_webauthn_challenges")
        .select("challenge")
        .eq("profile_id", user.id)
        .maybeSingle()
      if (!challengeRow) return json({ error: "no hay un registro en curso" }, 400)

      const verification = await verifyRegistrationResponse({
        response: payload.response,
        expectedChallenge: challengeRow.challenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpID,
      })

      await admin.from("profile_webauthn_challenges").delete().eq("profile_id", user.id)

      if (!verification.verified || !verification.registrationInfo) return json({ verified: false })

      const { credential } = verification.registrationInfo
      const { error } = await admin.from("profile_webauthn_credentials").insert({
        profile_id: user.id,
        credential_id: credential.id,
        public_key: isoBase64URL.fromBuffer(credential.publicKey),
        counter: credential.counter,
        device_label: typeof payload.deviceLabel === "string" ? payload.deviceLabel : null,
      })
      if (error) throw error
      return json({ verified: true })
    }

    if (action === "authOptions") {
      const { data: creds } = await admin
        .from("profile_webauthn_credentials")
        .select("credential_id")
        .eq("profile_id", user.id)
      if (!creds || creds.length === 0) return json({ error: "no hay huella registrada" }, 400)

      const options = await generateAuthenticationOptions({
        rpID: rp.rpID,
        allowCredentials: creds.map((c) => ({ id: c.credential_id, transports: ["internal"] })),
        userVerification: "preferred",
      })

      const { error } = await admin
        .from("profile_webauthn_challenges")
        .upsert({ profile_id: user.id, challenge: options.challenge, created_at: new Date().toISOString() })
      if (error) throw error
      return json(options)
    }

    if (action === "authVerify") {
      const { data: challengeRow } = await admin
        .from("profile_webauthn_challenges")
        .select("challenge")
        .eq("profile_id", user.id)
        .maybeSingle()
      if (!challengeRow) return json({ error: "no hay una comprobación en curso" }, 400)

      const credentialId = payload.response?.id
      const { data: credRow } = await admin
        .from("profile_webauthn_credentials")
        .select("id, credential_id, public_key, counter")
        .eq("profile_id", user.id)
        .eq("credential_id", credentialId)
        .maybeSingle()
      if (!credRow) return json({ error: "huella no reconocida" }, 400)

      const verification = await verifyAuthenticationResponse({
        response: payload.response,
        expectedChallenge: challengeRow.challenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpID,
        credential: {
          id: credRow.credential_id,
          publicKey: isoBase64URL.toBuffer(credRow.public_key),
          counter: credRow.counter,
        },
      })

      await admin.from("profile_webauthn_challenges").delete().eq("profile_id", user.id)

      if (!verification.verified) return json({ verified: false })

      await admin
        .from("profile_webauthn_credentials")
        .update({ counter: verification.authenticationInfo.newCounter })
        .eq("id", credRow.id)
      return json({ verified: true })
    }

    return json({ error: "acción desconocida" }, 400)
  } catch (err) {
    console.error(err)
    return json({ error: err instanceof Error ? err.message : "internal error" }, 500)
  }
})
