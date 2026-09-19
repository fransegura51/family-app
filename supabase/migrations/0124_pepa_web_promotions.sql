-- "Promociones" del panel /admin de pepa-web: una franja/banner que
-- solo aparece en la web pública si está publicada y dentro de su
-- ventana de fechas (si tiene). No toca ninguna tabla de family-app.
create table pepa_web_promotions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  image_url text,
  button_text text,
  button_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_pepa_web_promotions_published on pepa_web_promotions (published, starts_at, ends_at);

alter table pepa_web_promotions enable row level security;

-- Público: publicada y, si tiene fechas, dentro de la ventana.
create policy "pepa_web_promotions: public select active" on pepa_web_promotions
  for select to anon, authenticated
  using (
    published = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );

create policy "pepa_web_promotions: owner select all" on pepa_web_promotions
  for select to authenticated
  using (exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner));

create policy "pepa_web_promotions: owner insert" on pepa_web_promotions
  for insert to authenticated
  with check (exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner));

create policy "pepa_web_promotions: owner update" on pepa_web_promotions
  for update to authenticated
  using (exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner))
  with check (exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner));

create policy "pepa_web_promotions: owner delete" on pepa_web_promotions
  for delete to authenticated
  using (exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner));
