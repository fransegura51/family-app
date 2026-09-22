-- Previsión de pagos (Economía) — Fase 1B: infraestructura técnica. Diseño aprobado y cerrado en las
-- Fases 1A/1A.1/1A.2 (auditoría-only, sin cambios de código). Aditiva: no se altera ninguna fila de
-- ninguna tabla existente (calendar_events solo gana una columna nueva con DEFAULT, ver más abajo).
--
-- forecast_payments es la ÚNICA fuente de verdad financiera de un pago previsto — nunca expenses (que
-- sigue siendo, exclusivamente, dinero que ya ocurrió) ni calendar_events (que aquí es solo una
-- proyección visual derivada, nunca al revés).
--
-- Modelo híbrido de ocurrencias: la regla vive una vez en forecast_payments; forecast_occurrences solo
-- guarda una fila cuando hace falta apartarse de la regla pura (override puntual, "esta vez no",
-- conciliación futura) — nunca se materializan ocurrencias futuras por adelantado.

create table forecast_payments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,

  title text not null check (btrim(title) <> ''),
  category_id uuid null references budget_categories(id) on delete set null,
  provider text null,
  notes text null,

  amount_status text not null default 'known' check (amount_status in ('known', 'estimated', 'unknown')),
  amount numeric(12,2) null check (amount is null or amount >= 0),
  amount_estimated_basis text null,
  currency text not null default 'EUR',

  -- Vencimiento/renovación: obligatorio. Ancla de recurrencia para el vencimiento Y de los recordatorios.
  due_date date not null,
  -- Cargo/pago esperado: opcional, ancla INDEPENDIENTE (misma recurrence_rule que due_date), puede ser
  -- anterior, igual o posterior a due_date. null = se asume igual a due_date (aproximación de
  -- proyección, nunca un dato confirmado).
  expected_payment_date date null,

  -- Mismo formato de texto que calendar_events.recurrence_rule (FREQ=.../INTERVAL=.../UNTIL=...).
  -- null = pago puntual. FREQ=MONTHLY;INTERVAL=3/6 cubre trimestral/semestral sin frecuencias nuevas.
  -- La expansión de esta regla vive en domain/forecast.ts, con motor PROPIO para MONTHLY/YEARLY (no
  -- reutiliza expandOccurrences de domain/calendar.ts — ver la cabecera de ese archivo para el porqué).
  recurrence_rule text null,

  bank_account_id uuid null references bank_accounts(id) on delete set null,
  owner_member_id uuid null references family_members(id) on delete set null, -- contexto, NUNCA privacidad

  show_in_calendar boolean not null default true,
  -- Puntero al evento sintético PURAMENTE VISUAL (nunca lleva calendar_event_reminders — los avisos
  -- financieros van por el pipeline independiente de forecast_reminders/forecast_reminder_deliveries).
  -- ON DELETE SET NULL: si alguien borra el evento a mano desde Calendario, este forecast_payment
  -- sobrevive con calendar_event_id=null en vez de romperse.
  calendar_event_id uuid null references calendar_events(id) on delete set null,

  active boolean not null default true,
  deactivated_at timestamptz null,
  check (active = (deactivated_at is null)),

  created_by uuid null references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint forecast_payments_amount_matches_status check (
    (amount_status = 'unknown' and amount is null)
    or (amount_status in ('known', 'estimated') and amount is not null)
  ),
  constraint forecast_payments_estimated_needs_basis check (
    amount_status <> 'estimated' or amount_estimated_basis is not null
  )
);

create index forecast_payments_family_idx on forecast_payments(family_id);
create index forecast_payments_family_active_due_idx on forecast_payments(family_id, active, due_date);
create index forecast_payments_category_idx on forecast_payments(category_id);
create index forecast_payments_bank_account_idx on forecast_payments(bank_account_id);
create index forecast_payments_calendar_event_idx on forecast_payments(calendar_event_id);

