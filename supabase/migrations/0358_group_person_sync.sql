-- 0358 · CGI-1 · Una sola fuente para los datos personales de una persona que está en varios grupos.
-- Decisión de Jennifer (30/10/2026): nombre, apellidos, teléfono y correo se mantienen sincronizados entre TODAS las fichas que comparten `person_id`.
-- Lo propio de cada grupo (observaciones, alias de pago, madre/padre, baja, botes, pagos y permisos) sigue siendo independiente.
-- Nunca se fusionan personas por el nombre: solo comparten identidad las fichas que la persona reutilizó a propósito.
-- Sin perder datos: cada ficha conserva sus columnas (la sincronización las iguala), y desvincular deja a la ficha con sus datos actuales.

create or replace function private.person_sheet_ok(p_person uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from group_participants s
    where (s.id = p_person or s.person_id = p_person) and private.group_can(s.group_id)
  )
$$;
revoke execute on function private.person_sheet_ok(uuid) from public, anon;
grant execute on function private.person_sheet_ok(uuid) to authenticated;

create or replace function private.group_participants_person_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_canon group_participants%rowtype;
begin
  -- Las actualizaciones que hace este mismo disparador no vuelven a propagarse.
  if pg_trigger_depth() > 1 then return new; end if;

  if new.person_id is not null and (tg_op = 'INSERT' or new.person_id is distinct from old.person_id) then
    -- Solo se puede compartir identidad con una persona cuya ficha gestionas (evita escribir en fichas ajenas con un id adivinado).
    if auth.uid() is not null and not private.person_sheet_ok(new.person_id) then
      raise exception 'GROUP_PERSON_FORBIDDEN' using errcode = '42501';
    end if;
    -- Al unirse, la ficha adopta los datos de la identidad existente; solo lo que ella traía y la identidad no tenía se añade a la identidad.
    select * into v_canon from group_participants s
      where s.person_id = new.person_id and s.id <> new.id
      order by (s.id = new.person_id) desc, s.created_at limit 1;
    if found then
      new.name := v_canon.name;
      new.surname := coalesce(v_canon.surname, new.surname);
      new.phone := coalesce(v_canon.phone, new.phone);
      new.email := coalesce(v_canon.email, new.email);
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.group_participants_person_push()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 or new.person_id is null then return null; end if;
  if tg_op = 'INSERT' or new.person_id is distinct from old.person_id
     or new.name is distinct from old.name or new.surname is distinct from old.surname
     or new.phone is distinct from old.phone or new.email is distinct from old.email then
    update group_participants s
       set name = new.name, surname = new.surname, phone = new.phone, email = new.email
     where s.person_id = new.person_id and s.id <> new.id
       and (s.name, s.surname, s.phone, s.email) is distinct from (new.name, new.surname, new.phone, new.email);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_group_participants_person_sync on public.group_participants;
create trigger trg_group_participants_person_sync before insert or update on public.group_participants
  for each row execute function private.group_participants_person_sync();
drop trigger if exists trg_group_participants_person_push on public.group_participants;
create trigger trg_group_participants_person_push after insert or update on public.group_participants
  for each row execute function private.group_participants_person_push();
