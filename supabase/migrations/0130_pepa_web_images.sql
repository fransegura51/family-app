-- "Imágenes" del panel /admin de pepa-web: sustituir las fotos de
-- ejemplo del carrusel del hero, de "Más organización" y de la demo
-- de la app, sin tocar código. Solo una lista blanca de claves fija
-- desde el propio panel (no texto libre) — mismo criterio que
-- pepa_web_texts. Sin concepto de borrador: sustituir una foto se ve
-- al momento, como los textos.
create table pepa_web_images (
  key text primary key,
  url text not null,
  alt text,
  updated_at timestamptz not null default now()
);

alter table pepa_web_images enable row level security;

create policy "pepa_web_images: public select" on pepa_web_images
  for select to anon, authenticated
  using (true);

create policy "pepa_web_images: owner insert" on pepa_web_images
  for insert to authenticated
  with check (exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner));

create policy "pepa_web_images: owner update" on pepa_web_images
  for update to authenticated
  using (exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner))
  with check (exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner));

create policy "pepa_web_images: owner delete" on pepa_web_images
  for delete to authenticated
  using (exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner));
