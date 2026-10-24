-- EQUIVALENCIAS DE PRODUCTOS (comparador de precios) — aditiva; no toca ningún dato existente.
--
-- Tres niveles, igual que CAT-1:
--   1. PERSONAL     — product_equivalences: lo que UNA familia decide sobre dos de SUS productos («es lo mismo» / «equivalente» / «no es lo
--                     mismo»). Privada de la familia (RLS por family_id); manda siempre en esa familia.
--   2. PROVISIONAL  — una familia ha dicho que dos nombres son equivalentes: a las demás solo se les SUGIERE (corregible).
--   3. VALIDADA     — dos o más familias independientes coinciden y ninguna discrepa: se aplica sola. Si ≥2 dicen «distintos» → bloqueada.
-- Lo compartido son SOLO nombres normalizados (text_key) + hash de familia; nunca precios, tiendas, fechas, tickets ni compras.
-- Una asociación equivocada de una familia nunca cambia por sí sola las comparaciones de las demás (provisional = sugerencia).
--
-- ROLLBACK: supabase/rollbacks/0311_product_equivalences_down.sql

create table public.product_equivalences (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  product_a uuid not null references public.products (id) on delete cascade,
  product_b uuid not null references public.products (id) on delete cascade,
  relation text not null check (relation in ('same', 'equivalent', 'different')),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint product_equivalences_order check (product_a < product_b),
  constraint product_equivalences_pair_uidx unique (product_a, product_b)
);
create index product_equivalences_family_idx on public.product_equivalences (family_id);

-- Los dos productos deben ser de LA MISMA familia que la decisión (nadie puede enlazar productos de otra familia).
create or replace function public.product_equivalences_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.products p where p.id in (new.product_a, new.product_b) and p.family_id = new.family_id) <> 2 then
    raise exception 'product_equivalences: los dos productos deben ser de la misma familia' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger product_equivalences_guard before insert or update on public.product_equivalences
  for each row execute function public.product_equivalences_guard();

alter table public.product_equivalences enable row level security;
create policy "product_equivalences: family crud" on public.product_equivalences
  for all to authenticated
  using (family_id = (select private.current_family_id()))
  with check (family_id = (select private.current_family_id()));
grant select, insert, update, delete on public.product_equivalences to authenticated;

-- Votos compartidos: solo nombres normalizados + hash de familia. No legible por los usuarios; se escribe desde el disparador.
create table public.shared_equivalence_votes (
  key_a text not null,
  key_b text not null,
  family_hash text not null,
  relation text not null check (relation in ('equivalent', 'different')),
  updated_at timestamptz not null default now(),
  primary key (key_a, key_b, family_hash),
  constraint shared_equivalence_votes_order check (key_a < key_b)
);
alter table public.shared_equivalence_votes enable row level security;
revoke all on public.shared_equivalence_votes from public, anon, authenticated;

create or replace function public.product_equivalences_vote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a text;
  v_b text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select public.product_text_key(display_name) into v_a from public.products where id = old.product_a;
    select public.product_text_key(display_name) into v_b from public.products where id = old.product_b;
    if v_a is not null and v_b is not null then
      delete from public.shared_equivalence_votes
      where key_a = least(v_a, v_b) and key_b = greatest(v_a, v_b) and family_hash = public.shared_family_hash(old.family_id);
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select public.product_text_key(display_name) into v_a from public.products where id = new.product_a;
    select public.product_text_key(display_name) into v_b from public.products where id = new.product_b;
    if v_a is not null and v_b is not null and v_a <> v_b and public.shared_text_key_ok(v_a) and public.shared_text_key_ok(v_b) then
      insert into public.shared_equivalence_votes (key_a, key_b, family_hash, relation)
      values (least(v_a, v_b), greatest(v_a, v_b), public.shared_family_hash(new.family_id), case when new.relation = 'different' then 'different' else 'equivalent' end)
      on conflict (key_a, key_b, family_hash) do update set relation = excluded.relation, updated_at = now();
    end if;
  end if;
  return null;
end;
$$;
create trigger product_equivalences_vote after insert or update or delete on public.product_equivalences
  for each row execute function public.product_equivalences_vote();

-- Equivalencias compartidas entre un conjunto de nombres (máx. 100): devuelve SOLO (key_a, key_b, level). Nunca votos, familias ni cuántas.
--   blocked     — alguna familia dice «equivalentes» y otra «distintos», o al menos dos dicen «distintos»
--   validated   — al menos dos familias dicen «equivalentes» y ninguna lo niega
--   provisional — una sola familia dice «equivalentes»
create or replace function public.resolve_shared_equivalences(p_keys text[])
returns table (key_a text, key_b text, level text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_keys is null or cardinality(p_keys) > 100 then
    raise exception 'resolve_shared_equivalences: máximo 100 nombres por llamada';
  end if;
  return query
    with agg as (
      select v.key_a, v.key_b,
        count(*) filter (where v.relation = 'equivalent') as eq,
        count(*) filter (where v.relation = 'different') as df
      from public.shared_equivalence_votes v
      where v.key_a = any (p_keys) and v.key_b = any (p_keys)
      group by v.key_a, v.key_b
    )
    select a.key_a, a.key_b,
      case
        when a.df >= 2 or (a.df >= 1 and a.eq >= 1) then 'blocked'
        when a.eq >= 2 then 'validated'
        else 'provisional'
      end
    from agg a
    where a.eq >= 1 or a.df >= 2;
end;
$$;

revoke all on function public.product_equivalences_guard(), public.product_equivalences_vote() from public, anon, authenticated;
revoke all on function public.resolve_shared_equivalences(text[]) from public, anon;
grant execute on function public.resolve_shared_equivalences(text[]) to authenticated, service_role;

-- Privilegios mínimos (en producción se aplicó aparte, el 24/10/2026, junto con «0312b_least_privilege_new_tables»): Supabase concede por defecto todos los privilegios a anon y
-- authenticated en tablas nuevas; aquí se deja solo lo necesario. La tabla de votos compartidos no la toca ningún usuario.
revoke all on public.product_equivalences from anon, authenticated;
grant select, insert, update, delete on public.product_equivalences to authenticated;
