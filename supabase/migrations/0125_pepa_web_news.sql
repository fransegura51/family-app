-- "Novedades" del panel /admin de pepa-web: noticias/funciones nuevas
-- que se listan en /novedades. No toca ninguna tabla de family-app.
create table pepa_web_news (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  image_url text,
  link_url text,
  published_at date,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_pepa_web_news_published on pepa_web_news (published, published_at desc);

alter table pepa_web_news enable row level security;

create policy "pepa_web_news: public select published" on pepa_web_news
  for select to anon, authenticated
  using (published = true);

create policy "pepa_web_news: owner select all" on pepa_web_news
  for select to authenticated
  using (exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner));

create policy "pepa_web_news: owner insert" on pepa_web_news
  for insert to authenticated
  with check (exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner));

create policy "pepa_web_news: owner update" on pepa_web_news
  for update to authenticated
  using (exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner))
  with check (exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner));

create policy "pepa_web_news: owner delete" on pepa_web_news
  for delete to authenticated
  using (exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner));
