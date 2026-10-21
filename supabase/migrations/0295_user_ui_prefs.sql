-- Fallo real reportado: «Los cambios que hice cuando usé la app en la web no se trasladaron a la versión móvil». El orden de los menús,
-- las pestañas fijadas, el tema de color, el orden de Inicio y otras preferencias de pantalla vivían SOLO en el almacenamiento local de
-- cada dispositivo (localStorage). Ahora se guardan también por persona, para que sigan a la cuenta en web, Android e iPhone.
create table if not exists public.user_ui_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_ui_prefs enable row level security;

create policy user_ui_prefs_select_own on public.user_ui_prefs for select to authenticated using (user_id = auth.uid());
create policy user_ui_prefs_insert_own on public.user_ui_prefs for insert to authenticated with check (user_id = auth.uid());
create policy user_ui_prefs_update_own on public.user_ui_prefs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
