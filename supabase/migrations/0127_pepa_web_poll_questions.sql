-- "La pregunta de Paco" pasa a gestionarse desde /admin en vez de
-- estar fija en el código del sitio (PACO_QUESTION en content.ts).
-- pepa_web_poll_votes.question_key sigue siendo texto libre, sin FK a
-- esta tabla a propósito: así el histórico de votos no depende del
-- ciclo de vida de la pregunta en el panel (editar/borrar una
-- pregunta vieja no puede romper votos ya emitidos).
create table pepa_web_poll_questions (
  key text primary key,
  question text not null,
  options jsonb not null,
  published boolean not null default false,
  publish_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table pepa_web_poll_questions enable row level security;

-- Público: solo la(s) publicada(s) y ya en su fecha de publicación.
create policy "pepa_web_poll_questions: public select published" on pepa_web_poll_questions
  for select to anon, authenticated
  using (published = true and (publish_at is null or publish_at <= now()));

create policy "pepa_web_poll_questions: owner select all" on pepa_web_poll_questions
  for select to authenticated
  using (exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner));

create policy "pepa_web_poll_questions: owner insert" on pepa_web_poll_questions
  for insert to authenticated
  with check (exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner));

create policy "pepa_web_poll_questions: owner update" on pepa_web_poll_questions
  for update to authenticated
  using (exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner))
  with check (exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner));

create policy "pepa_web_poll_questions: owner delete" on pepa_web_poll_questions
  for delete to authenticated
  using (exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner));
