-- APRENDIZAJE COMPARTIDO PARA TODOS LOS ESTABLECIMIENTOS — tres niveles (aditivo; no borra ni modifica datos de las familias).
--
-- Hasta ahora solo aprendían 3 cadenas con 169 claves sembradas a mano. Ahora lo que las familias YA han confirmado
-- (products.class_confirmed_at con una clase estándar del catálogo) alimenta un conocimiento por TEXTO COMERCIAL, valga la tienda que sea:
--   1. PROVISIONAL  — una sola familia lo ha confirmado: se sugiere a las demás (la familia siempre puede corregirlo).
--   2. VALIDADA     — dos o más familias independientes coinciden y ninguna discrepa; o la revisión administrativa la aprueba.
--   3. PERSONAL     — la familia que elige otra clase la conserva (products.class_confirmed_at manda en el resolutor del cliente);
--                     su elección es un voto más, nunca sobrescribe la global. Si las familias discrepan → ambiguo: no se sugiere nada.
-- Orden en la RPC: cadena aprobada por PEPA (0143) > revisión administrativa > validada > provisional.
-- Privacidad: solo (text_key, clase estándar, hash de familia). El hash identifica "una familia distinta" sin exponerla: la tabla no es
-- legible por los usuarios y la RPC nunca lo devuelve. No viajan precios, tiendas, fechas, cantidades ni tickets.
-- ROLLBACK: supabase/rollbacks/0308_shared_learning_all_stores_down.sql

create table public.shared_product_confirmations (
  text_key text not null,
  family_hash text not null,
  food_type_key text not null references public.catalog_food_types (key) on update cascade on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (text_key, family_hash),
  constraint shared_product_confirmations_text_key_format check (
    text_key ~ '^[[:alnum:]]+( [[:alnum:]]+)*$' and text_key = lower(text_key)
    and length(text_key) between 2 and 60 and text_key !~ '\d( ?\d){8}'
  )
);
create index shared_product_confirmations_class_idx on public.shared_product_confirmations (food_type_key);

-- Revisión administrativa por texto (valida o bloquea). Escritura solo por migración / service_role.
create table public.shared_product_general_review (
  text_key text primary key,
  status text not null check (status in ('approved', 'blocked')),
  food_type_key text references public.catalog_food_types (key) on update cascade on delete restrict,
  notes text,
  reviewed_at timestamptz not null default now(),
  constraint shared_product_general_review_coherence check (
    (status = 'approved' and food_type_key is not null) or (status = 'blocked' and food_type_key is null)
  )
);

alter table public.shared_product_confirmations enable row level security;
alter table public.shared_product_general_review enable row level security;
revoke all on public.shared_product_confirmations, public.shared_product_general_review from public, anon, authenticated;

-- ¿Se puede compartir este texto? Mismas reglas de privacidad que el aprendizaje por cadena + al menos una letra.
create or replace function public.shared_text_key_ok(p_key text)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_key is not null
    and p_key ~ '^[[:alnum:]]+( [[:alnum:]]+)*$' and p_key = lower(p_key)
    and length(p_key) between 2 and 60 and p_key !~ '\d( ?\d){8}' and p_key ~ '[[:alpha:]]'
    and cardinality(public.check_commercial_text(p_key)) = 0
$$;

create or replace function public.shared_family_hash(p_family uuid)
returns text
language sql
immutable
set search_path = public
as $$ select md5('pepa-shared-v1:' || p_family::text) $$;

