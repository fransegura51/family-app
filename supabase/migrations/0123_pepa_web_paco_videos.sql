-- "Vídeos de Paco" del panel /admin de pepa-web. Se guarda solo el
-- enlace al vídeo ya publicado (TikTok, Instagram, YouTube o
-- Facebook — la familia sube a las 4), nunca una copia del archivo:
-- así no hace falta Storage pesado para esto, solo el link (petición
-- explícita del usuario: "no almacenar copias pesadas del vídeo en
-- Supabase si podemos reproducir el vídeo desde" donde ya está).
create table pepa_web_paco_videos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  video_url text not null,
  thumbnail_url text,
  platform text,
  sort_order int not null default 0,
  featured boolean not null default false,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_pepa_web_paco_videos_published on pepa_web_paco_videos (published, sort_order);

alter table pepa_web_paco_videos enable row level security;

-- Público: solo los vídeos publicados.
create policy "pepa_web_paco_videos: public select published" on pepa_web_paco_videos
  for select to anon, authenticated
  using (published = true);

-- La dueña de la app ve también los borradores (vista previa).
create policy "pepa_web_paco_videos: owner select all" on pepa_web_paco_videos
  for select to authenticated
  using (exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner));

create policy "pepa_web_paco_videos: owner insert" on pepa_web_paco_videos
  for insert to authenticated
  with check (exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner));

create policy "pepa_web_paco_videos: owner update" on pepa_web_paco_videos
  for update to authenticated
  using (exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner))
  with check (exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner));

create policy "pepa_web_paco_videos: owner delete" on pepa_web_paco_videos
  for delete to authenticated
  using (exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner));
