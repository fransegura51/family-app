import { describe, expect, it } from 'vitest'

// RSVP → necesidades alimentarias (migración 0205). El RSVP escribe SOLO declaraciones pendientes; nunca necesidades
// confirmadas. Estos tests leen el código real (fuente raw) y protegen esas reglas.
const src = (path: string) => (import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[`/${path}`]
const RSVP_FN = (import.meta.glob('/supabase/functions/event-rsvp/index.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/supabase/functions/event-rsvp/index.ts']
const MIG = (import.meta.glob('/supabase/migrations/0205_rsvp_declared_needs_and_rate_limit.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/supabase/migrations/0205_rsvp_declared_needs_and_rate_limit.sql']
const DATA = src('src/data/eventDeclaredNeeds.ts')
const UI = src('src/ui/EventMenuDeclaredNeeds.tsx')
const DINERS = src('src/ui/EventMenuDiners.tsx')

function fnBody(name: string): string {
  const start = RSVP_FN.indexOf(`async function ${name}(`)
  return RSVP_FN.slice(start, RSVP_FN.indexOf('\n}\n', start) + 3)
}

describe('guard: el RSVP NO escribe en necesidades confirmadas', () => {
  it('la función RSVP no referencia event_guest_dietary_needs ni documentos/presupuesto (guard original)', () => {
    expect(RSVP_FN).not.toMatch(/event_guest_dietary_needs|event_food_documents|event_budget_items/)
  })

  it('el único destino nuevo del RSVP es la capa de declaraciones, y siempre como pendiente', () => {
    const insertFn = fnBody('insertDeclaredNeeds')
    expect(insertFn).toContain('from("event_guest_declared_needs").insert(')
    expect(insertFn).toContain('status: "pendiente"')
    expect(RSVP_FN).not.toMatch(/status:\s*"aceptada"/)
    expect(RSVP_FN).not.toMatch(/event_guest_declared_needs[\s\S]{0,200}source:\s*"rsvp"/)
  })
})

describe('límite de peticiones (B-1) — antes de leer el cuerpo, falla cerrado', () => {
  it('el POST del enlace abierto y el del invitado llaman al límite antes de leer el cuerpo', () => {
    const openPost = RSVP_FN.slice(RSVP_FN.indexOf('if (req.method === "POST") {\n        if (!(await underRateLimit'), RSVP_FN.indexOf('const body', RSVP_FN.indexOf('underRateLimit(admin, req, "open:"')))
    expect(openPost).toContain('underRateLimit(admin, req, "open:" + openToken, 30)')
    const tokenPost = RSVP_FN.slice(RSVP_FN.indexOf('underRateLimit(admin, req, "tok:" + token'), RSVP_FN.indexOf('const body', RSVP_FN.indexOf('underRateLimit(admin, req, "tok:" + token')))
    expect(tokenPost).toContain('return json({ error: "rate_limited" }, 429)')
  })

  it('usa el contador atómico de base de datos y falla cerrado si no responde', () => {
    const body = fnBody('underRateLimit')
    expect(body).toContain('admin.rpc("rsvp_rate_limit_hit"')
    expect(body).toContain('if (byIp.error || byIp.data !== true) return false')
    expect(body).toContain('return !byScope.error && byScope.data === true')
  })

  it('el identificador de límite no guarda el token ni la IP en claro (hash SHA-256)', () => {
    expect(fnBody('sha256Hex')).toContain('crypto.subtle.digest("SHA-256"')
    expect(RSVP_FN).toContain('"ip:" + (await sha256Hex(ip))')
    expect(RSVP_FN).toContain('await sha256Hex(scopeKey)')
  })

  it('la migración 0205 deja el contador solo para service_role', () => {
    expect(MIG).toContain('revoke all on function rsvp_rate_limit_hit(text, integer, integer) from public, anon, authenticated;')
    expect(MIG).toContain('grant execute on function rsvp_rate_limit_hit(text, integer, integer) to service_role;')
    expect(MIG).toContain('revoke all on rsvp_rate_limits from anon, authenticated;')
  })
})

describe('validación en servidor — nunca se confía en IDs ni textos del cliente', () => {
  it('la validación de declaraciones ocurre ANTES de cualquier escritura del invitado', () => {
    const prepareCall = RSVP_FN.indexOf('await prepareDeclaredNeeds(admin, g.id, body.declaredNeeds)')
    const guestUpdate = RSVP_FN.indexOf('.from("event_guests")\n        .update({')
    expect(prepareCall).toBeGreaterThan(-1)
    expect(guestUpdate).toBeGreaterThan(prepareCall)
  })

  it('la persona debe pertenecer a ESTE invitado; la categoría y el tipo salen de listas cerradas', () => {
    const body = fnBody('prepareDeclaredNeeds')
    expect(body).toContain('.eq("guest_id", guestId)')
    expect(body).toContain('!ownMembers.has(e.memberId)')
    expect(body).toContain('DECLARED_CATEGORIES.includes(e.category)')
    expect(body).toContain('DECLARED_KINDS.includes(e.kind)')
  })

  it('el texto se acota a 300 caracteres y se rechaza (no se trunca en silencio) si es más largo', () => {
    expect(fnBody('prepareDeclaredNeeds')).toContain('if (text.length > 300) return { ok: false, error: "text_too_long" }')
  })

  it('límites: máximo 5 declaraciones por envío y 10 pendientes por invitado', () => {
    const body = fnBody('prepareDeclaredNeeds')
    expect(body).toContain('raw.length > MAX_DECLARED_PER_SUBMIT')
    expect(body).toContain('(count ?? 0) + rows.length > MAX_PENDING_PER_GUEST')
    expect(RSVP_FN).toContain('const MAX_DECLARED_PER_SUBMIT = 5')
    expect(RSVP_FN).toContain('const MAX_PENDING_PER_GUEST = 10')
  })

  it('el GET público no devuelve declaraciones ni necesidades de nadie', () => {
    const getPart = RSVP_FN.slice(RSVP_FN.indexOf('if (ev.status === "archivado") return json({ state: "archived", event: publicEvent(ev) })\n    const guestLines'))
    expect(getPart).not.toContain('event_guest_declared_needs')
    expect(getPart).not.toContain('event_guest_dietary_needs')
  })
})

describe('migración 0205 — aditiva, RLS familiar, duplicados y trazabilidad', () => {
  it('tabla nueva con estados explícitos, texto original y procedencia RSVP', () => {
    expect(MIG).toContain('create table event_guest_declared_needs')
    expect(MIG).toContain("check (status in ('pendiente', 'aceptada', 'rechazada'))")
    expect(MIG).toContain("origin text not null default 'rsvp' check (origin = 'rsvp')")
    expect(MIG).toContain('declared_text text not null check (char_length(declared_text) between 1 and 300)')
  })

  it('como mucho una declaración pendiente igual por invitado, persona y categoría', () => {
    expect(MIG).toContain('create unique index event_guest_declared_needs_pending_dedupe')
    expect(MIG).toContain("where status = 'pendiente'")
  })

  it('RLS familiar con comprobación de invitado y persona de la misma familia y evento; anon sin acceso', () => {
    expect(MIG).toContain("family_id = private.current_family_id() and private.has_section_access('eventos')")
    expect(MIG).toContain('m.guest_id = event_guest_declared_needs.guest_id')
    expect(MIG).toContain('revoke all on event_guest_declared_needs from anon;')
  })

  it('no destruye datos: sin borrados ni actualizaciones de tablas existentes', () => {
    const code = MIG.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
    expect(code).not.toMatch(/\bdelete\s+from\b|\bdrop\s+table\b|\bupdate\s+(event_guest_dietary_needs|event_guests|event_guest_members)\b/i)
  })
})

describe('familia — aceptar integra sin duplicar, corregir, rechazar conserva el registro', () => {
  it('aceptar busca primero una necesidad equivalente y solo crea una si no existe', () => {
    const accept = DATA.slice(DATA.indexOf('export async function acceptEventDeclaredNeed('))
    expect(accept.indexOf("from('event_guest_dietary_needs')")).toBeLessThan(accept.indexOf(".insert({"))
    expect(accept).toContain("source: 'rsvp'")
    expect(accept).toContain('original_text: declared.declaredText')
  })

  it('al aceptar la declaración queda como aceptada con su necesidad enlazada', () => {
    expect(DATA).toContain("status: 'aceptada'")
    expect(DATA).toContain('accepted_need_id: needId')
  })

  it('rechazar cambia el estado y NO borra la fila ni el texto original', () => {
    const reject = DATA.slice(DATA.indexOf('export async function rejectEventDeclaredNeed('))
    expect(reject).toContain("status: 'rechazada'")
    expect(reject).not.toMatch(/\.delete\(/)
  })

  it('la persona es obligatoria al aceptar (no se adivina) y la UI lo bloquea', () => {
    expect(UI).toContain('disabled={busy === d.id || !v.memberId}')
    expect(UI).toContain('<option value="">¿A quién corresponde?</option>')
  })

  it('las declaraciones pendientes se muestran como declaradas, nunca como confirmadas', () => {
    expect(UI).toContain('Declarado por un invitado (sin confirmar)')
    expect(UI).toContain('Texto del invitado:')
    expect(DINERS).toContain('<DeclaredNeedsReview')
  })
})
