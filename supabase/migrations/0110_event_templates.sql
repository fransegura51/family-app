-- Módulo Eventos — Fase 4: plantillas personales reutilizables
-- (06-custom-event.md: "Allow saving a completed module configuration
-- as a reusable personal template, useful for recurring family events
-- such as annual Christmas meals. Do not copy old live RSVP/expense
-- state into new occurrences.") — guarda solo la CONFIGURACIÓN
-- (tipo/subtipo/tema/módulos/details), nunca invitados/gastos/RSVP.
create table event_templates (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  type text not null check (type in ('cumpleanos', 'comunion', 'bautizo', 'celebracion', 'boda', 'personalizado')),
  subtype text,
  theme text,
  details jsonb not null default '{}'::jsonb,
  enabled_modules text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index idx_event_templates_family on event_templates(family_id);

alter table event_templates enable row level security;
create policy "event_templates: family crud" on event_templates for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (family_id = private.current_family_id() and private.has_section_access('eventos'));
