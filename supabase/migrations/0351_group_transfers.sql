-- 0351 · Copiar un grupo a otra persona con cuenta PEPA (otro espacio), con aceptación.
--
-- Cómo funciona: quien gestiona el grupo genera un CÓDIGO de un solo uso (caduca a los 7 días) y se lo da a la persona destinataria. Ella lo escribe, ve un resumen de lo que va a
-- recibir y lo ACEPTA. No hay buscador de usuarios ni lista de cuentas: nadie puede enviar datos de menores a una cuenta que no haya aceptado.
-- Dos modos exactos: «participantes» (solo las fichas) e «historial» (fichas + botes, aportaciones y gastos como «Gestión anterior», de SOLO LECTURA).
--  · La copia pertenece al espacio de destino y es independiente: no hay sincronización posterior.
--  · NO se crean ingresos ni gastos en Economía; no se transmiten referencias bancarias (bank_transaction_id), ni archivos de justificantes (queda constancia de que existían),
--    ni observaciones; teléfonos, correos, tutores y alias de pago solo viajan si quien envía lo marca expresamente tras declarar que está autorizada a compartirlos.
--  · El mismo bote histórico no se duplica en un mismo espacio (índice único por familia y origen); al copiar una copia se conserva la procedencia en `history.chain`.
-- Deshacer: supabase/rollbacks/0351_group_transfers_down.sql

