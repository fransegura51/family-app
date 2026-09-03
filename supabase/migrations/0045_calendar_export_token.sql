-- Exportar el calendario de la app AL calendario nativo del móvil
-- (Google Calendar en Android/iPhone) — petición real: "sí quiero que
-- todos los datos que hayan en el calendario de la app se pasen al
-- calendario del móvil". Se resuelve con una dirección secreta en
-- formato iCal, el mismo mecanismo que ya usa la propia Jennifer para
-- traer SU calendario de Google hacia la app (Externos), pero en
-- sentido contrario: aquí es Google/Apple quien se suscribe a ESTA
-- URL. El token identifica a la familia sin necesitar sesión — quien
-- sea que la pida (el propio Google Calendar) no tiene ni puede tener
-- un login de la app.
create table calendar_export_tokens (
  family_id uuid primary key references families(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now()
);

alter table calendar_export_tokens enable row level security;

create policy "select own family export token"
  on calendar_export_tokens for select
  using (family_id = private.current_family_id());

-- Cualquier miembro con cuenta propia puede ver/generar el enlace de su
-- familia (no hace falta ser admin — es solo de lectura hacia fuera, no
-- da acceso a nada dentro de la app).
create or replace function public.get_or_create_calendar_export_token()
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_family_id uuid := private.current_family_id();
  v_token text;
begin
  if v_family_id is null then
    raise exception 'No autenticado';
  end if;

  insert into calendar_export_tokens (family_id)
  values (v_family_id)
  on conflict (family_id) do nothing;

  select token into v_token from calendar_export_tokens where family_id = v_family_id;
  return v_token;
end;
$function$;
