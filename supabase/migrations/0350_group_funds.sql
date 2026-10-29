-- 0350 · Botes compartidos de un grupo (aportaciones, gastos, justificantes, traspasos, cierre y reapertura).
--
-- Principios:
--  · Un grupo puede tener varios botes independientes. Cada bote tiene SU PROPIA lista de participantes (`fund_members`): excluir o eximir a alguien en un bote no toca su ficha ni
--    ningún otro bote. Un bote nuevo empieza con todos los participantes activos; un participante nuevo NO entra solo en los botes ya creados.
--  · Los importes se CALCULAN siempre desde los apuntes (no hay totales guardados que puedan descuadrar): lo recaudado, lo pendiente y el saldo salen de `fund_entries`.
--  · Nada se borra: un apunte equivocado se ANULA (con motivo, quién y cuándo) y deja de contar; el apunte original se conserva.
--  · El importe exigido a un participante se puede cambiar sin tocar los apuntes ya registrados.
--  · Una aportación puede repartirse entre varios participantes (hermanos) sin contarse dos veces (`fund_entry_allocations`, suma ≤ importe). Sin reparto = «sin identificar»:
--    suma al saldo pero no marca a nadie como pagado.
--  · No crea gastos ni ingresos en Economía. Un apunte puede referenciar UN movimiento bancario (`bank_transaction_id`, único) para no contarlo dos veces.
--  · Un bote recibido como historial (`readonly_history`) es de solo lectura para siempre; un bote cerrado solo se modifica reabriéndolo (RPC, con registro).
-- Deshacer: supabase/rollbacks/0350_group_funds_down.sql

