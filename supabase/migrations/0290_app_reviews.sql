-- Reseñas y opiniones de la app (17/10/2026): cada persona valora de 1 a 5 estrellas la app en general y cada sección, y puede escribir «lo que me gusta» y
-- «lo que no me gusta». Es aparte del Buzón de sugerencias (ese es para proponer cambios).
-- Una valoración por persona y sección (se puede cambiar). Cada persona ve y cambia SOLO las suyas; la dueña de la app (profiles.is_app_owner, public.am_i_app_owner)
-- las ve todas para saber cómo va. Solo aditiva: tabla nueva, ninguna existente se toca.
create table public.app_reviews (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  -- 'general' o el identificador de una sección de la app (calendario, compras, dinero…).
  section text not null check (section ~ '^[a-z0-9-]{1,30}$'),
  stars smallint not null check (stars between 1 and 5),
  liked text check (liked is null or char_length(liked) <= 1000),
  disliked text check (disliked is null or char_length(disliked) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, section)
);

create index idx_app_reviews_family on public.app_reviews(family_id);

alter table public.app_reviews enable row level security;

create policy "app_reviews: cada persona ve las suyas, la dueña todas" on public.app_reviews
  for select
  using (profile_id = (select auth.uid()) or (select public.am_i_app_owner()));

create policy "app_reviews: cada persona deja las suyas" on public.app_reviews
  for insert
  with check (profile_id = (select auth.uid()) and family_id = (select private.current_family_id()));

create policy "app_reviews: cada persona cambia las suyas" on public.app_reviews
  for update
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()) and family_id = (select private.current_family_id()));

create policy "app_reviews: cada persona borra las suyas" on public.app_reviews
  for delete
  using (profile_id = (select auth.uid()));

-- La app solo la usa gente con sesión: sin acceso para visitantes anónimos (la RLS ya lo impediría; esto lo deja explícito).
revoke all on public.app_reviews from anon;
