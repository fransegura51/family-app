-- «Menú del evento»: sugerencias detectadas en las notas de un invitado que la familia DESCARTA.
-- Aditiva: no toca event_guest_dietary_needs ni ninguna nota. Sin esto, una detección incorrecta
-- (p. ej. "gambas" en una nota que no era una alergia) seguiría apareciendo como pendiente para siempre.
-- Clave (event_id, guest_id, category): es la misma que usa suggestFromGuestNotes para no repetir una sugerencia.
create table event_dietary_suggestion_dismissals (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  guest_id uuid not null references event_guests(id) on delete cascade,
  category text not null
    check (category in ('gluten', 'lactosa', 'lacteos', 'huevo', 'frutos_secos', 'cacahuete', 'marisco', 'pescado', 'soja', 'vegetariano', 'vegano', 'sin_cerdo', 'sin_alcohol', 'otra')),
  created_at timestamptz not null default now(),
  unique (event_id, guest_id, category)
);

create index idx_event_dietary_dismissals_event on event_dietary_suggestion_dismissals(event_id);

alter table event_dietary_suggestion_dismissals enable row level security;

create policy "event_dietary_suggestion_dismissals: family crud" on event_dietary_suggestion_dismissals for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (
    family_id = private.current_family_id()
    and private.has_section_access('eventos')
    and exists (
      select 1 from event_guests g
      where g.id = guest_id and g.family_id = private.current_family_id() and g.event_id = event_dietary_suggestion_dismissals.event_id
    )
  );
