-- 0354 · Contactos ampliados + vínculos alumno↔contacto + contactos pendientes de WhatsApp + formato de nombres por grupo.
--
-- Principios (encargo «Contactos, Gestión de grupos e importaciones inteligentes»):
--  · UNA sola agenda: la tabla `contacts` de siempre. Solo se le AÑADEN columnas opcionales (nada se borra, nada es obligatorio; `phone` y `email` siguen siendo el principal).
--  · Un alumno (participante) puede tener varios contactos familiares y un contacto puede estar vinculado a varios alumnos (`group_participant_contacts`). El vínculo vive en
--    Gestión de grupos; los datos personales siguen en la agenda.
--  · Los responsables de un grupo ven SOLO los contactos vinculados a ese grupo (función `group_linked_contacts`), no el resto de agendas.
--  · Contactos que llegan de capturas de WhatsApp y aún no se han identificado: `group_pending_contacts`. No son alumnos ni entran en cálculos de botes.
--  · `group_participants.person_id`: identidad compartida entre fichas de distintos grupos (reutilizar a «Pepito García» sin fusionar botes, pagos ni permisos).
--  · Formato con que se muestran los participantes (y orden) por grupo, y configuraciones guardadas para compartir listas de contactos.
-- Deshacer: supabase/rollbacks/0354_contacts_groups_links_down.sql

-- ---------------------------------------------------------------------------------------------------------- agenda: campos opcionales
alter table public.contacts add column if not exists surname text check (surname is null or length(surname) <= 120);
alter table public.contacts add column if not exists nickname text check (nickname is null or length(nickname) <= 120);
alter table public.contacts add column if not exists whatsapp_name text check (whatsapp_name is null or length(whatsapp_name) <= 160);
alter table public.contacts add column if not exists extra_phones text[] not null default '{}' check (cardinality(extra_phones) <= 10);
alter table public.contacts add column if not exists extra_emails text[] not null default '{}' check (cardinality(extra_emails) <= 10);
alter table public.contacts add column if not exists extra_categories text[] not null default '{}' check (cardinality(extra_categories) <= 10);
alter table public.contacts add column if not exists address text check (address is null or length(address) <= 300);
-- Procedencia de los datos: {kind: 'manual'|'whatsapp'|'vcf'|'telefono'|'grupo'|'formulario', at, detail?}.
alter table public.contacts add column if not exists source jsonb;

-- ---------------------------------------------------------------------------------------------------------- identidad compartida entre grupos
alter table public.group_participants add column if not exists person_id uuid;
create index if not exists idx_group_participants_person on public.group_participants (person_id) where person_id is not null;

-- ---------------------------------------------------------------------------------------------------------- formato de nombres y listas guardadas
alter table public.groups add column if not exists name_format text not null default 'full'
  check (name_format in ('first', 'first_unique', 'full', 'surname_first'));
alter table public.groups add column if not exists sort_by text not null default 'name' check (sort_by in ('name', 'surname'));
-- Configuraciones reutilizables de «Compartir lista de contactos»: [{id, name, fields[], ...}]. Sin datos personales.
alter table public.groups add column if not exists contact_share_presets jsonb not null default '[]'::jsonb
  check (jsonb_typeof(contact_share_presets) = 'array' and jsonb_array_length(contact_share_presets) <= 20);

-- ---------------------------------------------------------------------------------------------------------- acceso a un participante
create or replace function private.participant_group_can(p_participant uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from group_participants gp where gp.id = p_participant and private.group_can(gp.group_id))
$$;
revoke execute on function private.participant_group_can(uuid) from public, anon;
grant execute on function private.participant_group_can(uuid) to authenticated;

