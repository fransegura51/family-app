-- 0298_location_phantom_zones.sql
--
-- Falsos avisos de «se ha ido de / ha llegado a Casa» por POSICIONES FALSAS DE RED (wifi/antena) que el móvil devuelve una y otra vez estando quieto en casa.
--
-- Datos reales (21/10/2026): el iPhone de Jennifer, en casa, mandó 204 lecturas en 24 h dentro de una zona de ~70 m a 340-420 m de Casa (91 lecturas
-- en una misma celda de 11 m), mezcladas con lecturas buenas a 4-17 m de Casa. Con las mismas coordenadas con 15 decimales que el 18/10 en el móvil de Paco
-- (Xiaomi). Un filtro de velocidad en el móvil no puede con esto en el iPhone hasta que Apple apruebe
-- la compilación nueva, y la confirmación de 0297 (60 s) no basta cuando las lecturas falsas duran minutos.
--
-- Qué hace: una tabla de «zonas fantasma» por familia (círculos donde el wifi/antena coloca mal la casa) y un disparador que DESCARTA cualquier posición que
-- caiga dentro de una de ellas, antes de guardarla. Así no se pinta en el mapa, no entra en el rastro y no puede disparar un aviso (la evaluación de reglas
-- es un disparador posterior). Cubre todos los caminos (app abierta, servicio nativo de Android, iPhone), porque actúa sobre las tablas.
--
-- Se rellena a mano: zonas en una familia solo si consta con datos que una posición falsa se repite allí. La zona no contiene ningún lugar guardado
-- (comprobado: el más cercano está a más de 300 m del centro). Para quitar una: delete from public.location_phantom_zones where id = '…'.

create table if not exists public.location_phantom_zones (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  radius_m integer not null check (radius_m between 20 and 300),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists location_phantom_zones_family_idx on public.location_phantom_zones (family_id);

alter table public.location_phantom_zones enable row level security;
revoke all on public.location_phantom_zones from anon, authenticated;
-- Sin políticas: solo las funciones de abajo (SECURITY DEFINER) y quien administra la base la tocan.

create or replace function private.drop_phantom_positions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.location_phantom_zones z
    where z.family_id = new.family_id
      and private.distance_m(new.latitude, new.longitude, z.latitude, z.longitude) <= z.radius_m
  ) then
    return null; -- la fila no se guarda
  end if;
  return new;
end;
$$;
revoke execute on function private.drop_phantom_positions() from public, anon, authenticated;

drop trigger if exists trg_drop_phantom_positions on public.member_locations;
create trigger trg_drop_phantom_positions
  before insert or update on public.member_locations
  for each row execute function private.drop_phantom_positions();

drop trigger if exists trg_drop_phantom_positions on public.member_location_history;
create trigger trg_drop_phantom_positions
  before insert on public.member_location_history
  for each row execute function private.drop_phantom_positions();

-- La zona falsa medida con datos reales, para las dos familias que comparten esa casa (Hepburn y la de pruebas Fran/Jenny).
-- Comprobado en la base (21/10/2026): dentro de este círculo cayeron 204 lecturas, TODAS del iPhone de Jennifer (de 09:50 a 13:07), y ninguna de los otros dos
-- móviles en todo el día, así que no es un sitio por el que pase nadie. (Se descartó una segunda zona a ~245 m al oeste: Paco y Jenny SÍ pasan por ahí andando.)
insert into public.location_phantom_zones (family_id, name, latitude, longitude, radius_m, note)
select f.family_id, 'Wifi de casa mal colocado (suroeste, 340-420 m)', 38.10328, -0.85342, 70,
       'Medido 21/10/2026: 204 lecturas del iPhone de Jennifer; el 18/10 las mismas coordenadas con 15 decimales en el móvil de Paco (Xiaomi)'
from (values
  ('011429a4-4fd8-4341-9c04-ec6b2f585196'::uuid),
  ('223ea7b0-bd93-4e6d-9acb-46d4aa60817b'::uuid)
) as f(family_id)
where exists (select 1 from public.families fam where fam.id = f.family_id)
  and not exists (select 1 from public.location_phantom_zones z where z.family_id = f.family_id and z.latitude = 38.10328 and z.longitude = -0.85342);
