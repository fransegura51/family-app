import { describe, expect, it } from 'vitest'

// Guardas de la Fase 1 de la ampliación de Eventos (migración 0176, motor de decisiones + modelo genérico
// de momentos). Lo que un test de dominio puro no puede comprobar (RLS, FK reales, backfill no destructivo)
// se verifica leyendo el SQL real de la migración — mismo patrón que
// forecastReconciliationDismissalsMigration.test.ts / forecastRecurrenceDismissalsMigration.test.ts.
const FILES = import.meta.glob('/supabase/migrations/0176_event_decisions_and_moments.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const MIGRATION = FILES['/supabase/migrations/0176_event_decisions_and_moments.sql']
const SQL = MIGRATION.replace(/--[^\n]*/g, '')
const APP = import.meta.glob(['/src/**/*.ts', '!/src/**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const DATA_EVENTS = APP['/src/data/events.ts']
const DOMAIN_EVENTS = APP['/src/domain/events.ts']
const DOMAIN_TYPES = APP['/src/domain/types.ts']
const ORIGINAL_SCHEMA = import.meta.glob('/supabase/migrations/0106_events_module_schema.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const SCHEMA_0106 = ORIGINAL_SCHEMA['/supabase/migrations/0106_events_module_schema.sql']

describe('event_decisions — tabla nueva, sin UI que la escriba todavía', () => {
  it('existe con las columnas mínimas del motor de decisiones', () => {
    expect(SQL).toContain('create table event_decisions')
    expect(SQL).toContain('event_id uuid not null references events(id) on delete cascade')
    expect(SQL).toContain('block_key text not null')
    expect(SQL).toContain('question_key text not null')
    expect(SQL).toContain("answer jsonb not null default '{}'::jsonb")
    expect(SQL).toContain('is_custom_option boolean not null default false')
  })

  it('RLS habilitada con una policy real family-scoped, mismo patrón que el resto de Eventos', () => {
    expect(SQL).toContain('alter table event_decisions enable row level security')
    expect(SQL).toContain('create policy "event_decisions: family crud" on event_decisions for all')
    const idx = SQL.indexOf('create policy "event_decisions: family crud"')
    const body = SQL.slice(idx, SQL.indexOf(';', idx))
    expect(body).toContain('family_id = private.current_family_id()')
    expect(body).toContain("private.has_section_access('eventos')")
  })

  it('nunca SECURITY DEFINER — solo tabla y políticas normales, igual que el resto del módulo', () => {
    expect(SQL).not.toMatch(/security definer/i)
  })
})

describe('decision_id — FK real (nunca target_table + target_id polimórfico)', () => {
  const expectedTables = ['event_tasks', 'event_budget_items', 'event_providers', 'event_decoration_items', 'event_day_plan_items']

  it.each(expectedTables)('%s recibe decision_id con ON DELETE SET NULL (borrar la decisión nunca borra el elemento)', (table) => {
    expect(SQL).toContain(`alter table ${table} add column decision_id uuid references event_decisions(id) on delete set null`)
  })

  it('menu_items y activities quedan fuera a propósito (ya los rellena generateEventPlan, mecanismo distinto)', () => {
    expect(SQL).not.toContain('alter table event_menu_items add column decision_id')
    expect(SQL).not.toContain('alter table event_activities add column decision_id')
  })

  it('favor_items y special_details quedan fuera a propósito (su paso por el motor es una fase futura, no esta)', () => {
    expect(SQL).not.toContain('alter table event_favor_items add column decision_id')
    expect(SQL).not.toContain('alter table event_special_details add column decision_id')
  })

  it('nunca una relación polimórfica por texto libre (target_table/target_id)', () => {
    expect(SQL).not.toMatch(/target_table/i)
    expect(SQL).not.toMatch(/target_id/i)
  })

  it.each(expectedTables)('%s endurece su policy para exigir que decision_id pertenezca al MISMO evento y familia', (table) => {
    const dropIdx = SQL.lastIndexOf(`drop policy "${table}: family crud" on ${table}`)
    expect(dropIdx).toBeGreaterThan(-1)
    const createIdx = SQL.indexOf(`create policy "${table}: family crud" on ${table} for all`, dropIdx)
    const body = SQL.slice(createIdx, SQL.indexOf(';', createIdx))
    expect(body).toContain('decision_id is null or exists')
    expect(body).toContain(`d.event_id = ${table}.event_id`)
  })

  it('las 5 políticas endurecidas solo tocan el "with check" — el "using" (lectura) queda igual que en 0106', () => {
    for (const table of expectedTables) {
      const idx = SQL.indexOf(`create policy "${table}: family crud" on ${table} for all`)
      const body = SQL.slice(idx, SQL.indexOf(';', idx))
      const usingText = body.slice(body.indexOf('using (') + 'using ('.length, body.indexOf('with check')).trim()
      expect(usingText.replace(/\)\s*$/, '').trim()).toBe("family_id = private.current_family_id() and private.has_section_access('eventos')")
    }
  })
})

describe('event_moments / event_guest_moments — modelo genérico, convive con los campos heredados', () => {
  it('event_moments tiene su propia fecha, independiente de events.event_date', () => {
    expect(SQL).toContain('create table event_moments')
    expect(SQL).toContain('moment_date date')
    expect(SQL).toContain('moment_time time')
    expect(SQL).toContain('location_label text')
  })

  it('event_guest_moments es muchos-a-muchos con unicidad por pareja, y cascada en ambos lados', () => {
    expect(SQL).toContain('create table event_guest_moments')
    expect(SQL).toContain('guest_id uuid not null references event_guests(id) on delete cascade')
    expect(SQL).toContain('moment_id uuid not null references event_moments(id) on delete cascade')
    expect(SQL).toContain('unique (guest_id, moment_id)')
  })

  it('la policy de event_guest_moments es "hardened" (guest_id y moment_id del MISMO evento/familia), igual que event_guest_members en 0164', () => {
    const idx = SQL.indexOf('create policy "event_guest_moments: family crud"')
    const body = SQL.slice(idx, SQL.indexOf(';', idx))
    expect(body).toContain('exists (select 1 from event_guests g where g.id = guest_id and g.family_id = private.current_family_id() and g.event_id = event_guest_moments.event_id)')
    expect(body).toContain('exists (select 1 from event_moments m where m.id = moment_id and m.family_id = private.current_family_id() and m.event_id = event_guest_moments.event_id)')
  })

  it('ninguna tabla nueva concede acceso a anon — ni políticas ni grants para ese rol', () => {
    const newTablesSql = SQL.slice(SQL.indexOf('create table event_decisions'))
    expect(newTablesSql).not.toMatch(/\banon\b/)
  })
})

describe('campos heredados — nunca tocados (compatibilidad con eventos existentes)', () => {
  it('ninguna columna de ceremonia/celebración/invite_scope se borra, renombra ni se vuelve not null', () => {
    expect(SQL).not.toMatch(/drop column/i)
    expect(SQL).not.toMatch(/rename column/i)
    expect(SQL).not.toMatch(/alter column.*set not null/i)
  })

  it('los campos heredados que el backfill lee siguen siendo exactamente los de la migración original 0106 (mismos nombres)', () => {
    expect(SCHEMA_0106).toContain('ceremony_location_label text')
    expect(SCHEMA_0106).toContain('celebration_location_label text')
    expect(SCHEMA_0106).toContain("invite_scope text check (invite_scope in ('ambas', 'solo_ceremonia', 'solo_celebracion'))")
  })
})

describe('backfill — no destructivo, idempotente, sin momentos vacíos', () => {
  it('solo crea un momento cuando el campo heredado correspondiente tiene datos reales (nunca un momento vacío)', () => {
    const ceremonyInsertIdx = SQL.indexOf("'Ceremonia'")
    const ceremonyBlock = SQL.slice(ceremonyInsertIdx, SQL.indexOf(';', ceremonyInsertIdx))
    expect(ceremonyBlock).toContain('where e.ceremony_location_label is not null')

    const celebrationInsertIdx = SQL.indexOf("'Celebración'")
    const celebrationBlock = SQL.slice(celebrationInsertIdx, SQL.indexOf(';', celebrationInsertIdx))
    expect(celebrationBlock).toContain('where e.celebration_location_label is not null')
  })

  it('cada insert del backfill está guardado con "not exists" — repetir la migración nunca duplica momentos ni enlaces', () => {
    const inserts = SQL.split(/insert into/i).slice(1)
    expect(inserts.length).toBeGreaterThanOrEqual(4) // 2 de event_moments + 2 de event_guest_moments
    for (const block of inserts) expect(block.toLowerCase()).toContain('not exists')
  })

  it('el backfill de invitados solo enlaza a un momento que exista de verdad (join, nunca un insert incondicional)', () => {
    const ambasCeremoniaIdx = SQL.indexOf("in ('ambas', 'solo_ceremonia')")
    expect(ambasCeremoniaIdx).toBeGreaterThan(-1)
    const block = SQL.slice(Math.max(0, ambasCeremoniaIdx - 300), ambasCeremoniaIdx)
    expect(block).toContain("join event_moments m on m.event_id = g.event_id and m.title = 'Ceremonia'")

    const ambasCelebracionIdx = SQL.indexOf("in ('ambas', 'solo_celebracion')")
    expect(ambasCelebracionIdx).toBeGreaterThan(-1)
    const block2 = SQL.slice(Math.max(0, ambasCelebracionIdx - 300), ambasCelebracionIdx)
    expect(block2).toContain("join event_moments m on m.event_id = g.event_id and m.title = 'Celebración'")
  })

  it('nunca borra ni actualiza una fila existente (DELETE/UPDATE no forman parte del backfill, solo INSERT)', () => {
    const backfillStart = SQL.indexOf('insert into event_moments')
    const backfillSql = SQL.slice(backfillStart)
    expect(backfillSql).not.toMatch(/\bdelete from\b/i)
    expect(backfillSql).not.toMatch(/\bupdate\s+event/i)
  })
})

describe('src/domain/events.ts — resolveEventMoments/resolveGuestInvitedMoments son la fuente de compatibilidad (no solo el backfill)', () => {
  it('resolveEventMoments sintetiza en caliente desde los campos heredados cuando no hay filas reales, nunca al revés', () => {
    expect(DOMAIN_EVENTS).toContain('export function resolveEventMoments')
    const idx = DOMAIN_EVENTS.indexOf('export function resolveEventMoments')
    const body = DOMAIN_EVENTS.slice(idx, DOMAIN_EVENTS.indexOf('\n}', idx))
    expect(body).toContain('if (storedMoments.length > 0) return storedMoments')
  })

  it('resolveGuestInvitedMoments usa el mismo default permisivo que eventLocationLines (null = ambas)', () => {
    expect(DOMAIN_EVENTS).toContain('export function resolveGuestInvitedMoments')
    const idx = DOMAIN_EVENTS.indexOf('export function resolveGuestInvitedMoments')
    const body = DOMAIN_EVENTS.slice(idx, DOMAIN_EVENTS.indexOf('\n}', idx))
    expect(body).toContain("guest.inviteScope ?? 'ambas'")
  })
})

describe('src/data/events.ts — infraestructura lista, sin generación automática todavía', () => {
  it('las 5 tablas generables exponen decisionId en su mapper, de solo lectura por ahora', () => {
    expect(DATA_EVENTS).toContain('decisionId: r.decision_id')
  })

  it('deleteEventMoment y deleteEventDecision documentan por qué son seguros (cascada / set null), sin limpieza manual añadida', () => {
    const momentIdx = DATA_EVENTS.indexOf('export async function deleteEventMoment')
    expect(DATA_EVENTS.slice(Math.max(0, momentIdx - 400), momentIdx)).toMatch(/cascade/i)

    const decisionIdx = DATA_EVENTS.indexOf('export async function deleteEventDecision')
    expect(DATA_EVENTS.slice(Math.max(0, decisionIdx - 400), decisionIdx)).toMatch(/on delete set null/i)
  })

  it('upsertEventDecision no genera tareas/presupuesto/proveedores por su cuenta — solo guarda la respuesta', () => {
    const idx = DATA_EVENTS.indexOf('export async function upsertEventDecision')
    const body = DATA_EVENTS.slice(idx, DATA_EVENTS.indexOf('\nexport async function deleteEventDecision', idx))
    expect(body).not.toMatch(/addEventTask|addEventBudgetItem|addEventProvider|addEventDecorationItem|addEventDayPlanItem/)
  })
})

describe('src/domain/types.ts — EventMoment marca las filas sintetizadas, nunca editables como si fueran reales', () => {
  it('EventMoment documenta isLegacy para que la futura UI no pueda editar/borrar un momento sintetizado', () => {
    const idx = DOMAIN_TYPES.indexOf('export interface EventMoment')
    const body = DOMAIN_TYPES.slice(idx, DOMAIN_TYPES.indexOf('}', idx))
    expect(body).toContain('isLegacy?: boolean')
  })
})

describe('ratchet de migraciones — Fase 1 de Eventos es la 0176; 0177 es el cierre de Fase 2 (Google Maps), nada más se coló en el camino', () => {
  const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  // 0178 (location_places_notify_arrivals, Ubicación: avisar al llegar/irse de un lugar, estilo
  // Google Maps) añade `location_places.notify_arrivals` — tabla de Ubicación, nada que ver con
  // Eventos. 0179 (event_decision_providers, Fase 3 "La pareja") sí es de Eventos — primer uso real de
  // event_decisions más la relación muchos-a-muchos decisión↔proveedor, ver eventPairDecisions.test.ts.
  // 0180 (alexa_account_linking, integración con Alexa) añade alexa_links/alexa_auth_codes — nada que
  // ver con Eventos. 0181 (alexa_account_linking_drop) la deshace por completo (petición real:
  // "Quita todo lo que has hecho de Alexa... Quítalo todo de la aplicación") — tampoco Eventos. 0182
  // (store_chains_logo_and_shopping_link, catálogo global de cadenas para Compras) añade
  // store_chains.logo_asset y shopping_stores.chain_key — tampoco toca Eventos.
  it('0182 (store_chains_logo_and_shopping_link) es la última migración del repositorio', () => {
    const numbers = Object.keys(MIGRATIONS)
      .map((f) => Number(f.match(/(\d{4})_/)?.[1]))
      .filter((n) => !Number.isNaN(n))
    expect(Math.max(...numbers)).toBe(182)
  })
})
