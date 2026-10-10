-- "Lista de deseos" (Pequeños Grandes, Fases 12-16 del prompt maestro consolidado) — autorización directa
-- del usuario 2026-10-10, con requisitos explícitos: listas por persona/año/celebración (fecha de
-- celebración opcional), regalos con descripción/foto/enlace/precio opcional, enlaces públicos seguros
-- para invitados sin cuenta PEPA, reservas secretas (ni los niños ni el destinatario del regalo pueden
-- verlas), regalos conjuntos, deshacer la propia reserva, protección real frente a reservas simultáneas,
-- sin pagos integrados, sin acceso de invitados a nada privado de la familia. Aditiva de principio a fin:
-- tablas nuevas, no toca ninguna existente.

create table wishlists (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  -- La persona destinataria (para quién es la lista) — nunca quien la creó.
  owner_member_id uuid not null references family_members(id) on delete cascade,
  year int not null,
  -- Texto libre a propósito ("Cumpleaños", "Navidad", "Reyes"...) — no hay un catálogo cerrado de
  -- celebraciones en la app, igual que event_budget_items.category.
  occasion text not null,
  -- Opcional por decisión explícita: no todas las celebraciones tienen fecha fija.
  celebration_date date null,
  guest_token text null unique,
  created_by uuid null references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_wishlists_family on wishlists(family_id);
create index idx_wishlists_owner on wishlists(owner_member_id);

alter table wishlists enable row level security;
create policy "wishlists: family crud" on wishlists
  for all
  using (family_id = (select private.current_family_id()))
  with check (
    family_id = (select private.current_family_id())
    and (select private.member_in_current_family(owner_member_id))
  );

create table wishlist_items (
  id uuid primary key default gen_random_uuid(),
  wishlist_id uuid not null references wishlists(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  description text null,
  link text null,
  price numeric(10, 2) null check (price is null or price >= 0),
  -- Regalo conjunto: varias personas pueden reservarlo a la vez (ver wishlist_item_reservations). Falso
  -- por defecto — un regalo normal solo admite UNA reserva activa.
  allow_joint boolean not null default false,
  photo_storage_path text null,
  photo_original_name text null,
  photo_mime_type text null,
  sort_order bigint not null default 0,
  created_at timestamptz not null default now()
);
create index idx_wishlist_items_wishlist on wishlist_items(wishlist_id);

alter table wishlist_items enable row level security;
create policy "wishlist_items: family crud" on wishlist_items
  for all
  using (family_id = (select private.current_family_id()))
  with check (
    family_id = (select private.current_family_id())
    and exists (select 1 from wishlists w where w.id = wishlist_items.wishlist_id and w.family_id = (select private.current_family_id()))
  );

-- Reserva de un regalo — SECRETA: ni el destinatario de la lista ni ningún miembro con role 'child' puede
-- verla nunca (políticas de select más abajo), aunque sí puedan ver el propio regalo (wishlist_items, sin
-- restricción). "allow_joint" se copia del regalo en el momento de reservar (lo fija la capa de datos/la
-- función edge, nunca el cliente) para que el índice único de abajo pueda decidir sin mirar otra tabla.
create table wishlist_item_reservations (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references wishlist_items(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  -- Exactamente uno de los dos: alguien de la familia (con cuenta) o un invitado sin cuenta (por su
  -- nombre, sin más identidad que el guest_reservation_token que se lleva él).
  reserved_by_member_id uuid null references family_members(id) on delete set null,
  reserved_by_guest_name text null,
  guest_reservation_token text null unique,
  allow_joint boolean not null,
  created_at timestamptz not null default now(),
  -- Deshacer = marcar, nunca borrar (mismo criterio que el resto de la app) — libera el regalo para que
  -- otro lo reserve si no era conjunto.
  undone_at timestamptz null,
  check ((reserved_by_member_id is null) <> (reserved_by_guest_name is null))
);
create index idx_wishlist_item_reservations_item on wishlist_item_reservations(item_id);
create index idx_wishlist_item_reservations_family on wishlist_item_reservations(family_id);

-- Protección real frente a reservas simultáneas (condición explícita del usuario): un regalo NO conjunto
-- solo admite una fila activa — el propio índice único rechaza la segunda inserción aunque lleguen dos
-- peticiones a la vez, sin depender de que la aplicación lo compruebe antes (eso sí tendría una carrera).
create unique index idx_wishlist_item_reservations_exclusive on wishlist_item_reservations(item_id) where (undone_at is null and not allow_joint);
-- Un regalo conjunto admite varias personas, pero nunca la misma persona dos veces a la vez.
create unique index idx_wishlist_item_reservations_member_once on wishlist_item_reservations(item_id, reserved_by_member_id) where (undone_at is null and reserved_by_member_id is not null);

alter table wishlist_item_reservations enable row level security;

-- Visible para la familia EXCEPTO el destinatario de ese regalo y cualquier 'child' — el secreto es real
-- a nivel de fila, no solo ocultado en la interfaz.
create policy "wishlist_item_reservations: select family (not owner, not child)" on wishlist_item_reservations
  for select
  using (
    family_id = (select private.current_family_id())
    and (select private.current_role_in_family()) <> 'child'
    and not exists (
      select 1 from wishlist_items i join wishlists w on w.id = i.wishlist_id
      where i.id = wishlist_item_reservations.item_id and w.owner_member_id = (select private.current_member_id())
    )
  );
-- Siempre puedes ver (y por tanto deshacer) TU PROPIA reserva, aunque seas 'child' — nunca la de nadie
-- más. Para el destinatario de la lista esto nunca aplica: no puede reservar en la suya (ver el insert).
create policy "wishlist_item_reservations: select own" on wishlist_item_reservations
  for select
  using (family_id = (select private.current_family_id()) and reserved_by_member_id = (select private.current_member_id()));

create policy "wishlist_item_reservations: insert own" on wishlist_item_reservations
  for insert
  with check (
    family_id = (select private.current_family_id())
    and reserved_by_member_id = (select private.current_member_id())
    and not exists (
      select 1 from wishlist_items i join wishlists w on w.id = i.wishlist_id
      where i.id = wishlist_item_reservations.item_id and w.owner_member_id = (select private.current_member_id())
    )
  );

create policy "wishlist_item_reservations: undo own" on wishlist_item_reservations
  for update
  using (family_id = (select private.current_family_id()) and reserved_by_member_id = (select private.current_member_id()))
  with check (family_id = (select private.current_family_id()) and reserved_by_member_id = (select private.current_member_id()));

-- Enlace público (invitado sin cuenta PEPA) — mismo patrón, ya en producción, que
-- generate_event_open_rsvp_token (migración event_open_rsvp_token): SECURITY DEFINER, comprueba que quien
-- llama es de la familia dueña de la lista antes de generar/rotar el token; el token (24 bytes aleatorios)
-- es la única autenticación de la función edge wishlist-guest, que corre sin sesión de PEPA.
create or replace function public.generate_wishlist_guest_token(p_wishlist_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_family_id uuid;
  v_token text;
begin
  select family_id into v_family_id from wishlists where id = p_wishlist_id;
  if v_family_id is null or v_family_id <> private.current_family_id() then
    raise exception 'not found';
  end if;

  select guest_token into v_token from wishlists where id = p_wishlist_id;
  if v_token is not null then
    return v_token;
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');
  update wishlists set guest_token = v_token where id = p_wishlist_id;
  return v_token;
end;
$$;

revoke execute on function public.generate_wishlist_guest_token(uuid) from public, anon;
grant execute on function public.generate_wishlist_guest_token(uuid) to authenticated;

create or replace function public.regenerate_wishlist_guest_token(p_wishlist_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_family_id uuid;
  v_token text;
begin
  select family_id into v_family_id from wishlists where id = p_wishlist_id;
  if v_family_id is null or v_family_id <> private.current_family_id() then
    raise exception 'not found';
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');
  update wishlists set guest_token = v_token where id = p_wishlist_id;
  return v_token;
end;
$$;

revoke execute on function public.regenerate_wishlist_guest_token(uuid) from public, anon;
grant execute on function public.regenerate_wishlist_guest_token(uuid) to authenticated;

insert into storage.buckets (id, name, public)
values ('wishlist_items', 'wishlist_items', false)
on conflict (id) do nothing;

create policy "wishlist_items storage: family select" on storage.objects for select
  using (bucket_id = 'wishlist_items' and (storage.foldername(name))[1] = (select private.current_family_id())::text);

create policy "wishlist_items storage: family insert" on storage.objects for insert
  with check (bucket_id = 'wishlist_items' and (storage.foldername(name))[1] = (select private.current_family_id())::text);

create policy "wishlist_items storage: family delete" on storage.objects for delete
  using (bucket_id = 'wishlist_items' and (storage.foldername(name))[1] = (select private.current_family_id())::text);