create table public.group_transfers (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  from_user uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  code text not null unique,
  mode text not null check (mode in ('participantes', 'historial')),
  include_contacts boolean not null default false,
  declared_at timestamptz not null, -- declaración de quien envía: tiene autorización para compartir esos datos
  status text not null default 'pendiente' check (status in ('pendiente', 'aceptada', 'cancelada')),
  to_user uuid references public.profiles (id) on delete set null,
  new_group_id uuid references public.groups (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index idx_group_transfers_group on public.group_transfers (group_id);

create table public.group_transfer_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  at timestamptz not null default now()
);
create index idx_group_transfer_attempts on public.group_transfer_attempts (user_id, at desc);

alter table public.group_transfers enable row level security;
alter table public.group_transfer_attempts enable row level security;
create policy "group_transfers: sender" on public.group_transfers for select
  using (from_user = (select auth.uid()) and private.group_can(group_id));
revoke all on public.group_transfers, public.group_transfer_attempts from anon;
revoke insert, update, delete, truncate on public.group_transfers from authenticated;
revoke all on public.group_transfer_attempts from authenticated;

-- El registro de operaciones se puede saltar en copias masivas (una sola fila resumen por grupo).
create or replace function private.group_audit_trg()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_new jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_group uuid;
  v_detail jsonb := '{}'::jsonb;
  k text;
  v_pii text[] := array['name', 'surname', 'guardian_name', 'phone', 'email', 'payer_alias', 'notes', 'payer_label', 'concept', 'updated_at'];
  v_changed text[] := '{}';
  v_id text;
begin
  if coalesce(current_setting('app.skip_group_audit', true), '') = '1' then return coalesce(new, old); end if;
  v_group := (v_new ->> 'group_id')::uuid;
  if tg_table_name = 'groups' then v_group := (v_new ->> 'id')::uuid; end if;
  if v_group is null and v_new ? 'fund_id' then
    select f.group_id into v_group from group_funds f where f.id = (v_new ->> 'fund_id')::uuid;
  end if;
  if v_group is null then return coalesce(new, old); end if;
  if not exists (select 1 from groups g where g.id = v_group) then return coalesce(new, old); end if;
  v_id := coalesce(v_new ->> 'id', (v_new ->> 'fund_id') || ':' || coalesce(v_new ->> 'participant_id', v_new ->> 'user_id', ''));
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(v_new) loop
      if v_old -> k is distinct from v_new -> k and k <> 'updated_at' then
        v_changed := v_changed || k;
        if not (k = any (v_pii)) and k in ('amount', 'state', 'required_amount', 'status', 'kind', 'voided_at', 'default_amount', 'archived_at', 'left_at', 'entry_date') then
          v_detail := v_detail || jsonb_build_object(k, jsonb_build_object('from', v_old -> k, 'to', v_new -> k));
        end if;
      end if;
    end loop;
    if array_length(v_changed, 1) is null then return new; end if;
    v_detail := v_detail || jsonb_build_object('fields', to_jsonb(v_changed));
  elsif tg_op = 'INSERT' then
    if v_new ? 'amount' then v_detail := jsonb_build_object('amount', v_new -> 'amount', 'kind', v_new -> 'kind'); end if;
  end if;
  insert into group_audit (group_id, actor_id, action, entity, entity_id, detail)
  values (v_group, auth.uid(), lower(tg_op), tg_argv[0], v_id, nullif(v_detail, '{}'::jsonb));
  return coalesce(new, old);
end;
$$;
revoke execute on function private.group_audit_trg() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------- crear el código
create or replace function public.create_group_transfer(p_group uuid, p_mode text, p_include_contacts boolean, p_declared boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := '';
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := extensions.gen_random_bytes(8);
  i int;
begin
  if not private.group_can(p_group) then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  if p_mode not in ('participantes', 'historial') then raise exception 'INVALID_VALUE' using errcode = '22023'; end if;
  if not coalesce(p_declared, false) then raise exception 'DECLARATION_REQUIRED' using errcode = '22023'; end if;
  if (select count(*) from group_transfers where group_id = p_group and status = 'pendiente' and expires_at > now()) >= 5 then
    raise exception 'TOO_MANY_PENDING' using errcode = '22023';
  end if;
  for i in 0..7 loop
    v_code := v_code || substr(v_alphabet, 1 + (get_byte(v_bytes, i) % 32), 1);
  end loop;
  insert into group_transfers (group_id, code, mode, include_contacts, declared_at) values (p_group, v_code, p_mode, coalesce(p_include_contacts, false), now());
  insert into group_audit (group_id, actor_id, action, entity, detail)
  values (p_group, auth.uid(), 'create', 'transfer', jsonb_build_object('mode', p_mode, 'contacts', coalesce(p_include_contacts, false)));
  return v_code;
end;
$$;
revoke all on function public.create_group_transfer(uuid, text, boolean, boolean) from public, anon;
grant execute on function public.create_group_transfer(uuid, text, boolean, boolean) to authenticated;

create or replace function public.cancel_group_transfer(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update group_transfers set status = 'cancelada', resolved_at = now()
   where id = p_id and status = 'pendiente' and from_user = auth.uid() and private.group_can(group_id);
end;
$$;
revoke all on function public.cancel_group_transfer(uuid) from public, anon;
grant execute on function public.cancel_group_transfer(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------- ver y aceptar
create or replace function private.group_transfer_lookup(p_code text)
returns group_transfers
language plpgsql
security definer
set search_path = public
as $$
declare
  t group_transfers%rowtype;
begin
  if not private.groups_user_ok() then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  if (select count(*) from group_transfer_attempts where user_id = auth.uid() and at > now() - interval '1 hour') >= 10 then
    raise exception 'TOO_MANY_ATTEMPTS' using errcode = '22023';
  end if;
  select * into t from group_transfers where code = upper(btrim(coalesce(p_code, ''))) and status = 'pendiente' and expires_at > now();
  if not found then
    insert into group_transfer_attempts (user_id) values (auth.uid());
    raise exception 'INVALID_CODE' using errcode = '22023';
  end if;
  if t.from_user = auth.uid() then raise exception 'SELF_TRANSFER' using errcode = '22023'; end if;
  return t;
end;
$$;
revoke execute on function private.group_transfer_lookup(text) from public, anon, authenticated;

create or replace function public.preview_group_transfer(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t group_transfers%rowtype;
  g groups%rowtype;
begin
  t := private.group_transfer_lookup(p_code);
  select * into g from groups where id = t.group_id;
  return jsonb_build_object(
    'groupName', g.name,
    'fromName', coalesce((select display_name from profiles where id = t.from_user), 'Otra persona'),
    'mode', t.mode,
    'includeContacts', t.include_contacts,
    'participants', (select count(*) from group_participants where group_id = t.group_id and (t.mode = 'historial' or left_at is null)),
    'funds', case when t.mode = 'historial' then (select count(*) from group_funds where group_id = t.group_id) else 0 end
  );
end;
$$;
revoke all on function public.preview_group_transfer(text) from public, anon;
grant execute on function public.preview_group_transfer(text) to authenticated;

create or replace function public.accept_group_transfer(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t group_transfers%rowtype;
  g groups%rowtype;
  v_family uuid;
  v_sender text;
  v_new uuid;
  v_np int := 0; v_nf int := 0; v_skipped int := 0;
  r record;
  v_fund uuid;
  v_hist jsonb;
  v_from date; v_to date;
  v_step jsonb;
  v_pnew uuid;
  e record;
  ne uuid;
begin
  t := private.group_transfer_lookup(p_code);
  select family_id into v_family from profiles where id = auth.uid();
  select * into g from groups where id = t.group_id;
  v_sender := coalesce((select display_name from profiles where id = t.from_user), 'Otra persona');
  perform set_config('app.skip_group_audit', '1', true);

  insert into groups (family_id, name, period_label, created_by, copied_from)
  values (v_family, g.name, g.period_label, auth.uid(),
          jsonb_build_object('group', g.name, 'responsible', v_sender, 'copiedAt', now(), 'mode', t.mode, 'contacts', t.include_contacts))
  returning id into v_new;

  create temp table if not exists _pmap (old_id uuid primary key, new_id uuid not null) on commit drop;
  create temp table if not exists _emap (old_id uuid primary key, new_id uuid not null) on commit drop;
  truncate _pmap, _emap;

  for r in select * from group_participants where group_id = t.group_id and (t.mode = 'historial' or left_at is null) order by created_at loop
    insert into group_participants (group_id, name, surname, guardian_name, phone, email, payer_alias, notes, left_at, created_by)
    values (v_new, r.name, r.surname,
            case when t.include_contacts then r.guardian_name end, case when t.include_contacts then r.phone end,
            case when t.include_contacts then r.email end, case when t.include_contacts then r.payer_alias end,
            null, r.left_at, auth.uid())
    returning id into v_pnew;
    insert into _pmap values (r.id, v_pnew);
    v_np := v_np + 1;
  end loop;

  if t.mode = 'historial' then
    for r in select * from group_funds where group_id = t.group_id order by created_at loop
      select min(entry_date), max(entry_date) into v_from, v_to from fund_entries where fund_id = r.id;
      v_step := jsonb_build_object('responsible', v_sender, 'group', g.name, 'copiedAt', now());
      v_hist := jsonb_build_object(
        'responsible', coalesce(r.history ->> 'responsible', v_sender),
        'group', coalesce(r.history ->> 'group', g.name),
        'copiedAt', now(),
        'from', coalesce(r.history ->> 'from', v_from::text),
        'to', coalesce(r.history ->> 'to', v_to::text),
        'originalStatus', coalesce(r.history ->> 'originalStatus', r.status),
        'chain', coalesce(r.history -> 'chain', '[]'::jsonb) || jsonb_build_array(v_step));
      v_fund := null;
      insert into group_funds (group_id, family_id, name, contribution_type, default_amount, status, closed_at, close_note, leftover_amount, leftover_destination,
                               readonly_history, history, origin_uid, created_by)
      values (v_new, v_family, r.name, r.contribution_type, r.default_amount, 'cerrado', coalesce(r.closed_at, now()), r.close_note, r.leftover_amount, r.leftover_destination,
              true, v_hist, r.origin_uid, null)
      on conflict (family_id, origin_uid) do nothing
      returning id into v_fund;
      if v_fund is null then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      v_nf := v_nf + 1;
      insert into fund_members (fund_id, participant_id, state, required_amount)
      select v_fund, p.new_id, m.state, m.required_amount from fund_members m join _pmap p on p.old_id = m.participant_id where m.fund_id = r.id;
      truncate _emap;
      for e in select * from fund_entries where fund_id = r.id order by created_at loop
        insert into fund_entries (fund_id, group_id, kind, amount, entry_date, payer_label, method, concept, receipt_path, had_receipt,
                                  voided_at, void_reason, created_by)
        values (v_fund, v_new, e.kind, e.amount, e.entry_date, case when t.include_contacts then e.payer_label end, e.method, e.concept, null,
                (e.receipt_path is not null or e.had_receipt), e.voided_at, e.void_reason, null)
        returning id into ne;
        insert into _emap values (e.id, ne);
      end loop;
      insert into fund_entry_allocations (entry_id, participant_id, amount)
      select em.new_id, p.new_id, a.amount from fund_entry_allocations a join _emap em on em.old_id = a.entry_id join _pmap p on p.old_id = a.participant_id;
    end loop;
  end if;

  perform set_config('app.skip_group_audit', '', true);
  update group_transfers set status = 'aceptada', to_user = auth.uid(), new_group_id = v_new, resolved_at = now() where id = t.id;
  insert into group_audit (group_id, actor_id, action, entity, detail)
  values (v_new, auth.uid(), 'copy', 'group', jsonb_build_object('from', 'transfer', 'mode', t.mode, 'participants', v_np, 'funds', v_nf, 'skippedFunds', v_skipped)),
         (t.group_id, auth.uid(), 'copied_out', 'group', jsonb_build_object('mode', t.mode, 'participants', v_np, 'funds', v_nf));
  return jsonb_build_object('groupId', v_new, 'participants', v_np, 'funds', v_nf, 'skippedFunds', v_skipped);
end;
$$;
revoke all on function public.accept_group_transfer(text) from public, anon;
grant execute on function public.accept_group_transfer(text) to authenticated;
