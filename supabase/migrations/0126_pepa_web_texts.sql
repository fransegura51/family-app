-- Textos de marketing editables desde /admin (titular del hero,
-- subtítulo, algún CTA...). Lista blanca de claves controlada por el
-- propio panel (no texto libre) — esta tabla es solo el
-- almacenamiento clave/valor. Sin concepto de borrador: si el admin
-- cambia un texto, se ve al momento (son frases sueltas, no contenido
-- que necesite revisión antes de publicar).
create table pepa_web_texts (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table pepa_web_texts enable row level security;

-- Público: lee todos los textos (no hay nada sensible aquí).
create policy "pepa_web_texts: public select" on pepa_web_texts
  for select to anon, authenticated
  using (true);

create policy "pepa_web_texts: owner insert" on pepa_web_texts
  for insert to authenticated
  with check (exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner));

create policy "pepa_web_texts: owner update" on pepa_web_texts
  for update to authenticated
  using (exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner))
  with check (exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner));

create policy "pepa_web_texts: owner delete" on pepa_web_texts
  for delete to authenticated
  using (exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner));
