// @vitest-environment jsdom
// Soporte técnico de «Pepa te acompaña»: guardas de seguridad y de alcance. La base de datos (migración 0310) está PENDIENTE de revisión, así que el interruptor de la web debe seguir
// apagado mientras la migración no esté en supabase/migrations; el contexto técnico es mínimo y coincide con la lista blanca del servidor; no hay ninguna IA activa ni ningún
// endpoint público de IA; y mientras esté apagado no se ve ningún botón, pestaña ni bloque de administración de Soporte.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ADMIN_TOOLS } from '@/admin/adminTools'
import { AGENT_LIMITS_REQUIRED, getSupportResponder } from '@/support/responder'
import { SUPPORT_ENABLED } from '@/support/flags'
import { collectSupportContext } from '@/support/context'
import { KIND_LABEL, STATUS_LABEL } from '@/support/labels'
import { attachmentPath, safeExtension, supportErrorText, validateAttachment, validateMessage, validateTicketDraft, KINDS, ATTACH_MIME } from '@/support/validate'
import { SupportArea } from '@/support/ui/SupportArea'
import migrationSql from '../../supabase/pending-migrations/0310_support_tickets.sql?raw'
import rollbackSql from '../../supabase/rollbacks/0310_support_tickets_down.sql?raw'

// El área de Soporte importa la capa de datos (Supabase), que necesita variables de entorno que los tests no tienen: aquí no se usa.
vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))

