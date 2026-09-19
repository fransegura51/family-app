-- Petición real: web pública de PEPA (repo fransegura51/pepa-web,
-- PEPA_WEB_SKILL) para dar visibilidad a la marca de cara a una futura
-- comercialización. Reutiliza este mismo proyecto Supabase (para no
-- pagar uno nuevo) pero con una tabla propia y aislada: sin relación
-- con families/profiles/expenses. Quien se apunta aquí NO obtiene
-- acceso a ninguna familia — eso solo pasa por el sistema de invites ya
-- existente dentro de la app.
create table pepa_web_leads (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  name text,
  message text,
  source text not null default 'landing_hero_form',
  created_at timestamptz not null default now()
);

create unique index idx_pepa_web_leads_email on pepa_web_leads (lower(email));
create index idx_pepa_web_leads_created on pepa_web_leads (created_at desc);

alter table pepa_web_leads enable row level security;

-- Cualquier visitante anónimo puede apuntarse — es el único propósito
-- de esta tabla. Sin policy de select/update para anon: no puede leer
-- ni tocar leads de otras personas.
create policy "pepa_web_leads: anon insert" on pepa_web_leads
  for insert to anon
  with check (true);

-- Solo la dueña de la app los lee (mismo criterio que client_errors).
create policy "pepa_web_leads: owner select" on pepa_web_leads
  for select to authenticated
  using (exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner));

-- Idem para limpiar spam desde el panel.
create policy "pepa_web_leads: owner delete" on pepa_web_leads
  for delete to authenticated
  using (exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner));
