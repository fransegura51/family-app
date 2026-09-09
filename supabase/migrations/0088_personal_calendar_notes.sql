-- Petición real: "en calendario tienes que añadir un nuevo modo... le
-- vamos a poner de nombre personal y ahora aparece lo que cada
-- usuario quiera poner y que solo lo pueda ver ese usuario, lo que se
-- apunte ahí tiene que ser privado" — a diferencia de calendar_events
-- (compartido por toda la familia vía family_id), esto se filtra por
-- user_id: ni siquiera el resto de la familia puede leer las notas de
-- otro miembro, aunque compartan family_id. Nada de "campo oculto en
-- la UI" — la privacidad está en la propia política RLS.
create table personal_calendar_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  note_date date not null,
  text text not null,
  created_at timestamptz not null default now()
);

alter table personal_calendar_notes enable row level security;

create policy "personal_calendar_notes: owner only" on personal_calendar_notes for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index idx_personal_calendar_notes_user_date on personal_calendar_notes(user_id, note_date);