alter table forecast_payments enable row level security;
create policy "forecast_payments: family crud" on forecast_payments for all
  using (family_id = private.current_family_id() and private.has_section_access('dinero'))
  with check (family_id = private.current_family_id() and private.has_section_access('dinero'));

-- ============================================================
-- forecast_reminders — fuente SEMÁNTICA de los avisos (value + unit, nunca minutos pre-convertidos:
-- "1 month" nunca se transforma permanentemente en "43200 minutes" — se conserva la intención original
-- para poder calcular la fecha efectiva con semántica de mes natural en cada ocurrencia).
-- ============================================================
create table forecast_reminders (
  id uuid primary key default gen_random_uuid(),
  forecast_payment_id uuid not null references forecast_payments(id) on delete cascade,
  value integer not null check (value > 0),
  unit text not null check (unit in ('minutes', 'hours', 'days', 'weeks', 'months')),
  created_at timestamptz not null default now(),
  unique (forecast_payment_id, value, unit)
);

create index forecast_reminders_payment_idx on forecast_reminders(forecast_payment_id);

alter table forecast_reminders enable row level security;
create policy "forecast_reminders: family crud" on forecast_reminders for all
  using (exists (
    select 1 from forecast_payments fp
    where fp.id = forecast_reminders.forecast_payment_id
      and fp.family_id = private.current_family_id() and private.has_section_access('dinero')
  ))
  with check (exists (
    select 1 from forecast_payments fp
    where fp.id = forecast_reminders.forecast_payment_id
      and fp.family_id = private.current_family_id() and private.has_section_access('dinero')
  ));