create table public.group_funds (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete restrict, -- un grupo con botes no se borra: se archiva
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  contribution_type text not null default 'igual' check (contribution_type in ('igual', 'variable', 'voluntaria')),
  default_amount numeric(12, 2) check (default_amount is null or default_amount >= 0),
  status text not null default 'abierto' check (status in ('abierto', 'cerrado')),
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete set null,
  close_note text check (close_note is null or length(close_note) <= 500),
  leftover_amount numeric(12, 2),
  leftover_destination text check (leftover_destination is null or leftover_destination in ('traspaso', 'devolucion', 'archivado')),
  reopened_count int not null default 0,
  -- Historial recibido de otro espacio: de solo lectura. `history` = {responsible, group, copiedAt, from, to, chain:[…]}.
  readonly_history boolean not null default false,
  history jsonb,
  -- Identidad estable del bote original: una copia la conserva, y así el mismo historial no se duplica dos veces en un mismo espacio.
  origin_uid uuid not null default gen_random_uuid(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_group_funds_group on public.group_funds (group_id);
create unique index uq_group_funds_origin on public.group_funds (family_id, origin_uid);

create table public.fund_members (
  fund_id uuid not null references public.group_funds (id) on delete cascade,
  participant_id uuid not null references public.group_participants (id) on delete restrict, -- con historial no se borra: se da de baja
  state text not null default 'participa' check (state in ('participa', 'no_participa', 'exento')),
  required_amount numeric(12, 2) check (required_amount is null or required_amount >= 0), -- null = el importe general del bote
  primary key (fund_id, participant_id)
);
create index idx_fund_members_participant on public.fund_members (participant_id);

create table public.fund_entries (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.group_funds (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete restrict,
  kind text not null check (kind in ('aportacion', 'gasto', 'entrega', 'reembolso', 'devolucion', 'traspaso_in', 'traspaso_out')),
  amount numeric(12, 2) not null check (amount > 0),
  entry_date date not null default current_date,
  payer_label text check (payer_label is null or length(payer_label) <= 200), -- quién pagó (p. ej. el nombre del Bizum); nunca sustituye al participante
  method text check (method is null or method in ('efectivo', 'bizum', 'transferencia', 'tarjeta', 'otro')),
  concept text check (concept is null or length(concept) <= 300),
  receipt_path text,      -- justificante en el bucket `group-receipts` (<group_id>/…)
  had_receipt boolean not null default false, -- en una copia histórica: constancia de que existía (el archivo no se copia)
  bank_transaction_id uuid unique references public.bank_transactions (id) on delete set null,
  transfer_id uuid,
  counterpart_fund_id uuid references public.group_funds (id) on delete set null,
  voided_at timestamptz,
  voided_by uuid references public.profiles (id) on delete set null,
  void_reason text check (void_reason is null or length(void_reason) <= 300),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_fund_entries_fund on public.fund_entries (fund_id);
create index idx_fund_entries_transfer on public.fund_entries (transfer_id) where transfer_id is not null;

create table public.fund_entry_allocations (
  entry_id uuid not null references public.fund_entries (id) on delete cascade,
  participant_id uuid not null references public.group_participants (id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  primary key (entry_id, participant_id)
);
create index idx_fund_alloc_participant on public.fund_entry_allocations (participant_id);

-- ---------------------------------------------------------------------------------------------------------- acceso
create or replace function private.fund_group(p_fund uuid)
returns uuid language sql security definer stable set search_path = public as $$
  select group_id from group_funds where id = p_fund
$$;
revoke execute on function private.fund_group(uuid) from public, anon;
grant execute on function private.fund_group(uuid) to authenticated;

-- Lectura: responsables del grupo. Escritura: además el bote debe estar abierto y no ser un historial recibido.
create or replace function private.fund_read_ok(p_fund uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from group_funds f where f.id = p_fund and private.group_can(f.group_id))
$$;
create or replace function private.fund_write_ok(p_fund uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from group_funds f where f.id = p_fund and f.status = 'abierto' and not f.readonly_history and private.group_can(f.group_id))
$$;
revoke execute on function private.fund_read_ok(uuid), private.fund_write_ok(uuid) from public, anon;
grant execute on function private.fund_read_ok(uuid), private.fund_write_ok(uuid) to authenticated;

-- ¿El participante es del mismo grupo que el bote?
create or replace function private.participant_in_fund_group(p_fund uuid, p_participant uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from group_funds f join group_participants p on p.group_id = f.group_id where f.id = p_fund and p.id = p_participant)
$$;
revoke execute on function private.participant_in_fund_group(uuid, uuid) from public, anon;
grant execute on function private.participant_in_fund_group(uuid, uuid) to authenticated;

-- Saldo del bote (calculado): entradas − salidas, sin los apuntes anulados.
create or replace function private.fund_balance(p_fund uuid)
returns numeric language sql security definer stable set search_path = public as $$
  select coalesce(sum(case when kind in ('aportacion', 'traspaso_in') then amount else -amount end), 0)
  from fund_entries where fund_id = p_fund and voided_at is null
$$;
revoke execute on function private.fund_balance(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------- RLS
alter table public.group_funds enable row level security;
alter table public.fund_members enable row level security;
alter table public.fund_entries enable row level security;
alter table public.fund_entry_allocations enable row level security;

create policy "group_funds: select" on public.group_funds for select using (private.group_can(group_id));
-- Se crean con la función create_group_fund (que añade a todos los participantes). Alta directa permitida solo para bote normal.
create policy "group_funds: insert" on public.group_funds for insert
  with check (private.group_can(group_id) and not readonly_history and history is null and status = 'abierto'
    and family_id = (select private.current_family_id()) and created_by = (select auth.uid()));
create policy "group_funds: update" on public.group_funds for update
  using (private.group_can(group_id) and not readonly_history and status = 'abierto')
  with check (private.group_can(group_id) and not readonly_history);
-- Borrar un bote: solo si está vacío (sin apuntes) y es normal. Con apuntes se cierra/archiva.
create policy "group_funds: delete empty" on public.group_funds for delete
  using (private.group_can(group_id) and not readonly_history and not exists (select 1 from public.fund_entries e where e.fund_id = group_funds.id));

create policy "fund_members: select" on public.fund_members for select using (private.fund_read_ok(fund_id));
create policy "fund_members: write" on public.fund_members for insert
  with check (private.fund_write_ok(fund_id) and private.participant_in_fund_group(fund_id, participant_id));
create policy "fund_members: update" on public.fund_members for update
  using (private.fund_write_ok(fund_id)) with check (private.fund_write_ok(fund_id) and private.participant_in_fund_group(fund_id, participant_id));
create policy "fund_members: delete" on public.fund_members for delete
  using (private.fund_write_ok(fund_id) and not exists (select 1 from public.fund_entry_allocations a join public.fund_entries e on e.id = a.entry_id where e.fund_id = fund_members.fund_id and a.participant_id = fund_members.participant_id));

create policy "fund_entries: select" on public.fund_entries for select using (private.fund_read_ok(fund_id));
create policy "fund_entries: insert" on public.fund_entries for insert
  with check (private.fund_write_ok(fund_id) and created_by = (select auth.uid()) and voided_at is null and transfer_id is null and counterpart_fund_id is null
    and kind not in ('traspaso_in', 'traspaso_out'));
-- Corregir/anular (no hay borrado). Los traspasos y las copias históricas solo se tocan con sus funciones.
create policy "fund_entries: update" on public.fund_entries for update
  using (private.fund_write_ok(fund_id) and transfer_id is null) with check (private.fund_write_ok(fund_id) and transfer_id is null);

create policy "fund_alloc: select" on public.fund_entry_allocations for select
  using (exists (select 1 from public.fund_entries e where e.id = entry_id and private.fund_read_ok(e.fund_id)));
create policy "fund_alloc: write" on public.fund_entry_allocations for insert
  with check (exists (select 1 from public.fund_entries e where e.id = entry_id and e.kind = 'aportacion' and private.fund_write_ok(e.fund_id)
    and private.participant_in_fund_group(e.fund_id, participant_id)));
create policy "fund_alloc: update" on public.fund_entry_allocations for update
  using (exists (select 1 from public.fund_entries e where e.id = entry_id and private.fund_write_ok(e.fund_id)))
  with check (exists (select 1 from public.fund_entries e where e.id = entry_id and e.kind = 'aportacion' and private.fund_write_ok(e.fund_id)));
create policy "fund_alloc: delete" on public.fund_entry_allocations for delete
  using (exists (select 1 from public.fund_entries e where e.id = entry_id and private.fund_write_ok(e.fund_id)));

revoke all on public.group_funds, public.fund_members, public.fund_entries, public.fund_entry_allocations from anon;
revoke delete on public.fund_entries from authenticated; -- sin borrado de apuntes: se anulan

-- ---------------------------------------------------------------------------------------------------------- disparadores
create trigger trg_group_funds_touch before update on public.group_funds for each row execute function private.groups_touch();
create trigger trg_fund_entries_touch before update on public.fund_entries for each row execute function private.groups_touch();

-- Los campos de estado del bote solo cambian con las funciones de cerrar/reabrir (interruptor local `app.fund_rpc`).
create or replace function private.group_funds_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.group_id <> old.group_id or new.family_id <> old.family_id or new.origin_uid <> old.origin_uid or new.readonly_history <> old.readonly_history
       or new.history is distinct from old.history then
      raise exception 'FUND_IMMUTABLE' using errcode = '22023';
    end if;
    if coalesce(current_setting('app.fund_rpc', true), '') <> '1' then
      if new.status <> old.status or new.closed_at is distinct from old.closed_at or new.closed_by is distinct from old.closed_by
         or new.leftover_amount is distinct from old.leftover_amount or new.leftover_destination is distinct from old.leftover_destination
         or new.close_note is distinct from old.close_note or new.reopened_count <> old.reopened_count then
        raise exception 'FUND_STATUS_RPC_ONLY' using errcode = '22023';
      end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_group_funds_guard before update on public.group_funds for each row execute function private.group_funds_guard();

-- Coherencia de apuntes: el grupo sale del bote; el dinero y el origen no se reescriben; anular exige motivo.
create or replace function private.fund_entries_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  v_group uuid;
  v_sum numeric;
begin
  if tg_op = 'INSERT' then
    select group_id into v_group from group_funds where id = new.fund_id;
    new.group_id := v_group;
    return new;
  end if;
  if new.fund_id <> old.fund_id or new.group_id <> old.group_id or new.kind <> old.kind or new.transfer_id is distinct from old.transfer_id
     or new.counterpart_fund_id is distinct from old.counterpart_fund_id or new.created_by is distinct from old.created_by then
    raise exception 'ENTRY_IMMUTABLE' using errcode = '22023';
  end if;
  if old.voided_at is not null and (new.voided_at is null or new.amount <> old.amount) then
    raise exception 'ENTRY_VOIDED' using errcode = '22023'; -- lo anulado no se resucita ni se edita
  end if;
  if new.voided_at is not null and old.voided_at is null then
    new.voided_by := auth.uid();
    if coalesce(btrim(new.void_reason), '') = '' then raise exception 'VOID_REASON_REQUIRED' using errcode = '22023'; end if;
  end if;
  select coalesce(sum(amount), 0) into v_sum from fund_entry_allocations where entry_id = new.id;
  if v_sum > new.amount then raise exception 'ALLOCATION_EXCEEDS_AMOUNT' using errcode = '22023'; end if;
  return new;
end;
$$;
create trigger trg_fund_entries_guard before insert or update on public.fund_entries for each row execute function private.fund_entries_guard();

-- El reparto de una aportación nunca supera su importe.
create or replace function private.fund_alloc_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  v_amount numeric;
  v_sum numeric;
begin
  select amount into v_amount from fund_entries where id = new.entry_id;
  select coalesce(sum(amount), 0) into v_sum from fund_entry_allocations where entry_id = new.entry_id and participant_id <> new.participant_id;
  if v_sum + new.amount > v_amount then raise exception 'ALLOCATION_EXCEEDS_AMOUNT' using errcode = '22023'; end if;
  return new;
end;
$$;
create trigger trg_fund_alloc_guard before insert or update on public.fund_entry_allocations for each row execute function private.fund_alloc_guard();

create trigger trg_audit_group_funds after insert or update on public.group_funds for each row execute function private.group_audit_trg('fund');
create trigger trg_audit_fund_members after update on public.fund_members for each row execute function private.group_audit_trg('fund_member');
create trigger trg_audit_fund_entries after insert or update on public.fund_entries for each row execute function private.group_audit_trg('fund_entry');

-- ---------------------------------------------------------------------------------------------------------- funciones
-- Crear un bote: todos los participantes ACTIVOS entran (participa) y nadie hereda decisiones de otros botes.
create or replace function public.create_group_fund(p_group uuid, p_name text, p_type text, p_amount numeric)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_family uuid;
begin
  if not private.group_can(p_group) then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  select family_id into v_family from groups where id = p_group;
  insert into group_funds (group_id, family_id, name, contribution_type, default_amount, created_by)
  values (p_group, v_family, btrim(p_name), p_type, case when p_type = 'igual' then p_amount else null end, auth.uid())
  returning id into v_id;
  insert into fund_members (fund_id, participant_id, state)
  select v_id, id, 'participa' from group_participants where group_id = p_group and left_at is null;
  return v_id;
end;
$$;
revoke all on function public.create_group_fund(uuid, text, text, numeric) from public, anon;
grant execute on function public.create_group_fund(uuid, text, text, numeric) to authenticated;

-- Traspaso entre botes: dos apuntes enlazados (sale/entra), sin crear ingresos ni gastos nuevos. Los dos botes deben estar abiertos y ser de grupos del usuario.
create or replace function public.transfer_between_funds(p_from uuid, p_to uuid, p_amount numeric, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tid uuid := gen_random_uuid();
  g_from uuid; g_to uuid;
begin
  if p_amount is null or p_amount <= 0 or p_from = p_to then raise exception 'INVALID_VALUE' using errcode = '22023'; end if;
  if not private.fund_write_ok(p_from) or not private.fund_write_ok(p_to) then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  if private.fund_balance(p_from) < p_amount then raise exception 'INSUFFICIENT_BALANCE' using errcode = '22023'; end if;
  select group_id into g_from from group_funds where id = p_from;
  select group_id into g_to from group_funds where id = p_to;
  insert into fund_entries (fund_id, group_id, kind, amount, concept, transfer_id, counterpart_fund_id, created_by)
  values (p_from, g_from, 'traspaso_out', p_amount, left(p_note, 300), v_tid, p_to, auth.uid()),
         (p_to, g_to, 'traspaso_in', p_amount, left(p_note, 300), v_tid, p_from, auth.uid());
  return v_tid;
end;
$$;
revoke all on function public.transfer_between_funds(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.transfer_between_funds(uuid, uuid, numeric, text) to authenticated;

-- Cerrar: no exige saldo cero. Con sobrante: traspasarlo a otro bote autorizado, registrar su devolución/entrega externa, o archivar dejando constancia.
create or replace function public.close_group_fund(p_fund uuid, p_option text, p_target uuid, p_note text)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric;
  v_group uuid;
begin
  if not private.fund_write_ok(p_fund) then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  if p_option not in ('traspaso', 'devolucion', 'archivado') then raise exception 'INVALID_VALUE' using errcode = '22023'; end if;
  v_balance := private.fund_balance(p_fund);
  select group_id into v_group from group_funds where id = p_fund;
  if v_balance > 0 and p_option = 'traspaso' then
    if p_target is null then raise exception 'INVALID_VALUE' using errcode = '22023'; end if;
    perform public.transfer_between_funds(p_fund, p_target, v_balance, coalesce(p_note, 'Sobrante del bote cerrado'));
  elsif v_balance > 0 and p_option = 'devolucion' then
    insert into fund_entries (fund_id, group_id, kind, amount, concept, created_by)
    values (p_fund, v_group, 'devolucion', v_balance, left(coalesce(p_note, 'Sobrante devuelto o entregado'), 300), auth.uid());
  end if;
  perform set_config('app.fund_rpc', '1', true);
  update group_funds set status = 'cerrado', closed_at = now(), closed_by = auth.uid(), close_note = left(p_note, 500),
         leftover_amount = case when v_balance > 0 then v_balance end,
         leftover_destination = case when v_balance > 0 then p_option end
   where id = p_fund;
  perform set_config('app.fund_rpc', '', true);
  return v_balance;
end;
$$;
revoke all on function public.close_group_fund(uuid, text, uuid, text) from public, anon;
grant execute on function public.close_group_fund(uuid, text, uuid, text) to authenticated;

-- Reabrir un bote ORIGINAL (nunca un historial recibido). Queda el registro de quién y cuándo (group_audit) y el contador.
create or replace function public.reopen_group_fund(p_fund uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  f group_funds%rowtype;
begin
  select * into f from group_funds where id = p_fund;
  if not found or not private.group_can(f.group_id) then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  if f.readonly_history then raise exception 'HISTORY_READONLY' using errcode = '42501'; end if;
  if f.status <> 'cerrado' then return; end if;
  perform set_config('app.fund_rpc', '1', true);
  update group_funds set status = 'abierto', closed_at = null, closed_by = null, reopened_count = reopened_count + 1 where id = p_fund;
  perform set_config('app.fund_rpc', '', true);
end;
$$;
revoke all on function public.reopen_group_fund(uuid) from public, anon;
grant execute on function public.reopen_group_fund(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------- justificantes (almacenamiento)
-- La primera carpeta del archivo es el id del grupo. Función segura para no fallar con carpetas de otros buckets que no sean uuid.
create or replace function private.group_can_txt(p text)
returns boolean language sql security definer stable set search_path = public as $$
  select p ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and private.group_can(p::uuid)
$$;
revoke execute on function private.group_can_txt(text) from public, anon;
grant execute on function private.group_can_txt(text) to authenticated;

insert into storage.buckets (id, name, public) values ('group-receipts', 'group-receipts', false) on conflict (id) do nothing;
create policy "group_receipts: read" on storage.objects for select to authenticated
  using (bucket_id = 'group-receipts' and private.group_can_txt((storage.foldername(name))[1]));
create policy "group_receipts: insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'group-receipts' and private.group_can_txt((storage.foldername(name))[1]));
create policy "group_receipts: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'group-receipts' and private.group_can_txt((storage.foldername(name))[1]));

-- ---------------------------------------------------------------------------------------------------------- tiempo real
do $realtime$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['group_funds', 'fund_members', 'fund_entries', 'fund_entry_allocations'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end
$realtime$;
 and private.group_can(p::uuid)
$;
revoke execute on function private.group_can_txt(text) from public, anon;
grant execute on function private.group_can_txt(text) to authenticated;
insert into storage.buckets (id, name, public) values ('group-receipts', 'group-receipts', false) on conflict (id) do nothing;
create policy "group_receipts: read" on storage.objects for select to authenticated
  using (bucket_id = 'group-receipts' and private.group_can_txt((storage.foldername(name))[1]));
create policy "group_receipts: insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'group-receipts' and private.group_can_txt((storage.foldername(name))[1]));
create policy "group_receipts: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'group-receipts' and private.group_can_txt((storage.foldername(name))[1]));

-- ---------------------------------------------------------------------------------------------------------- tiempo real
do $realtime$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['group_funds', 'fund_members', 'fund_entries', 'fund_entry_allocations'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end
$realtime$;
