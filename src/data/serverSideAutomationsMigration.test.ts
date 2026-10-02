import { describe, expect, it } from 'vitest'

// Guardas de la migración 0186 (avisos de llegada/salida y de hora diaria calculados en el servidor) y
// de las piezas que la acompañan. Lo que un test de dominio puro no puede comprobar (RLS, aislamiento
// entre familias, que un fallo nunca rompa el guardado de la ubicación) se verifica leyendo el SQL real,
// mismo patrón que forecastReconciliationDismissalsMigration.test.ts. La lógica en sí (primera lectura
// silenciosa, aviso único, rebote de GPS sin aviso, salida real) se ensayó contra los datos reales en
// una transacción revertida — ver el mensaje del commit.
const MIGRATION = (
  import.meta.glob('/supabase/migrations/0186_server_side_automations.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
)['/supabase/migrations/0186_server_side_automations.sql']
const SQL = MIGRATION.replace(/--[^\n]*/g, '')

const SOURCES = import.meta.glob(
  ['/supabase/functions/send-family-push/index.ts', '/supabase/functions/send-due-reminders/index.ts', '/src/App.tsx', '/src/services/notifications.ts'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>
const SEND_FAMILY_PUSH = SOURCES['/supabase/functions/send-family-push/index.ts']
const SEND_DUE_REMINDERS = SOURCES['/supabase/functions/send-due-reminders/index.ts']
const APP = SOURCES['/src/App.tsx']
const NOTIFICATIONS = SOURCES['/src/services/notifications.ts']

describe('0186 — estado compartido de las reglas, nunca accesible por la API normal', () => {
  it('las dos tablas de estado tienen RLS activo y NINGUNA política (solo las funciones SECURITY DEFINER las tocan)', () => {
    expect(SQL).toContain('alter table automation_rule_member_state enable row level security')
    expect(SQL).toContain('alter table automation_rule_daily_state enable row level security')
    expect(SQL).not.toMatch(/create policy[^;]*automation_rule_(member|daily)_state/)
  })

  it('el estado cuelga de la regla y del miembro con ON DELETE CASCADE (borrar uno no deja filas huérfanas)', () => {
    expect(SQL).toContain('rule_id uuid not null references automation_rules(id) on delete cascade')
    expect(SQL).toContain('member_id uuid not null references family_members(id) on delete cascade')
    expect(SQL).toContain('rule_id uuid primary key references automation_rules(id) on delete cascade')
  })
})

describe('0186 — evaluate_location_rules (el trigger de member_locations)', () => {
  const idx = SQL.indexOf('create or replace function private.evaluate_location_rules()')
  const body = SQL.slice(idx, SQL.indexOf('create trigger trg_evaluate_location_rules'))

  it('es SECURITY DEFINER con search_path vacío (todo va cualificado, nada se resuelve por casualidad)', () => {
    expect(body).toMatch(/security definer\s+set search_path = ''/)
  })

  it('AISLAMIENTO entre familias: sin RLS, el único filtro es la familia de la fila recién guardada', () => {
    expect(body).toContain('where ar.family_id = new.family_id')
    expect(body).toContain('lp.family_id = ar.family_id')
    expect(body).toContain('fm.family_id = new.family_id')
    expect(body).toMatch(/send_family_push\(\s*new\.family_id/)
  })

  it('un fallo dentro NUNCA impide guardar la ubicación: bloque EXCEPTION y siempre devuelve new', () => {
    expect(body).toContain('exception when others then')
    expect(body).toContain('raise warning')
    expect(body).toMatch(/end;\s+return new;/)
  })

  it('la primera observación solo anota el estado, no avisa (antes todo el que ya estuviera en casa disparaba un "ha llegado" falso)', () => {
    const firstObs = body.slice(body.indexOf('if v_prev is null then'), body.indexOf('if v_prev then'))
    expect(firstObs).toContain('insert into public.automation_rule_member_state')
    expect(firstObs).toContain('continue;')
    expect(firstObs).not.toContain('send_family_push')
  })

  it('histéresis: para "se ha ido" hay que alejarse más del radio que para "ha llegado" (el GPS de interior baila decenas de metros)', () => {
    expect(body).toContain('v_near := v_dist <= (r.radius_m * 1.25 + 20)')
    expect(body).toContain('v_near := v_dist <= r.radius_m')
  })

  it('avisa solo al CAMBIAR de estado y solo del tipo que toca (llegada al entrar, salida al salir)', () => {
    expect(body).toContain('if v_near = v_prev then')
    expect(body).toContain("(r.trigger_type = 'llegada' and v_near) or (r.trigger_type = 'salida' and not v_near)")
  })

  it('respeta reglas apagadas y silenciadas, y las que son de otra persona', () => {
    expect(body).toContain('and ar.active')
    expect(body).toContain('(ar.muted_until is null or ar.muted_until <= now())')
    expect(body).toContain('(ar.member_id is null or ar.member_id = new.member_id)')
  })

  it('se dispara al insertar/actualizar la posición, no en cada columna', () => {
    expect(SQL).toContain('after insert or update of latitude, longitude on member_locations')
  })
})

describe('0186 — funciones internas inaccesibles desde la API', () => {
  it('ninguna de las 4 funciones nuevas se puede ejecutar como anon/authenticated', () => {
    for (const fn of [
      'private.distance_m(double precision, double precision, double precision, double precision)',
      'private.send_family_push(uuid, uuid, text, text, text)',
      'private.evaluate_location_rules()',
      'private.fire_daily_automations()',
    ]) {
      expect(SQL).toContain(`revoke execute on function ${fn} from public, anon, authenticated`)
    }
  })

  it('el secreto compartido se lee de Vault en tiempo de ejecución, nunca en texto plano', () => {
    expect(SQL).toContain("public.get_app_secret('cron_shared_secret')")
  })
})

describe('0186 — hora diaria en el servidor', () => {
  it('se programa cada minuto con pg_cron y avisa dentro de los 30 minutos siguientes, una vez al día por regla', () => {
    expect(SQL).toContain("'fire-daily-automations'")
    expect(SQL).toContain("'* * * * *'")
    expect(SQL).toContain("interval '30 minutes'")
    expect(SQL).toContain('where public.automation_rule_daily_state.last_fired_on < excluded.last_fired_on')
  })

  it('usa la hora de Madrid, no la del servidor (UTC)', () => {
    expect(SQL).toContain("now() at time zone 'Europe/Madrid'")
  })
})

describe('send-family-push — la Edge Function que manda el aviso', () => {
  it('exige el secreto compartido antes de hacer nada', () => {
    expect(SEND_FAMILY_PUSH).toContain('x-cron-secret')
    expect(SEND_FAMILY_PUSH).toContain('return new Response("unauthorized", { status: 401 })')
  })

  it('AISLAMIENTO entre familias: solo avisa a perfiles de la familia indicada, y excluir a alguien exige que sea de esa familia', () => {
    expect(SEND_FAMILY_PUSH).toContain('.eq("family_id", familyId)')
    expect(SEND_FAMILY_PUSH).toMatch(/from\("profiles"\)\.select\("id"\)\.eq\("family_id", familyId\)/)
    expect(SEND_FAMILY_PUSH).toMatch(/\.eq\("id", excludeMemberId\)\s*\.eq\("family_id", familyId\)/)
  })

  it('valida la entrada (UUID de familia) y la longitud de lo que se muestra', () => {
    expect(SEND_FAMILY_PUSH).toContain('UUID_RE.test(input.family_id)')
    expect(SEND_FAMILY_PUSH).toContain('input.title.slice(0, 120)')
  })

  it('urgencia alta y caducidad corta: un "ha llegado" de hace una hora ya no sirve', () => {
    expect(SEND_FAMILY_PUSH).toContain('TTL: 3600')
    expect(SEND_FAMILY_PUSH).toContain('urgency: "high"')
  })

  it('borra las suscripciones caducadas (404/410) en vez de reintentarlas para siempre', () => {
    expect(SEND_FAMILY_PUSH).toContain('delete_push_subscription')
  })
})

describe('el resto de avisos del servidor también van con urgencia alta', () => {
  it('send-due-reminders (calendario y pagos) manda con urgencia alta y caducidad corta, no con la de 4 semanas por defecto', () => {
    expect(SEND_DUE_REMINDERS).toContain('const PUSH_OPTIONS_SOON = { TTL: 3600, urgency: "high" as const }')
    expect(SEND_DUE_REMINDERS).toContain('PUSH_OPTIONS_SOON,')
    expect(SEND_DUE_REMINDERS).toContain('PUSH_OPTIONS_DAY,')
  })
})

describe('cliente — nada evalúa ya llegada/salida en el móvil', () => {
  it('AutomationWatcher ya no se monta (avisaría dos veces: una el servidor y otra el navegador abierto)', () => {
    expect(APP).not.toContain('AutomationWatcher')
  })

  it('cada móvil con el permiso concedido se registra solo para recibir los avisos del servidor', () => {
    expect(APP).toContain('<PushSubscriptionKeeper />')
  })

  it('el aviso local usa el service worker (Android no permite `new Notification` desde la página)', () => {
    expect(NOTIFICATIONS).toContain('registration.showNotification(title, options)')
  })
})