const APPLIED = import.meta.glob('/supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const FUNCTION_DIRS = import.meta.glob('/supabase/functions/*/index.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

describe('interruptor y migración pendiente', () => {
  it('SUPPORT_ENABLED solo puede estar encendido si 0310 ya está en supabase/migrations (aplicada en producción)', () => {
    const applied = Object.keys(APPLIED).some((f) => f.includes('_support_tickets'))
    if (SUPPORT_ENABLED) expect(applied, 'Soporte encendido sin su migración aplicada').toBe(true)
    else expect(applied, 'la migración ya está aplicada: enciende el interruptor y quita este candado').toBe(false)
  })

  it('la migración pendiente tiene su reversión y no toca tablas existentes de la familia', () => {
    expect(rollbackSql).toContain('drop table if exists public.support_tickets')
    expect(migrationSql).not.toMatch(/alter table public\.(profiles|families|family_members|user_notifications)/i)
    expect(migrationSql).not.toMatch(/drop (table|function|policy) (?!if exists)/i)
    expect(migrationSql).not.toMatch(/delete from|truncate/i)
  })

  it('todas las tablas tienen RLS y NADIE escribe directamente: solo lectura para «authenticated»', () => {
    for (const tbl of ['support_tickets', 'support_messages', 'support_attachments', 'support_ticket_events']) expect(migrationSql).toContain(`alter table public.${tbl} enable row level security`)
    expect(migrationSql).toContain('revoke all on public.support_tickets, public.support_messages, public.support_attachments, public.support_ticket_events from anon, authenticated')
    expect(migrationSql).toContain('grant select on public.support_tickets, public.support_messages, public.support_attachments, public.support_ticket_events to authenticated')
    expect(migrationSql).not.toMatch(/grant (insert|update|delete)[^;]*support_/i)
    expect(migrationSql).not.toMatch(/to anon/i)
  })

  it('el almacenamiento es privado, con límite de 5 MB, solo tipos permitidos y SIN políticas de borrado ni actualización', () => {
    expect(migrationSql).toMatch(/'support-attachments', 'support-attachments', false, 5242880/)
    expect(migrationSql).not.toMatch(/on storage\.objects\s+for\s+(delete|update|all)/i)
    expect(migrationSql).toMatch(/for insert to authenticated/)
    expect(migrationSql).toMatch(/for select to authenticated/)
  })

  it('las funciones privilegiadas fijan search_path vacío y las de administración exigen cuenta propietaria', () => {
    const fns = migrationSql.split(/create or replace function /).slice(1)
    expect(fns.length).toBeGreaterThanOrEqual(15)
    for (const f of fns) {
      const name = f.split('(')[0]
      if (/security definer/.test(f)) expect(f, name).toContain("set search_path = ''")
      if (name.startsWith('public.support_admin_')) expect(f, name).toContain('private.support_require_owner()')
    }
    expect(migrationSql).not.toMatch(/grant execute[^;]*to anon/i)
  })
})

describe('minimización del contexto técnico', () => {
  const whitelist = [...(migrationSql.match(/array\[('[a-z_]+'(?:,\s*'[a-z_]+')*)\]/)?.[1].matchAll(/'([a-z_]+)'/g) ?? [])].map((m) => m[1])

  it('la lista blanca del servidor existe y lo que recoge la web es siempre un subconjunto', () => {
    expect(whitelist.length).toBeGreaterThan(5)
    const ctx = collectSupportContext('compras', 'ERR-123')
    for (const k of Object.keys(ctx)) expect(whitelist, k).toContain(k)
    expect(ctx.section).toBe('compras')
    expect(ctx.error_id).toBe('ERR-123')
  })

  it('no incluye correo, nombres, identificadores de personas/familias ni direcciones con parámetros', () => {
    const ctx = JSON.stringify(collectSupportContext('economia'))
    expect(ctx).not.toMatch(/@|https?:|uuid|family|profile|token|password/i)
    for (const banned of ['email', 'name', 'user_id', 'family_id', 'url', 'location', 'token']) expect(whitelist).not.toContain(banned)
  })
})

describe('validación y textos', () => {
  it('título, mensaje y adjuntos respetan los límites del servidor', () => {
    expect(validateTicketDraft({ subject: 'ab', body: 'x' })).toBeTruthy()
    expect(validateTicketDraft({ subject: 'Un título', body: '' })).toBeTruthy()
    expect(validateTicketDraft({ subject: 'Un título', body: 'Algo pasa' })).toBeNull()
    expect(validateTicketDraft({ subject: 'x'.repeat(121), body: 'a' })).toBeTruthy()
    expect(validateMessage('  ')).toBeTruthy()
    expect(validateMessage('x'.repeat(4001))).toBeTruthy()
    expect(validateAttachment({ name: 'a.png', type: 'image/png', size: 1000 })).toBeNull()
    expect(validateAttachment({ name: 'a.exe', type: 'application/x-msdownload', size: 1000 })).toBeTruthy()
    expect(validateAttachment({ name: 'a.png', type: 'image/png', size: 6 * 1024 * 1024 })).toBeTruthy()
    expect([...ATTACH_MIME].sort()).toEqual(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain'])
  })

  it('las rutas de adjuntos encajan con la regla del servidor y la extensión la dicta el tipo, no el nombre', () => {
    expect(attachmentPath('fam', 'tic', 'abc', 'png')).toBe('fam/support/tic/abc.png')
    expect(safeExtension('../../x.php', 'image/png')).toBe('png')
    expect(safeExtension('doc', 'application/pdf')).toBe('pdf')
  })

  it('los errores del servidor se traducen a frases para la persona, nunca texto técnico', () => {
    for (const code of ['RATE_LIMIT', 'INVALID_SUBJECT', 'NOT_FOUND', 'NOT_ADMIN', 'INVALID_STATE', 'INVALID_FILE', 'otra cosa rara: pg_catalog']) {
      const text = supportErrorText(new Error(code))
      expect(text).not.toMatch(/INVALID|RATE_LIMIT|NOT_|pg_|SQL/)
      expect(text.length).toBeGreaterThan(20)
    }
  })

  it('hay un texto para cada estado y tipo del servidor', () => {
    for (const s of ['recibida', 'en_revision', 'esperando_usuario', 'resuelta', 'cerrada']) {
      expect(STATUS_LABEL[s as keyof typeof STATUS_LABEL], s).toBeTruthy()
      expect(migrationSql).toContain(`'${s}'`)
    }
    for (const k of KINDS) {
      expect(KIND_LABEL[k], k).toBeTruthy()
      expect(migrationSql).toContain(`'${k}'`)
    }
  })
})

describe('preparado para una IA futura, sin activar nada', () => {
  it('no hay ningún motor registrado y los autores incluyen «ai» solo como tipo posible', () => {
    expect(getSupportResponder()).toBeNull()
    expect(migrationSql).toMatch(/author_kind in \('user', 'admin', 'ai', 'system'\)/)
    expect(AGENT_LIMITS_REQUIRED.length).toBeGreaterThanOrEqual(5)
  })

  it('ninguna función del servidor crea mensajes «ai» (solo user/admin) y no hay función de Edge de soporte ni de IA para esto', () => {
    expect(migrationSql).not.toMatch(/values\s*\([^)]*'ai'/i)
    expect(Object.keys(FUNCTION_DIRS).filter((f) => /support|soporte/i.test(f))).toEqual([])
  })
})

describe('mientras esté apagado, no se ve nada', () => {
  it('Soporte no pinta nada y el buscador del Centro de Administración no ofrece herramientas de Soporte', () => {
    expect(SUPPORT_ENABLED).toBe(false)
    const { container } = render(<SupportArea />)
    expect(container.textContent).toBe('')
    expect(screen.queryByText(/Nueva incidencia/)).toBeNull()
    expect(ADMIN_TOOLS.some((t) => /soporte/.test(t.id))).toBe(false)
  })
})
