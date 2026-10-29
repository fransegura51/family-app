-- 0352 · Botes: alta y reparto de apuntes en una sola operación, y enlaces de consulta limitados para las familias.
--
--  · `add_fund_entry` y `set_entry_allocations` (SECURITY INVOKER: mandan las políticas de 0350) hacen en una transacción lo que de otro modo serían dos llamadas
--    (el apunte y su reparto): o se guarda todo o nada. Un movimiento bancario solo se puede enlazar si esta persona lo ve (su propia RLS) y una sola vez (índice único).
--  · `fund_share_links`: enlaces revocables con un token secreto. Dos tipos: «general» (estado de la recaudación, sin nombres) y «participante» (solo lo suyo). Los lee la función
--    de servidor `group-fund-public`, que NUNCA devuelve el directorio, teléfonos, correos, alias ni movimientos privados.
--  · `fund_payment_notices`: el aviso «Ya he pagado» de una familia. Es solo un aviso pendiente de verificar: no crea ningún ingreso ni marca a nadie como pagado.
-- Deshacer: supabase/rollbacks/0352_group_fund_entries_links_down.sql

create or replace function public.add_fund_entry(
  p_fund uuid, p_kind text, p_amount numeric, p_date date, p_payer text, p_method text, p_concept text, p_receipt text, p_bank_tx uuid, p_allocs jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  a record;
begin
  if p_bank_tx is not null and not exists (select 1 from bank_transactions b where b.id = p_bank_tx) then
    raise exception 'BANK_TRANSACTION_NOT_VISIBLE' using errcode = '42501';
  end if;
  insert into fund_entries (fund_id, kind, amount, entry_date, payer_label, method, concept, receipt_path, bank_transaction_id, created_by)
  values (p_fund, p_kind, p_amount, coalesce(p_date, current_date), nullif(btrim(p_payer), ''), p_method, nullif(btrim(p_concept), ''), p_receipt, p_bank_tx, auth.uid())
  returning id into v_id;
  for a in select * from jsonb_to_recordset(coalesce(p_allocs, '[]'::jsonb)) as x(participant_id uuid, amount numeric) loop
    insert into fund_entry_allocations (entry_id, participant_id, amount) values (v_id, a.participant_id, a.amount);
  end loop;
  return v_id;
end;
$$;
revoke all on function public.add_fund_entry(uuid, text, numeric, date, text, text, text, text, uuid, jsonb) from public, anon;
grant execute on function public.add_fund_entry(uuid, text, numeric, date, text, text, text, text, uuid, jsonb) to authenticated;

-- Sustituye el reparto de una aportación (identificar un ingreso, corregir un reparto). Vacío = vuelve a «sin identificar».
create or replace function public.set_entry_allocations(p_entry uuid, p_allocs jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  a record;
begin
  delete from fund_entry_allocations where entry_id = p_entry;
  for a in select * from jsonb_to_recordset(coalesce(p_allocs, '[]'::jsonb)) as x(participant_id uuid, amount numeric) loop
    insert into fund_entry_allocations (entry_id, participant_id, amount) values (p_entry, a.participant_id, a.amount);
  end loop;
  update fund_entries set updated_at = now() where id = p_entry; -- deja constancia en el registro de operaciones
end;
$$;
revoke all on function public.set_entry_allocations(uuid, jsonb) from public, anon;
grant execute on function public.set_entry_allocations(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------------------- enlaces de consulta
create table public.fund_share_links (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.group_funds (id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  kind text not null check (kind in ('general', 'participante')),
  participant_id uuid references public.group_participants (id) on delete cascade,
  active boolean not null default true,
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check ((kind = 'participante') = (participant_id is not null))
);
create unique index uq_fund_share_general on public.fund_share_links (fund_id) where kind = 'general' and active;
create unique index uq_fund_share_participant on public.fund_share_links (fund_id, participant_id) where kind = 'participante' and active;

create table public.fund_payment_notices (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.group_funds (id) on delete cascade,
  participant_id uuid not null references public.group_participants (id) on delete cascade,
  note text check (note is null or length(note) <= 200),
  status text not null default 'pendiente' check (status in ('pendiente', 'revisado')),
  created_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz
);
create index idx_fund_payment_notices_fund on public.fund_payment_notices (fund_id, status);

alter table public.fund_share_links enable row level security;
alter table public.fund_payment_notices enable row level security;

create policy "fund_share_links: select" on public.fund_share_links for select using (private.fund_read_ok(fund_id));
create policy "fund_share_links: insert" on public.fund_share_links for insert
  with check (private.fund_write_ok(fund_id) and created_by = (select auth.uid()) and active and revoked_at is null
    and (participant_id is null or private.participant_in_fund_group(fund_id, participant_id)));
-- Solo se puede REVOCAR (active → false); el token y el destino no cambian.
create policy "fund_share_links: revoke" on public.fund_share_links for update
  using (private.fund_read_ok(fund_id)) with check (private.fund_read_ok(fund_id));

create policy "fund_payment_notices: select" on public.fund_payment_notices for select using (private.fund_read_ok(fund_id));
create policy "fund_payment_notices: review" on public.fund_payment_notices for update
  using (private.fund_read_ok(fund_id)) with check (private.fund_read_ok(fund_id));
-- Los avisos los crea la función de servidor; ningún cliente inserta.

create or replace function private.fund_share_links_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.token <> old.token or new.fund_id <> old.fund_id or new.kind <> old.kind or new.participant_id is distinct from old.participant_id or new.created_by <> old.created_by then
    raise exception 'LINK_IMMUTABLE' using errcode = '22023';
  end if;
  if old.active and not new.active then new.revoked_at := now(); end if;
  if not old.active and new.active then raise exception 'LINK_REVOKED' using errcode = '22023'; end if;
  return new;
end;
$$;
create trigger trg_fund_share_links_guard before update on public.fund_share_links for each row execute function private.fund_share_links_guard();

create or replace function private.fund_notices_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.fund_id <> old.fund_id or new.participant_id <> old.participant_id or new.note is distinct from old.note or new.created_at <> old.created_at then
    raise exception 'NOTICE_IMMUTABLE' using errcode = '22023';
  end if;
  if new.status = 'revisado' and old.status = 'pendiente' then new.reviewed_by := auth.uid(); new.reviewed_at := now(); end if;
  return new;
end;
$$;
create trigger trg_fund_notices_guard before update on public.fund_payment_notices for each row execute function private.fund_notices_guard();

revoke all on public.fund_share_links, public.fund_payment_notices from anon;
revoke delete on public.fund_share_links from authenticated;
revoke insert, delete on public.fund_payment_notices from authenticated;

create trigger trg_audit_fund_share_links after insert or update on public.fund_share_links for each row execute function private.group_audit_trg('share_link');

do $realtime$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['fund_share_links', 'fund_payment_notices'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end
$realtime$;
