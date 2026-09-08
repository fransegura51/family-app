-- Buzón de sugerencias — petición real: "cuando alguna familia de
-- prueba tenga alguna sugerencia, que nos la dejen en el buzón y
-- nosotros podamos aplicarlo". Cualquier familia deja sus propias
-- sugerencias (solo ve las suyas); la familia dueña de la app
-- (Fran/Jennifer, 011429a4-4fd8-4341-9c04-ec6b2f585196) las ve TODAS,
-- de cualquier familia, para poder revisarlas y aplicarlas — no hay
-- todavía un sistema de roles de administrador genérico, así que de
-- momento es esa familia concreta la que hace de dueña de la
-- plataforma (encaja con el plan ya anotado en el Skill: preparar la
-- app para venderla a otras familias más adelante).
create table suggestions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  profile_id uuid references profiles(id) on delete set null,
  message text not null,
  status text not null default 'pendiente' check (status in ('pendiente', 'aplicada', 'descartada')),
  admin_note text,
  created_at timestamptz not null default now()
);

alter table suggestions enable row level security;

create policy "suggestions: cada familia ve las suyas, la dueña las ve todas" on suggestions for select
  using (family_id = private.current_family_id() or private.current_family_id() = '011429a4-4fd8-4341-9c04-ec6b2f585196');

create policy "suggestions: cada familia deja las suyas" on suggestions for insert
  with check (family_id = private.current_family_id());

-- Solo la familia dueña marca el estado (aplicada/descartada) y deja
-- una nota — el buzón no se edita después de dejar la sugerencia,
-- solo se puede retirar (ver policy de delete).
create policy "suggestions: solo la dueña cambia el estado" on suggestions for update
  using (private.current_family_id() = '011429a4-4fd8-4341-9c04-ec6b2f585196')
  with check (private.current_family_id() = '011429a4-4fd8-4341-9c04-ec6b2f585196');

create policy "suggestions: retirar la propia o limpiar la dueña" on suggestions for delete
  using (family_id = private.current_family_id() or private.current_family_id() = '011429a4-4fd8-4341-9c04-ec6b2f585196');

create index idx_suggestions_family on suggestions(family_id);