-- ¿El contacto es de mi espacio?
create or replace function private.contact_is_mine(p_contact uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from contacts c where c.id = p_contact and c.family_id = private.current_family_id())
$$;
revoke execute on function private.contact_is_mine(uuid) from public, anon;
grant execute on function private.contact_is_mine(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------- vínculos alumno ↔ contacto
create table public.group_participant_contacts (
  participant_id uuid not null references public.group_participants (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade, -- denormalizado para filtrar y para tiempo real; lo fija un disparador
  relation text not null default 'otro' check (relation in ('madre', 'padre', 'tutor', 'familiar', 'otro')),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (participant_id, contact_id)
);
create index idx_gpc_contact on public.group_participant_contacts (contact_id);
create index idx_gpc_group on public.group_participant_contacts (group_id);

create or replace function private.gpc_fill_group()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select gp.group_id into new.group_id from group_participants gp where gp.id = new.participant_id;
  if new.group_id is null then raise exception 'PARTICIPANT_NOT_FOUND' using errcode = '22023'; end if;
  return new;
end;
$$;
revoke execute on function private.gpc_fill_group() from public, anon, authenticated;
create trigger trg_gpc_fill_group before insert on public.group_participant_contacts for each row execute function private.gpc_fill_group();

alter table public.group_participant_contacts enable row level security;
create policy "gpc: select" on public.group_participant_contacts for select
  using (private.group_can(group_id));
-- Vincular exige ser responsable del grupo Y que el contacto sea de la agenda de mi espacio (no se vincula la agenda de otra persona).
create policy "gpc: insert" on public.group_participant_contacts for insert
  with check (private.participant_group_can(participant_id) and private.contact_is_mine(contact_id) and created_by = (select auth.uid()));
create policy "gpc: update" on public.group_participant_contacts for update
  using (private.group_can(group_id)) with check (private.group_can(group_id));
create policy "gpc: delete" on public.group_participant_contacts for delete
  using (private.group_can(group_id));
revoke all on public.group_participant_contacts from anon;

-- Datos de los contactos vinculados a UN grupo: lo único de la agenda que ve un responsable que no es de ese espacio. Solo campos ordinarios (nada de notas ni procedencia).
create or replace function public.group_linked_contacts(p_group uuid)
returns table (participant_id uuid, contact_id uuid, relation text, name text, surname text, phone text, email text, extra_phones text[], extra_emails text[], whatsapp_name text)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not private.group_can(p_group) then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  return query
    select l.participant_id, c.id, l.relation, c.name, c.surname, c.phone, c.email, c.extra_phones, c.extra_emails, c.whatsapp_name
    from group_participant_contacts l join contacts c on c.id = l.contact_id
    where l.group_id = p_group;
end;
$$;
revoke execute on function public.group_linked_contacts(uuid) from public, anon;
grant execute on function public.group_linked_contacts(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------- contactos pendientes de identificar (capturas de WhatsApp)
create table public.group_pending_contacts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  whatsapp_name text check (whatsapp_name is null or length(whatsapp_name) <= 160), -- nombre original tal como salía en WhatsApp: se conserva siempre
  phone text check (phone is null or length(phone) <= 30),
  guardian_hint text check (guardian_hint is null or length(guardian_hint) <= 160), -- posible padre/madre/tutor, tal como se leyó
  student_hint text check (student_hint is null or length(student_hint) <= 160),    -- posible alumno relacionado
  status text not null default 'pendiente' check (status in ('pendiente', 'vinculado', 'descartado')),
  contact_id uuid references public.contacts (id) on delete set null,
  source jsonb,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_gpend_group on public.group_pending_contacts (group_id);
alter table public.group_pending_contacts enable row level security;
create policy "gpend: access" on public.group_pending_contacts for all
  using (private.group_can(group_id)) with check (private.group_can(group_id) and (contact_id is null or private.contact_is_mine(contact_id)));
revoke all on public.group_pending_contacts from anon;
create trigger trg_gpend_touch before update on public.group_pending_contacts for each row execute function private.groups_touch();

-- ---------------------------------------------------------------------------------------------------------- registro y tiempo real
create trigger trg_audit_gpc after insert or delete on public.group_participant_contacts for each row execute function private.group_audit_trg('contact_link');

do $realtime$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['group_participant_contacts', 'group_pending_contacts'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end
$realtime$;
