import { describe, expect, it } from 'vitest'
import { COMMUNITY_AI_PURPOSES } from '../../supabase/functions/_shared/communityAi.ts'

// Contrato de la migración 0335 (Centro de Control de IA). Pruebas de «forma»: lo que NO se puede romper sin que alguien lo note. El comportamiento real se prueba en la base
// con una transacción revertida antes de aplicarla (ver el registro de requisitos).
const FILES = import.meta.glob(['/supabase/migrations/0335_ai_control_center.sql', '/supabase/migrations/0335_ai_control_center.sql', '/supabase/rollbacks/0335_ai_control_center_down.sql'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
const UP = Object.entries(FILES).find(([k]) => k.endsWith('0335_ai_control_center.sql'))?.[1] as string
const DOWN = Object.entries(FILES).find(([k]) => k.endsWith('0335_ai_control_center_down.sql'))?.[1] as string
const code = UP.replace(/--.*$/gm, '')

const PURPOSE_FILES = import.meta.glob('/supabase/functions/_shared/ai/purposes/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

// Funciones registradas después de la 0335 (migraciones que solo añaden filas a ai_function): 0353 = Importar participantes (Gestión de grupos).
const LATER = import.meta.glob('/supabase/migrations/0353_ai_participants_document.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

function registered(): string[] {
  const block = code.slice(code.indexOf('insert into public.ai_function'), code.indexOf('on conflict (purpose) do nothing'))
  const later = Object.values(LATER).flatMap((sql) => [...sql.replace(/--.*$/gm, '').matchAll(/^\s*\('([a-z0-9_-]+)',/gm)].map((m) => m[1]))
  return [...[...block.matchAll(/^\s*\('([a-z0-9_-]+)',/gm)].map((m) => m[1]), ...later]
}

describe('0335 · registro central de funciones con IA', () => {
  it('toda función con IA del código está en el registro (y ninguna sobra)', () => {
    const inCode = new Set<string>(['mercadona-ticket-webhook', ...COMMUNITY_AI_PURPOSES])
    for (const src of Object.values(PURPOSE_FILES)) for (const m of src.matchAll(/^\s*purpose: '([a-z0-9-]+)'/gm)) inCode.add(m[1])
    expect(inCode.size).toBeGreaterThanOrEqual(25)
    const reg = registered()
    expect(new Set(reg).size).toBe(reg.length)
    expect([...inCode].filter((p) => !reg.includes(p))).toEqual([])
    expect(reg.filter((p) => !inCode.has(p))).toEqual([])
  })
  it('cada función tiene nombre en español y un módulo de los siete pedidos', () => {
    const block = code.slice(code.indexOf('insert into public.ai_function'), code.indexOf('on conflict (purpose) do nothing'))
    const rows = [...block.matchAll(/^\s*\('([a-z0-9_-]+)', '([^']+)', '([a-z_]+)', '/gm)]
    expect(rows.map((r) => r[1])).toEqual(registered().slice(0, rows.length)) // las de la 0335 se leen todas (las posteriores van detrás)
    for (const [, purpose, label, module] of rows) {
      expect(['compras_economia', 'comunidad', 'ayuda', 'cocina', 'mis_listas', 'eventos', 'otros'], purpose).toContain(module)
      expect(label, purpose).not.toMatch(/[_]|enabled|^ai /)
    }
  })
})

describe('0335 · seguridad', () => {
  it('las tablas nuevas tienen RLS y nadie las toca directamente', () => {
    for (const t of ['ai_function', 'ai_price', 'ai_call_log', 'ai_limit', 'ai_limit_exception', 'ai_admin_log', 'ai_alert', 'ai_plan', 'ai_plan_quota', 'ai_family_plan']) {
      expect(code, t).toMatch(new RegExp(`alter table public\\.${t} enable row level security`))
      expect(code, t).toMatch(new RegExp(`revoke all on [^;]*public\\.${t}\\b[^;]* from anon, authenticated`))
    }
  })
  it('solo ai_config y ai_alert se pueden leer, y solo por administradores', () => {
    const policies = [...code.matchAll(/create policy (\w+) on public\.(\w+) for select to authenticated using \(([^)]*\))\)/g)]
    expect(policies.map((p) => p[2]).sort()).toEqual(['ai_alert', 'ai_config'])
    for (const p of policies) expect(p[3]).toContain('private.ai_is_owner()')
  })
  it('toda función ai_admin_* exige ser administrador de PEPA y está concedida solo a usuarios con sesión', () => {
    const names = [...code.matchAll(/create or replace function public\.(ai_admin_[a-z_]+)\(/g)].map((m) => m[1])
    expect(names.length).toBeGreaterThanOrEqual(20)
    for (const n of names) {
      const start = code.indexOf(`function public.${n}(`)
      const body = code.slice(start, code.indexOf('$$;', code.indexOf('as $$', start) + 5))
      expect(body, n).toContain('private.ai_require_owner()')
    }
    expect(code).toMatch(/like 'ai\\_admin\\_%'/)
    expect(code).toMatch(/revoke all on function %s from public, anon/)
    expect(code).toMatch(/grant execute on function %s to authenticated/)
  })
  it('las funciones de medición y de puerta solo las ejecuta el servidor', () => {
    for (const f of ['ai_record_call(uuid, uuid, uuid, uuid, text, text, text, text, text, bigint, bigint, bigint, text, integer, integer)', 'ai_record_usage(uuid, text, integer, integer, boolean)', 'ai_gate(uuid, text)', 'ai_gate_family(uuid, text)', 'community_service_ai_allowed(text)']) {
      expect(code, f).toContain(`revoke all on function public.${f} from public, anon, authenticated`)
      expect(code, f).toContain(`grant execute on function public.${f} to service_role`)
    }
  })
  it('el registro de llamadas no guarda ningún texto: solo números, estado e identificadores', () => {
    const table = code.slice(code.indexOf('create table public.ai_call_log'), code.indexOf(');', code.indexOf('create table public.ai_call_log')))
    expect(table).not.toMatch(/\b(prompt|response|answer|text|content|image|body|message)\b\s+(text|jsonb|bytea)/i)
    expect(table).toMatch(/tokens_in bigint/)
    expect(table).toMatch(/cost numeric/)
    expect(table).toMatch(/cost_kind text not null default 'none' check \(cost_kind in \('confirmed', 'estimated', 'none'\)\)/)
  })
})

describe('0335 · no cambia lo que ya funciona', () => {
  it('todos los límites nacen en observación y la migración no crea ninguno', () => {
    expect(code).toMatch(/mode text not null default 'observe' check \(mode in \('observe', 'warn', 'block'\)\)/)
    // La única inserción está dentro de la función que usa un administrador: no hay ningún límite sembrado.
    const setLimit = code.slice(code.indexOf('function public.ai_admin_set_limit'), code.indexOf('function public.ai_admin_delete_limit'))
    expect(code.replace(setLimit, '')).not.toMatch(/insert into public\.ai_limit\b/)
  })
  it('los planes están preparados SIN efecto: no se leen en ninguna puerta', () => {
    expect(code).toMatch(/\('plans_enforced', 'false'::jsonb\)/)
    const gate = code.slice(code.indexOf('create or replace function private.ai_gate_core'), code.indexOf('create or replace function public.ai_gate('))
    expect(gate).not.toMatch(/ai_plan|ai_family_plan|plans_enforced/)
  })
  it('conserva el interruptor global y la selección por función que ya existían (no crea otros)', () => {
    const gate = code.slice(code.indexOf('create or replace function private.ai_gate_core'), code.indexOf('create or replace function public.ai_gate('))
    expect(gate).toContain("key = 'enabled'")
    expect(gate).toContain("key = 'purposes_disabled'")
    expect(gate).toContain('ai_family_settings')
    expect(gate).toContain("'daily_cap'")
    // Apagar la general NO toca la selección individual.
    const setGlobal = code.slice(code.indexOf('function public.ai_admin_set_global'), code.indexOf('function public.ai_admin_set_function'))
    expect(setGlobal).not.toContain('purposes_disabled')
  })
  it('las reglas de edad siguen donde estaban: ai_gate exige adulto y el resto no se toca', () => {
    const gate = code.slice(code.indexOf('create or replace function public.ai_gate('), code.indexOf('create or replace function public.ai_gate_family'))
    expect(gate).toContain("v_role not in ('admin', 'adult')")
    expect(code).not.toMatch(/alter table public\.profiles|create policy [^;]* on public\.profiles/)
  })
  it('un límite en bloqueo nunca rompe la función si su comprobación falla', () => {
    const block = code.slice(code.indexOf('create or replace function private.ai_limits_block'), code.indexOf('create or replace function private.ai_gate_core'))
    expect(block).toMatch(/exception when others then\s+return null/)
    expect(block).toContain("x.mode = 'block'")
  })
  it('la IA editorial deja de depender de ai_enabled de Comunidad y respeta global y función', () => {
    const allowed = code.slice(code.indexOf('create or replace function public.community_service_ai_allowed(p_purpose'), code.indexOf('revoke all on function public.community_service_ai_allowed(text)'))
    expect(allowed).toContain('private.ai_global_enabled()')
    expect(allowed).toContain('private.ai_purpose_disabled(p_purpose)')
    expect(allowed).toContain("left(p_purpose, 10) = 'editorial_'")
    expect(allowed).toContain('ai_daily_cap')
  })
  it('una ejecución editorial PROGRAMADA no se abre si la IA o la función están apagadas', () => {
    const begin = code.slice(code.indexOf('function public.community_service_editorial_begin_run'), code.indexOf('revoke all on function public.community_service_editorial_begin_run'))
    expect(begin).toContain('private.ai_global_enabled()')
    expect(begin).toContain('private.ai_purpose_disabled(')
    expect(begin.indexOf('ai_global_enabled')).toBeGreaterThan(begin.indexOf("if p_trigger = 'manual'"))
  })
  it('la medición es idempotente por id de llamada y la antigua firma sigue funcionando', () => {
    expect(code).toContain('on conflict (id) do nothing')
    expect(code).toMatch(/create or replace function public\.ai_record_usage\(p_family uuid, p_purpose text, p_tokens_in integer, p_tokens_out integer, p_error boolean\)/)
    expect(code).toMatch(/community_service_record_ai\(\s*p_purpose text, p_error boolean default false,/)
  })
  it('la revisión de anomalías no llama a ningún proveedor y se programa cada hora', () => {
    expect(code).toContain("'17 * * * *'")
    const detect = code.slice(code.indexOf('create or replace function private.ai_detect'), code.indexOf('create table public.ai_plan'))
    expect(detect).not.toMatch(/net\.http|get_app_secret/)
  })
})

describe('0335 · deshacer', () => {
  it('el rollback restaura la puerta y quita lo nuevo', () => {
    expect(DOWN).toContain('create or replace function private.ai_gate_core(p_family uuid, p_purpose text)')
    expect(DOWN).toContain('drop table if exists public.ai_family_plan')
    expect(DOWN).toContain("cron.unschedule('ai-detect')")
    expect(DOWN).toContain('drop function if exists public.community_service_ai_allowed(text)')
  })
})
