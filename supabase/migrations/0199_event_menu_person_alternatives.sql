-- «Menú del evento» (2.ª tanda): alternativa y estado de revisión POR PERSONA afectada por un plato.
-- Aditiva: no toca platos, necesidades ni menús. El plato general NO cambia; esta fila solo cuelga de
-- (plato, necesidad) y pertenece a la persona de esa necesidad. Sin fila = «Pendiente de revisar».
-- Una alternativa nunca se da por segura: se vuelve a comprobar contra las necesidades de esa persona.
create table event_menu_person_alternatives (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  dish_id uuid not null references event_menu_items(id) on delete cascade,
  need_id uuid not null references event_guest_dietary_needs(id) on delete cascade,
  -- null = sin alternativa escrita (no es una cadena vacía ni un 0).
  alternative_text text null check (alternative_text is null or length(trim(alternative_text)) > 0),
  review_status text not null default 'pendiente'
    check (review_status in ('pendiente', 'alternativa_prevista', 'confirmado_preparador', 'confirmado_restaurante')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dish_id, need_id)
);

create index idx_event_menu_person_alt_event on event_menu_person_alternatives(event_id);

alter table event_menu_person_alternatives enable row level security;

create policy "event_menu_person_alternatives: family crud" on event_menu_person_alternatives for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (
    family_id = private.current_family_id()
    and private.has_section_access('eventos')
    and exists (
      select 1 from event_menu_items i
      where i.id = dish_id and i.family_id = private.current_family_id() and i.event_id = event_menu_person_alternatives.event_id
    )
    and exists (
      select 1 from event_guest_dietary_needs n
      where n.id = need_id and n.family_id = private.current_family_id() and n.event_id = event_menu_person_alternatives.event_id
    )
  );