-- Recalcula el voto de UNA familia para UN texto a partir de sus productos (confirmados, con clase estándar). Una sola clase → voto;
-- ninguna o varias distintas dentro de la misma familia → sin voto. No toca ningún dato de la familia.
create or replace function public.shared_refresh_vote(p_family uuid, p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_classes text[];
begin
  if p_key is null then return; end if;
  if public.shared_text_key_ok(p_key) then
    select array_agg(distinct ft.catalog_key) into v_classes
    from public.products p
    join public.family_food_types ft on ft.family_id = p.family_id and ft.name = p.category and ft.catalog_key is not null
    where p.family_id = p_family and p.class_confirmed_at is not null
      and public.product_text_key(p.display_name) = p_key;
  end if;
  if v_classes is not null and cardinality(v_classes) = 1
     and exists (select 1 from public.catalog_food_types c where c.key = v_classes[1] and c.status = 'approved') then
    insert into public.shared_product_confirmations (text_key, family_hash, food_type_key)
    values (p_key, public.shared_family_hash(p_family), v_classes[1])
    on conflict (text_key, family_hash) do update set food_type_key = excluded.food_type_key, updated_at = now();
  else
    delete from public.shared_product_confirmations where text_key = p_key and family_hash = public.shared_family_hash(p_family);
  end if;
end;
$$;

create or replace function public.products_shared_vote_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.shared_refresh_vote(old.family_id, public.product_text_key(old.display_name));
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.shared_refresh_vote(new.family_id, public.product_text_key(new.display_name));
  end if;
  return null;
end;
$$;

create trigger products_shared_vote
  after insert or delete or update of display_name, category, class_confirmed_at on public.products
  for each row execute function public.products_shared_vote_trigger();

-- Nivel general de un texto: devuelve (level, food_type_key). level: admin | validated | provisional | conflict | blocked | none
create or replace function public.shared_general_level(p_key text)
returns table (level text, food_type_key text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rev record;
  v_top record;
  v_classes integer;
begin
  select r.status as r_status, r.food_type_key as r_class into v_rev from public.shared_product_general_review r where r.text_key = p_key;
  if found then
    if v_rev.r_status = 'blocked' then return query select 'blocked'::text, null::text; return; end if;
    if exists (select 1 from public.catalog_food_types c where c.key = v_rev.r_class and c.status = 'approved') then
      return query select 'admin'::text, v_rev.r_class; return;
    end if;
  end if;
  select count(distinct s.food_type_key) into v_classes from public.shared_product_confirmations s where s.text_key = p_key;
  if v_classes = 0 then return query select 'none'::text, null::text; return; end if;
  if v_classes > 1 then return query select 'conflict'::text, null::text; return; end if;
  select s.food_type_key as k, count(*) as n into v_top from public.shared_product_confirmations s where s.text_key = p_key group by s.food_type_key;
  if not exists (select 1 from public.catalog_food_types c where c.key = v_top.k and c.status = 'approved') then
    return query select 'none'::text, null::text; return;
  end if;
  return query select case when v_top.n >= 2 then 'validated' else 'provisional' end, v_top.k;
end;
$$;

-- Resolución: misma firma que 0143. Cadena aprobada por PEPA primero; después el conocimiento general (cualquier establecimiento).
create or replace function public.resolve_shared_product_class(p_store text, p_text text)
returns table (status text, chain_key text, text_key text, food_type_key text, source text, reason text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_chain record;
  v_issues text[];
  v_key text;
  v_row record;
  v_gen record;
  v_chain_key text;
  v_fallback_status text;
  v_fallback_reason text;
begin
  -- texto: solo latino y con la validación de privacidad (antes que nada: un texto no compartible no se consulta nunca)
  if p_text is not null and p_text ~ E'[^\u0001-\u024f\u2000-\u206f]' then
    return query select 'invalid'::text, null::text, null::text, null::text, null::text, 'unsupported_characters'::text;
    return;
  end if;
  v_issues := public.check_commercial_text(p_text);
  if cardinality(v_issues) > 0 then
    return query select 'invalid'::text, null::text, null::text, null::text, null::text, array_to_string(v_issues, ',');
    return;
  end if;
  v_key := public.product_text_key(p_text);

  select * into v_chain from public.resolve_store_chain(p_store);
  if v_chain.status <> 'resolved' then
    v_fallback_status := 'chain_unresolved';
    v_fallback_reason := v_chain.reason;
  else
    v_chain_key := v_chain.chain_key;
    if not v_chain.learnable then
      v_fallback_status := 'chain_not_learnable';
    else
      select l.status as l_status, l.food_type_key as l_food_type into v_row
      from public.shared_product_learning l where l.chain_key = v_chain.chain_key and l.text_key = v_key;
      if found and v_row.l_status = 'ambiguous' then
        return query select 'ambiguous'::text, v_chain_key, v_key, null::text, null::text, null::text;
        return;
      elsif found and v_row.l_status = 'approved'
            and exists (select 1 from public.catalog_food_types ft where ft.key = v_row.l_food_type and ft.status = 'approved') then
        return query select 'matched'::text, v_chain_key, v_key, v_row.l_food_type, 'shared'::text, null::text;
        return;
      end if;
      v_fallback_status := 'not_found';
    end if;
  end if;

  -- conocimiento general (cualquier establecimiento)
  if public.shared_text_key_ok(v_key) then
    select * into v_gen from public.shared_general_level(v_key);
    if v_gen.level in ('admin', 'validated', 'provisional') then
      return query select 'matched'::text, v_chain_key, v_key, v_gen.food_type_key,
        case v_gen.level when 'provisional' then 'general_provisional' else 'general_validated' end, null::text;
      return;
    elsif v_gen.level in ('conflict', 'blocked') then
      return query select 'ambiguous'::text, v_chain_key, v_key, null::text, null::text, null::text;
      return;
    end if;
  end if;
  return query select v_fallback_status, v_chain_key, v_key, null::text, null::text, v_fallback_reason;
end;
$$;

revoke all on function public.shared_text_key_ok(text), public.shared_family_hash(uuid), public.shared_refresh_vote(uuid, text),
  public.products_shared_vote_trigger(), public.shared_general_level(text) from public, anon, authenticated;
revoke all on function public.resolve_shared_product_class(text, text) from public, anon;
grant execute on function public.resolve_shared_product_class(text, text) to authenticated, service_role;

-- Recuperación de lo ya clasificado: voto de cada familia por cada texto (solo productos confirmados con clase estándar).
insert into public.shared_product_confirmations (text_key, family_hash, food_type_key)
select k, h, min(ck) from (
  select public.product_text_key(p.display_name) k, public.shared_family_hash(p.family_id) h, ft.catalog_key ck
  from public.products p
  join public.family_food_types ft on ft.family_id = p.family_id and ft.name = p.category and ft.catalog_key is not null
  join public.catalog_food_types c on c.key = ft.catalog_key and c.status = 'approved'
  where p.class_confirmed_at is not null
) t
where public.shared_text_key_ok(k)
group by k, h
having count(distinct ck) = 1
on conflict do nothing;
