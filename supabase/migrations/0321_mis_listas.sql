-- Mis listas: listas propias (tareas, ideas, comparativas) con carpetas, privacidad real, vínculos opcionales con el Calendario
-- y envío de elementos a la Lista de la compra. Aditiva: solo tablas, funciones y políticas NUEVAS; no toca datos de otros módulos.
--   · Privada (por defecto): solo quien la creó la ve y la edita. Familiar: la ve y la edita quien tenga la sección «listas».
--   · La carpeta es SIEMPRE de quien la creó: meter una lista en una carpeta nunca da acceso a nadie.
--   · Los elementos llevan texto plano (text) y, si tienen formato, un marcado limitado (rich): solo <b>, <c:color> y &lt; &gt; &amp;.
--   · Compras → Mis listas: marcar un producto como comprado marca como hecho el elemento de la lista (y volver a pendiente lo desmarca)
--     mientras el vínculo siga activo. Al revés NO: completar en Mis listas nunca toca Compras. Borrar el producto deja el elemento.
-- Deshacer: supabase/rollbacks/0321_mis_listas_down.sql.

-- ---------------------------------------------------------------------------------------------------------- carpetas
create table public.list_folders (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  created_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  sort_order bigint not null default (extract(epoch from now()) * 1000)::bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_list_folders_owner on public.list_folders(created_by);

-- ---------------------------------------------------------------------------------------------------------- listas
create table public.user_lists (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  created_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  kind text not null default 'tareas' check (kind in ('tareas', 'ideas', 'comparativa')),
  visibility text not null default 'privada' check (visibility in ('privada', 'familiar')),
  folder_id uuid references public.list_folders(id) on delete set null,
  sort_order bigint not null default (extract(epoch from now()) * 1000)::bigint,
  sort_mode text not null default 'manual' check (sort_mode in ('manual', 'pendientes_arriba')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_user_lists_family on public.user_lists(family_id);
create index idx_user_lists_folder on public.user_lists(folder_id);

create table public.list_columns (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.user_lists(id) on delete cascade,
  title text not null default '' check (char_length(title) <= 60),
  sort_order integer not null default 0
);
create index idx_list_columns_list on public.list_columns(list_id);

create table public.list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.user_lists(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  depth smallint not null default 0 check (depth in (0, 1)),
  text text not null check (char_length(text) <= 1000),
  rich text check (rich is null or (char_length(rich) <= 4000 and rich !~ '<(?!/?b>|/?c(:[a-z]+)?>)')),
  done boolean not null default false,
  done_at timestamptz,
  sort_order bigint not null default (extract(epoch from now()) * 1000)::bigint,
  column_id uuid references public.list_columns(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_list_items_list on public.list_items(list_id, sort_order);

-- Vínculos con el Calendario (eventos y tareas viven en calendar_events): muchos a muchos.
create table public.list_calendar_links (
  list_id uuid not null references public.user_lists(id) on delete cascade,
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  created_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (list_id, event_id)
);
create index idx_list_calendar_links_event on public.list_calendar_links(event_id);

-- Vínculo estable entre un elemento de Mis listas y el producto de Compras creado al enviarlo.
create table public.list_shopping_links (
  id uuid primary key default gen_random_uuid(),
  list_item_id uuid not null references public.list_items(id) on delete cascade,
  shopping_item_id uuid not null references public.shopping_items(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (list_item_id, shopping_item_id)
);
create index idx_list_shopping_links_shop on public.list_shopping_links(shopping_item_id);

-- ---------------------------------------------------------------------------------------------------------- acceso
-- ¿Puede esta persona ver/editar los elementos de la lista? (SECURITY DEFINER para no depender de la RLS de user_lists y evitar recursión.)
create or replace function private.list_accessible(p_list uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from user_lists l
    where l.id = p_list
      and l.family_id = private.current_family_id()
      and private.has_section_access('listas')
      and (l.visibility = 'familiar' or l.created_by = auth.uid())
  )
$$;
revoke execute on function private.list_accessible(uuid) from public, anon;
grant execute on function private.list_accessible(uuid) to authenticated;

-- La carpeta debe ser de quien crea o mueve la lista: una lista nunca puede colgar de la carpeta de otra persona.
create or replace function private.folder_is_mine(p_folder uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select p_folder is null or exists (select 1 from list_folders f where f.id = p_folder and f.created_by = auth.uid() and f.family_id = private.current_family_id())
$$;
revoke execute on function private.folder_is_mine(uuid) from public, anon;
grant execute on function private.folder_is_mine(uuid) to authenticated;

alter table public.list_folders enable row level security;
alter table public.user_lists enable row level security;
alter table public.list_columns enable row level security;
alter table public.list_items enable row level security;
alter table public.list_calendar_links enable row level security;
alter table public.list_shopping_links enable row level security;

create policy "list_folders: owner only" on public.list_folders for all
  using (created_by = auth.uid() and family_id = private.current_family_id() and private.has_section_access('listas'))
  with check (created_by = auth.uid() and family_id = private.current_family_id() and private.has_section_access('listas'));

create policy "user_lists: select" on public.user_lists for select
  using (family_id = private.current_family_id() and private.has_section_access('listas') and (visibility = 'familiar' or created_by = auth.uid()));
create policy "user_lists: insert own" on public.user_lists for insert
  with check (family_id = private.current_family_id() and private.has_section_access('listas') and created_by = auth.uid() and private.folder_is_mine(folder_id));
-- Título, carpeta, privacidad, archivo y borrado: solo quien creó la lista. Los demás editan sus elementos, no la lista.
create policy "user_lists: update own" on public.user_lists for update
  using (created_by = auth.uid() and family_id = private.current_family_id() and private.has_section_access('listas'))
  with check (created_by = auth.uid() and family_id = private.current_family_id() and private.has_section_access('listas') and private.folder_is_mine(folder_id));
create policy "user_lists: delete own" on public.user_lists for delete
  using (created_by = auth.uid() and family_id = private.current_family_id() and private.has_section_access('listas'));

create policy "list_columns: access" on public.list_columns for all
  using (private.list_accessible(list_id)) with check (private.list_accessible(list_id));

create policy "list_items: access" on public.list_items for all
  using (private.list_accessible(list_id))
  with check (private.list_accessible(list_id) and family_id = private.current_family_id());

-- Un vínculo se ve solo si se ve la lista (así una lista privada no se delata en el Calendario) y el evento es visible por su propia RLS.
create policy "list_calendar_links: select" on public.list_calendar_links for select
  using (private.list_accessible(list_id) and exists (select 1 from public.calendar_events e where e.id = event_id));
create policy "list_calendar_links: insert" on public.list_calendar_links for insert
  with check (private.list_accessible(list_id) and created_by = auth.uid() and family_id = private.current_family_id()
    and exists (select 1 from public.calendar_events e where e.id = event_id and e.family_id = private.current_family_id()));
create policy "list_calendar_links: delete" on public.list_calendar_links for delete
  using (private.list_accessible(list_id));

create policy "list_shopping_links: select" on public.list_shopping_links for select
  using (private.list_accessible((select i.list_id from public.list_items i where i.id = list_item_id)));
-- Los vínculos de Compras solo los crea la función enviar_a_compras (SECURITY DEFINER); no hay política de escritura directa.

-- Mínimo privilegio (como la 0312b): nadie sin sesión toca nada; y los vínculos con Compras solo se crean con enviar_a_compras.
revoke all on public.list_folders, public.user_lists, public.list_columns, public.list_items, public.list_calendar_links, public.list_shopping_links from anon;
revoke insert, update, delete, truncate on public.list_shopping_links from authenticated;

-- ---------------------------------------------------------------------------------------------------------- actualizar fechas
create or replace function private.list_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end
$$;
create trigger trg_list_folders_touch before update on public.list_folders for each row execute function private.list_touch();
create trigger trg_user_lists_touch before update on public.user_lists for each row execute function private.list_touch();
create trigger trg_list_items_touch before update on public.list_items for each row execute function private.list_touch();

-- done_at siempre coherente con done (aunque el cliente no lo envíe).
create or replace function private.list_item_done_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.done and (tg_op = 'INSERT' or not old.done) then new.done_at := coalesce(new.done_at, now());
  elsif not new.done then new.done_at := null;
  end if;
  return new;
end
$$;
create trigger trg_list_items_done_at before insert or update of done on public.list_items for each row execute function private.list_item_done_at();

-- ---------------------------------------------------------------------------------------------------------- Compras → Mis listas
-- Solo en un sentido: pendiente ↔ comprado de un producto vinculado se refleja en el elemento de la lista. Nada vuelve a Compras.
create or replace function private.sync_shopping_to_lists()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status = 'comprado' then
    update list_items i set done = true from list_shopping_links l where l.shopping_item_id = new.id and l.list_item_id = i.id and not i.done;
  elsif old.status = 'comprado' and new.status = 'pendiente' then
    update list_items i set done = false from list_shopping_links l where l.shopping_item_id = new.id and l.list_item_id = i.id and i.done;
  end if;
  return new;
end
$$;
create trigger trg_shopping_to_lists after update of status on public.shopping_items for each row execute function private.sync_shopping_to_lists();

-- ---------------------------------------------------------------------------------------------------------- RPC
-- Sustituye TODOS los elementos de una lista de forma atómica (importar con «sustituir»). SECURITY INVOKER: la RLS manda.
create or replace function public.replace_list_items(p_list uuid, p_items jsonb)
returns integer
language plpgsql
set search_path = public
as $$
declare n integer;
begin
  if not private.list_accessible(p_list) then raise exception 'lista no accesible' using errcode = '42501'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 500 then raise exception 'elementos no válidos' using errcode = '22023'; end if;
  delete from list_items where list_id = p_list;
  insert into list_items (list_id, family_id, depth, text, rich, done, sort_order)
  select p_list, private.current_family_id(), coalesce((e->>'depth')::smallint, 0), btrim(e->>'text'), nullif(e->>'rich', ''), coalesce((e->>'done')::boolean, false), (ord * 1000)::bigint
  from jsonb_array_elements(p_items) with ordinality as t(e, ord)
  where btrim(coalesce(e->>'text', '')) <> '';
  get diagnostics n = row_count;
  return n;
end
$$;
revoke execute on function public.replace_list_items(uuid, jsonb) from public, anon;
grant execute on function public.replace_list_items(uuid, jsonb) to authenticated;

-- Envía elementos a la Lista de la compra: crea un producto por elemento (texto limpio, sin formato) y el vínculo estable.
-- p_items = [{"item_id": uuid, "name": text}]. No crea compras, gastos ni historial de precios: solo productos pendientes.
create or replace function public.enviar_a_compras(p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare e jsonb; v_item uuid; v_new uuid; n integer := 0; v_name text;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 200 then raise exception 'elementos no válidos' using errcode = '22023'; end if;
  if not private.has_section_access('compras') then raise exception 'sin acceso a Compras' using errcode = '42501'; end if;
  for e in select * from jsonb_array_elements(p_items) loop
    v_item := (e->>'item_id')::uuid;
    v_name := left(btrim(e->>'name'), 200);
    continue when coalesce(v_name, '') = '';
    if not exists (select 1 from list_items i where i.id = v_item and private.list_accessible(i.list_id)) then
      raise exception 'elemento no accesible' using errcode = '42501';
    end if;
    insert into shopping_items (family_id, name) values (private.current_family_id(), v_name) returning id into v_new;
    insert into list_shopping_links (list_item_id, shopping_item_id, family_id) values (v_item, v_new, private.current_family_id());
    n := n + 1;
  end loop;
  return n;
end
$$;
revoke execute on function public.enviar_a_compras(jsonb) from public, anon;
grant execute on function public.enviar_a_compras(jsonb) to authenticated;