-- ============================================================
-- forecast_occurrences — excepciones/overrides puntuales (casi siempre vacía; modelo híbrido, nunca se
-- materializan ocurrencias futuras por adelantado). occurrence_date es la clave ESTABLE (el vencimiento
-- que produce la regla PURA, nunca se sobrescribe a sí misma); due_date_override/
-- expected_payment_date_override son los valores efectivos SOLO si divergen de la regla.
-- ============================================================
create table forecast_occurrences (
  id uuid primary key default gen_random_uuid(),
  forecast_payment_id uuid not null references forecast_payments(id) on delete cascade,

  occurrence_date date not null,

  due_date_override date null,
  expected_payment_date_override date null,

  amount_status text null check (amount_status is null or amount_status in ('known', 'estimated', 'unknown')),
  amount numeric(12,2) null check (amount is null or amount >= 0),
  amount_estimated_basis text null,

  skipped boolean not null default false,
  -- Preparado para conciliación futura (columna presente, sin lógica que la use todavía en esta fase).
  matched_expense_id uuid null references expenses(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (forecast_payment_id, occurrence_date),
  constraint forecast_occurrences_amount_matches_status check (
    amount_status is null
    or (amount_status = 'unknown' and amount is null)
    or (amount_status in ('known', 'estimated') and amount is not null)
  ),
  -- Una ocurrencia conciliada SIEMPRE debe llevar su propio importe congelado (snapshot tomado en el
  -- momento de conciliar) — nunca puede depender de heredar del padre una vez que representa un hecho
  -- real. Así una edición futura de forecast_payments.amount nunca reescribe el histórico ya conciliado.
  constraint forecast_occurrences_matched_needs_snapshot check (
    matched_expense_id is null or amount_status is not null
  )
);

create index forecast_occurrences_payment_idx on forecast_occurrences(forecast_payment_id);
create index forecast_occurrences_matched_expense_idx on forecast_occurrences(matched_expense_id);

alter table forecast_occurrences enable row level security;
create policy "forecast_occurrences: family crud" on forecast_occurrences for all
  using (exists (
    select 1 from forecast_payments fp
    where fp.id = forecast_occurrences.forecast_payment_id
      and fp.family_id = private.current_family_id() and private.has_section_access('dinero')
  ))
  with check (exists (
    select 1 from forecast_payments fp
    where fp.id = forecast_occurrences.forecast_payment_id
      and fp.family_id = private.current_family_id() and private.has_section_access('dinero')
  ));

-- ============================================================
-- forecast_reminder_deliveries — deduplicación de avisos ya enviados (mismo patrón exacto que
-- overdue_nag_deliveries: identidad por reminder+ocurrencia+suscripción). Solo la escribe/lee la
-- función SECURITY DEFINER del cron — ninguna pantalla la necesita directamente, así que RLS activada
-- sin ninguna policy (mismo criterio que bank_connection_reminders).
-- ============================================================
create table forecast_reminder_deliveries (
  forecast_reminder_id uuid not null references forecast_reminders(id) on delete cascade,
  occurrence_date date not null, -- el vencimiento (due_date) de la ocurrencia concreta avisada
  subscription_id uuid not null references push_subscriptions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (forecast_reminder_id, occurrence_date, subscription_id)
);

alter table forecast_reminder_deliveries enable row level security;

-- ============================================================
-- claim_due_forecast_reminders — dedup + resolución de destinatarios para el pipeline de avisos
-- financieros. Recibe la lista de (forecast_reminder_id, occurrence_date) que YA se han calculado como
-- vencidos hoy (el cálculo de fecha efectiva, con semántica de mes natural, vive en domain/forecast.ts
-- y se duplica en la Edge Function — mismo criterio ya establecido para occursOnDate/send-due-reminders,
-- las Edge Functions no comparten código con el cliente en este proyecto). Destinatarios: todos los
-- adultos/admins de la familia con acceso a Economía y suscripción push activa — Previsión es
-- información familiar, no hay asignación a un miembro concreto que restrinja quién se entera.
-- ============================================================
create or replace function public.claim_due_forecast_reminders(p_due jsonb)
returns table(out_subscription_id uuid, out_endpoint text, out_p256dh text, out_auth text, out_title text, out_occurrence_date date)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query
  with due as (
    select (elem->>'reminder_id')::uuid as reminder_id, (elem->>'occurrence_date')::date as occurrence_date
    from jsonb_array_elements(p_due) as elem
  ),
  due_info as (
    select d.reminder_id, d.occurrence_date, fp.family_id, fp.title
    from due d
    join forecast_reminders fr on fr.id = d.reminder_id
    join forecast_payments fp on fp.id = fr.forecast_payment_id
    where fp.active
  ),
  candidates as (
    select di.reminder_id, di.occurrence_date, di.title, ps.id as sub_id, ps.endpoint as ep, ps.p256dh as p256dh_key, ps.auth as auth_key
    from due_info di
    join profiles pr on pr.family_id = di.family_id and pr.role in ('admin', 'adult')
    join push_subscriptions ps on ps.profile_id = pr.id
  ),
  claimed as (
    insert into forecast_reminder_deliveries (forecast_reminder_id, occurrence_date, subscription_id)
    select reminder_id, occurrence_date, sub_id from candidates
    on conflict (forecast_reminder_id, occurrence_date, subscription_id) do nothing
    returning forecast_reminder_deliveries.forecast_reminder_id, forecast_reminder_deliveries.occurrence_date, forecast_reminder_deliveries.subscription_id
  )
  select c.sub_id, c.ep, c.p256dh_key, c.auth_key, c.title, c.occurrence_date
  from candidates c
  join claimed cl on cl.forecast_reminder_id = c.reminder_id and cl.occurrence_date = c.occurrence_date and cl.subscription_id = c.sub_id;
end;
$function$;

revoke all on function public.claim_due_forecast_reminders(jsonb) from public, anon, authenticated;
grant execute on function public.claim_due_forecast_reminders(jsonb) to service_role;

-- ============================================================
-- calendar_events.sync_to_google — exclusión selectiva de la sincronización saliente a Google Calendar
-- (Fase 1A.2 §A). DEFAULT TRUE: los 849 eventos existentes y cualquier evento creado sin especificar
-- este campo conservan EXACTAMENTE el comportamiento actual (se sincronizan). Solo el código de
-- Previsión pasará explícitamente sync_to_google=false en su evento derivado.
-- ============================================================
alter table calendar_events add column sync_to_google boolean not null default true;
