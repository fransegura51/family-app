-- COMUNIDAD PEPA — contenido oficial (consejos de Pepa, encuestas semanales, artículos de Equipo PEPA), resúmenes de comentarios y respuestas de Pepa.
--
-- Reglas aprobadas:
--  · Identidades oficiales «Equipo PEPA» y «Pepa», claramente marcadas (0264); no hay usuarios falsos.
--  · Pepa propone un lote semanal; basta la aprobación de CUALQUIERA de los dos administradores; el administrador puede editar, aprobar o rechazar; se registra
--    autor, fecha y versión aprobada. NADA oficial se publica sin aprobación humana, ni por fecha.
--  · Encuesta oficial semanal: propuesta en el mismo lote; si se aprueba se publica el sábado a las 10:00 y cierra el domingo a las 17:00 (hora peninsular
--    española, con el cambio de hora de verano/invierno). Un voto por persona, anónimo; antes de votar los resultados están ocultos; tras votar, parciales;
--    al cerrar, finales para todos (también visitantes). Los comentarios están abiertos desde el sábado y siguen abiertos tras el cierre.
--  · Artículos oficiales de investigación: solo con fuentes externas (INE, Eurostat…) con fechas y metodología; sin fuentes no se aprueban. Revisión humana.
--  · Pepa puede responder sola a preguntas sin respuesta humana tras 6 horas, con un máximo de 3 intervenciones no solicitadas por hora móvil; la cuarta posible
--    avisa a los dos administradores. Las menciones directas a Pepa (@pepa) se tratan aparte con límites antispam. Una respuesta de Pepa no cuenta como
--    respuesta humana (ya garantizado en los listados).
--  · Resumen de comentarios (no confundir con los artículos): con 15 comentarios o más; se actualiza tras 10 comentarios nuevos o a petición; si falla la IA
--    la conversación sigue accesible (el resumen es siempre un complemento, nunca bloquea).

--  · Menú semanal oficial («Menú semanal de Pepa»): tipo `menu`. Lo prepara una PERSONA (banco editorial) y lo APRUEBA un administrador; NO hay generación
--    automática del contenido. Un menú semanal (payload.schedule = 'saturday') se programa al aprobarlo y se publica el sábado a las 10:00 (Europe/Madrid) para
--    la semana SIGUIENTE (de lunes a domingo), solo si el ajuste `weekly_menu_autopublish` vale 1 (por defecto 0 = DESACTIVADO hasta que la dueña lo valide).
--    Una sola publicación por semana, ejecuciones repetidas inofensivas, 3 intentos como máximo con el error a la vista y reintento manual de la administración.

-- Tipos de publicación oficiales (no son tipos de publicación de personas: las funciones de usuario solo aceptan los 4 de siempre).
alter table public.community_posts drop constraint community_posts_kind_check;
alter table public.community_posts add constraint community_posts_kind_check check (kind in ('receta', 'pregunta', 'consejo', 'anecdota', 'encuesta', 'articulo', 'menu'));
alter table public.community_posts add constraint community_posts_official_kinds check (kind not in ('encuesta', 'articulo', 'menu') or is_official);
-- Datos estructurados del menú (7 días × comida y cena, con sus recetas): columna `menu` (creada en 0264), SOLO en las publicaciones de tipo `menu`. Para un menú
-- semanal lleva además week_start y week_end (lunes y domingo de la semana a la que corresponde, «AAAA-MM-DD»). Nunca sale en las tarjetas ni en la lectura
-- pública sin sesión: solo en community_get_post (con acceso de lectura).
alter table public.community_posts add constraint community_posts_menu_kind check ((kind = 'menu') = (menu is not null));
-- Una sola publicación visible por semana (red de seguridad además del índice de community_official_items).
create unique index uq_community_posts_menu_week on public.community_posts ((menu ->> 'week_start')) where kind = 'menu' and status = 'published' and menu ->> 'week_start' is not null;

-- Interruptor de la publicación automática del menú semanal: DESACTIVADO (0). No se cambia desde el Centro de Mando (solo lectura): se activa con una migración
-- o un ajuste técnico cuando la dueña lo valide.
insert into public.community_settings (key, value, description) values
  ('weekly_menu_autopublish', '0', 'Publicación automática del menú semanal los sábados a las 10:00 (hora peninsular): 0 = DESACTIVADA hasta que se valide, 1 = activada. Aunque esté activada, solo se publica un menú aprobado por una persona.');

-- ---------------------------------------------------------------------------------------------
-- Propuestas del lote semanal y su revisión.
-- ---------------------------------------------------------------------------------------------
create table public.community_official_items (
  id uuid primary key default gen_random_uuid(),
  -- Identificador ESTABLE de las publicaciones semilla («inicial-04-tortilla…»): permite corregir su texto sin duplicarlas ni cambiar su identidad. Null en el resto.
  seed_key text unique,
  kind text not null check (kind in ('tip', 'poll', 'article', 'menu')),
  section text not null check (section in ('recetas', 'hogar')),
  topic_id text not null references public.community_topics(id),
  title text not null check (char_length(btrim(title)) between 3 and 140),
  body text not null default '' check (char_length(body) <= 10000),
  -- poll: {"options":["a","b",...]} (2 a 6 opciones); article: {"sources":[{"title","publisher","url","date"}],"methodology":"…","comparison":"…"};
  -- menu: {"menu":{"version":1,"servings":4,"days":[…7 días…]},"schedule":"saturday"?,"source":"…"?} (ver private.community_validate_menu_item).
  payload jsonb not null default '{}'::jsonb,
  batch_week date not null,
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected', 'published')),
  version integer not null default 1,
  proposed_by text not null default 'Pepa',
  proposed_at timestamptz not null default now(),
  approved_by uuid,
  approved_at timestamptz,
  approved_version integer,
  rejected_by uuid,
  rejected_at timestamptz,
  review_note text,
  publish_at timestamptz,
  published_post_id uuid references public.community_posts(id),
  -- Menú semanal: lunes de la semana a la que corresponde (se fija al APROBAR o reprogramar; null mientras es borrador o si no es semanal).
  menu_week_start date,
  -- Publicación programada: intentos fallidos (máximo 3 automáticos), último error (SIN datos privados) y fecha del último intento.
  publish_attempts integer not null default 0 check (publish_attempts >= 0),
  publish_error text,
  last_publish_attempt_at timestamptz,
  -- Se editó el TEXTO de un menú sin revisar sus datos estructurados: hay que confirmarlo al aprobar (texto y datos no se desincronizan en silencio).
  menu_text_stale boolean not null default false,
  constraint community_official_items_menu_week check (menu_week_start is null or kind = 'menu')
);
create index idx_community_official_items_status on public.community_official_items (status, batch_week);
-- UNA sola publicación (o programación) por semana: dos menús no pueden tener la misma semana mientras no se rechace uno.
create unique index uq_community_official_menu_week on public.community_official_items (menu_week_start) where kind = 'menu' and menu_week_start is not null and status <> 'rejected';
create index idx_community_official_menu_due on public.community_official_items (publish_at) where kind = 'menu' and status = 'approved';
alter table public.community_official_items enable row level security;
revoke all on public.community_official_items from anon, authenticated;

create table public.community_official_item_versions (
  item_id uuid not null references public.community_official_items(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  edited_by uuid,
  edited_at timestamptz not null default now(),
  primary key (item_id, version)
);
alter table public.community_official_item_versions enable row level security;
revoke all on public.community_official_item_versions from anon, authenticated;

alter table public.community_posts add constraint community_posts_official_item_fk foreign key (official_item_id) references public.community_official_items(id);

-- ---------------------------------------------------------------------------------------------
-- Encuestas.
-- ---------------------------------------------------------------------------------------------
create table public.community_polls (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null unique references public.community_official_items(id),
  post_id uuid unique references public.community_posts(id),
  question text not null,
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'open', 'closed')),
  check (closes_at > opens_at)
);
alter table public.community_polls enable row level security;
revoke all on public.community_polls from anon, authenticated;

create table public.community_poll_votes (
  poll_id uuid not null references public.community_polls(id) on delete cascade,
  profile_id uuid not null references public.community_profiles(id) on delete cascade,
  option_index integer not null check (option_index between 0 and 5),
  voted_at timestamptz not null default now(),
  primary key (poll_id, profile_id)
);
alter table public.community_poll_votes enable row level security;
revoke all on public.community_poll_votes from anon, authenticated;

-- Sábado a las 10:00 y domingo a las 17:00 hora de Madrid (con el cambio de hora). p_from = instante de aprobación.
-- REGLA APROBADA (15/10/2026): la aprobación NUNCA publica al instante. La encuesta aprobada se publica automáticamente el PRÓXIMO sábado a las 10:00 (Europe/Madrid)
-- y se cierra el domingo a las 17:00. Si se aprueba el sábado antes de las 10:00, sale ese mismo sábado; si se aprueba a las 10:00 o después (incluso dentro de la
-- ventana de ese fin de semana), sale el sábado siguiente.
create or replace function private.community_poll_window(p_from timestamptz)
returns table(opens_at timestamptz, closes_at timestamptz)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_local timestamp := p_from at time zone 'Europe/Madrid';
  v_date date := v_local::date;
  v_dow integer := extract(isodow from v_local)::integer; -- 1 lunes … 7 domingo
  v_sat date;
begin
  -- Sábado de la semana en curso (de lunes a domingo, el que cae dentro de esa semana ISO).
  v_sat := v_date + (6 - v_dow);
  if ((v_sat + time '10:00') at time zone 'Europe/Madrid') <= p_from then
    v_sat := v_sat + 7;
  end if;
  return query select ((v_sat + time '10:00') at time zone 'Europe/Madrid'), (((v_sat + 1) + time '17:00') at time zone 'Europe/Madrid');
end;
$$;
revoke execute on function private.community_poll_window(timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Menú semanal oficial: ventana de publicación, validación y calidad. (Funciones puras: no leen ni escriben tablas.)
-- ---------------------------------------------------------------------------------------------
-- Próximo sábado a las 10:00 (Europe/Madrid, con el cambio de hora de verano e invierno) ESTRICTAMENTE posterior a p_from, y el lunes y el domingo de la semana
-- SIGUIENTE a ese sábado (la semana que cubre el menú). Aprobado el sábado a las 10:00 en punto o más tarde, sale el sábado siguiente (la aprobación nunca publica
-- al instante). Mismo modelo que community_poll_window (que NO se toca: es de las encuestas).
create or replace function private.community_menu_publish_window(p_from timestamptz)
returns table(publish_at timestamptz, week_start date, week_end date)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_local timestamp := p_from at time zone 'Europe/Madrid';
  v_dow integer := extract(isodow from v_local)::integer; -- 1 lunes … 7 domingo
  v_sat date := v_local::date + (6 - v_dow);
begin
  if ((v_sat + time '10:00') at time zone 'Europe/Madrid') <= p_from then
    v_sat := v_sat + 7;
  end if;
  return query select ((v_sat + time '10:00') at time zone 'Europe/Madrid'), v_sat + 2, v_sat + 8;
end;
$$;
revoke execute on function private.community_menu_publish_window(timestamptz) from public, anon, authenticated;

-- Texto en minúsculas, sin tildes ni eñes y con espacios simples: para comparar nombres de platos e ingredientes.
create or replace function private.community_menu_text_key(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(lower(translate(coalesce(p, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')), '\s+', ' ', 'g'))
$$;
revoke execute on function private.community_menu_text_key(text) from public, anon, authenticated;

-- Aviso de calidad (para private.community_menu_quality).
create or replace function private.community_menu_warn(p_code text, p_message text, p_day text default null, p_meal text default null, p_recipe text default null)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('code', p_code, 'severity', 'warning', 'message', p_message, 'day', p_day, 'meal', p_meal, 'recipe', p_recipe)))
$$;
revoke execute on function private.community_menu_warn(text, text, text, text, text) from public, anon, authenticated;

-- Valida UNA receta del menú (mismos límites que el puente a la Cocina). Devuelve null si es válida o el motivo en español.
create or replace function private.community_validate_menu_recipe(r jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  ing jsonb;
  st jsonb;
  tg jsonb;
  v_names text[] := '{}';
  v_n text;
  v_t text;
begin
  if jsonb_typeof(r) is distinct from 'object' then
    return 'una receta no tiene el formato esperado';
  end if;
  if jsonb_typeof(r -> 'title') is distinct from 'string' or char_length(btrim(r ->> 'title')) not between 1 and 120 then
    return 'una receta necesita título (de 1 a 120 letras)';
  end if;
  v_t := 'receta «' || left(r ->> 'title', 60) || '»: ';
  if jsonb_typeof(r -> 'servings') is distinct from 'number' or (r ->> 'servings')::numeric <> trunc((r ->> 'servings')::numeric) or (r ->> 'servings')::numeric not between 1 and 50 then
    return v_t || 'las raciones deben ser un número entero de 1 a 50';
  end if;
  if jsonb_typeof(r -> 'ingredients') is distinct from 'array' or jsonb_array_length(r -> 'ingredients') not between 1 and 60 then
    return v_t || 'debe tener de 1 a 60 ingredientes';
  end if;
  for ing in select * from jsonb_array_elements(r -> 'ingredients') loop
    if jsonb_typeof(ing) is distinct from 'object' then
      return v_t || 'un ingrediente no tiene el formato esperado';
    end if;
    if jsonb_typeof(ing -> 'name') is distinct from 'string' or char_length(btrim(ing ->> 'name')) not between 1 and 120 then
      return v_t || 'cada ingrediente necesita nombre (hasta 120 letras)';
    end if;
    if coalesce(jsonb_typeof(ing -> 'quantity'), 'x') not in ('string', 'number') or char_length(ing ->> 'quantity') > 30 then
      return v_t || 'la cantidad de «' || left(ing ->> 'name', 40) || '» no es válida (hasta 30 caracteres)';
    end if;
    if jsonb_typeof(ing -> 'unit') is distinct from 'string' or char_length(ing ->> 'unit') > 30 then
      return v_t || 'la unidad de «' || left(ing ->> 'name', 40) || '» no es válida (hasta 30 caracteres)';
    end if;
    v_n := private.community_menu_text_key(ing ->> 'name');
    if v_n = any (v_names) then
      return v_t || 'el ingrediente «' || left(ing ->> 'name', 40) || '» está repetido';
    end if;
    v_names := v_names || v_n;
  end loop;
  if jsonb_typeof(r -> 'steps') is distinct from 'array' or jsonb_array_length(r -> 'steps') not between 1 and 30 then
    return v_t || 'debe tener de 1 a 30 pasos';
  end if;
  for st in select * from jsonb_array_elements(r -> 'steps') loop
    if jsonb_typeof(st) is distinct from 'string' or btrim(st #>> '{}') = '' or char_length(st #>> '{}') > 1000 then
      return v_t || 'cada paso debe tener texto (hasta 1000 caracteres)';
    end if;
  end loop;
  if r ->> 'tags' is not null then
    if jsonb_typeof(r -> 'tags') is distinct from 'array' or jsonb_array_length(r -> 'tags') > 12 then
      return v_t || 'como máximo 12 etiquetas';
    end if;
    for tg in select * from jsonb_array_elements(r -> 'tags') loop
      if jsonb_typeof(tg) is distinct from 'string' or char_length(btrim(tg #>> '{}')) not between 1 and 40 then
        return v_t || 'cada etiqueta debe tener de 1 a 40 caracteres';
      end if;
    end loop;
  end if;
  return null;
end;
$$;
revoke execute on function private.community_validate_menu_recipe(jsonb) from public, anon, authenticated;

-- Valida el menú completo (private.community_validate_menu_recipe para cada receta). Devuelve null si es válido o el motivo en español.
-- Reglas: formato versión 1; 7 días de lunes a domingo, cada uno con comida y cena; cada plato con título y de 1 a 6 recetas; ningún plato (por su título) más de
-- 2 veces en la semana; la comida y la cena de un mismo día no pueden ser el mismo plato principal (mismo título de plato o de su primera receta).
create or replace function private.community_validate_menu(p jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_days constant text[] := array['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  v_meals constant text[] := array['comida', 'cena'];
  d jsonb;
  meal jsonb;
  rec jsonb;
  i integer;
  m text;
  v_err text;
  v_titles text[] := '{}';
  v_t text;
  v_dish text[];
  v_first text[];
begin
  if jsonb_typeof(p) is distinct from 'object' then
    return 'El menú no tiene el formato esperado.';
  end if;
  if octet_length(p::text) > 200000 then
    return 'El menú es demasiado grande.';
  end if;
  if jsonb_typeof(p -> 'version') is distinct from 'number' or (p ->> 'version')::numeric <> 1 then
    return 'La versión del formato del menú debe ser 1.';
  end if;
  if jsonb_typeof(p -> 'servings') is distinct from 'number' or (p ->> 'servings')::numeric <> trunc((p ->> 'servings')::numeric) or (p ->> 'servings')::numeric not between 1 and 50 then
    return 'Las raciones del menú deben ser un número entero de 1 a 50.';
  end if;
  if jsonb_typeof(p -> 'days') is distinct from 'array' or jsonb_array_length(p -> 'days') <> 7 then
    return 'El menú debe tener exactamente 7 días (de lunes a domingo).';
  end if;
  for i in 0..6 loop
    d := p -> 'days' -> i;
    if jsonb_typeof(d) is distinct from 'object' or private.community_menu_text_key(d ->> 'day') <> private.community_menu_text_key(v_days[i + 1]) then
      return 'El día ' || (i + 1) || ' del menú debe ser «' || v_days[i + 1] || '».';
    end if;
    if jsonb_typeof(d -> 'meals') is distinct from 'object' then
      return v_days[i + 1] || ': faltan la comida y la cena.';
    end if;
    v_dish := '{}';
    v_first := '{}';
    foreach m in array v_meals loop
      meal := d -> 'meals' -> m;
      if jsonb_typeof(meal) is distinct from 'object' then
        return v_days[i + 1] || ': falta la ' || m || '.';
      end if;
      if jsonb_typeof(meal -> 'title') is distinct from 'string' or char_length(btrim(meal ->> 'title')) not between 1 and 120 then
        return v_days[i + 1] || ' (' || m || '): el plato necesita título (de 1 a 120 letras).';
      end if;
      if meal ->> 'side' is not null and (jsonb_typeof(meal -> 'side') is distinct from 'string' or char_length(meal ->> 'side') > 120) then
        return v_days[i + 1] || ' (' || m || '): el acompañamiento debe ser un texto de hasta 120 letras.';
      end if;
      if jsonb_typeof(meal -> 'recipes') is distinct from 'array' or jsonb_array_length(meal -> 'recipes') not between 1 and 6 then
        return v_days[i + 1] || ' (' || m || '): el plato debe tener de 1 a 6 recetas.';
      end if;
      for rec in select * from jsonb_array_elements(meal -> 'recipes') loop
        v_err := private.community_validate_menu_recipe(rec);
        if v_err is not null then
          return v_days[i + 1] || ' (' || m || '), ' || v_err || '.';
        end if;
      end loop;
      v_titles := v_titles || private.community_menu_text_key(meal ->> 'title');
      v_dish := v_dish || private.community_menu_text_key(meal ->> 'title');
      v_first := v_first || private.community_menu_text_key(meal -> 'recipes' -> 0 ->> 'title');
    end loop;
    if v_dish[1] = v_dish[2] or v_first[1] = v_first[2] then
      return v_days[i + 1] || ': la comida y la cena no pueden ser el mismo plato principal.';
    end if;
  end loop;
  select t into v_t from unnest(v_titles) as t group by t having count(*) > 2 order by t limit 1;
  if v_t is not null then
    return 'El plato «' || v_t || '» aparece más de 2 veces en la semana.';
  end if;
  return null;
end;
$$;
revoke execute on function private.community_validate_menu(jsonb) from public, anon, authenticated;

-- Valida el CONTENIDO COMPLETO de un elemento oficial de tipo menú (payload): el menú, la programación opcional (solo 'saturday') y, si es semanal, la fuente
-- editorial (payload.source: quién o qué banco lo ha preparado; nunca se publica un menú semanal sin ella). Null si es válido o el motivo.
create or replace function private.community_validate_menu_item(p_payload jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if jsonb_typeof(p_payload) is distinct from 'object' then
    return 'Falta el contenido del menú.';
  end if;
  if p_payload ->> 'schedule' is not null and p_payload ->> 'schedule' <> 'saturday' then
    return 'La programación de un menú solo puede ser «saturday».';
  end if;
  if p_payload ->> 'schedule' = 'saturday' and (jsonb_typeof(p_payload -> 'source') is distinct from 'string' or char_length(btrim(p_payload ->> 'source')) not between 3 and 200) then
    return 'Un menú semanal necesita su fuente editorial (payload.source, de 3 a 200 caracteres).';
  end if;
  return private.community_validate_menu(p_payload -> 'menu');
end;
$$;
revoke execute on function private.community_validate_menu_item(jsonb) from public, anon, authenticated;

-- CALIDAD del menú, para que la administración lo revise ANTES de aprobar. Devuelve una lista (jsonb array) de avisos {code, severity, message, day?, meal?, recipe?}.
-- severity «error»: el menú NO es válido (un único aviso con el motivo de private.community_validate_menu; no se puede aprobar). severity «warning»: aviso NO
-- bloqueante (decide la persona). Avisos: SAME_MAIN_INGREDIENT (comida y cena del día con el mismo primer ingrediente en su receta principal), INGREDIENT_NOT_IN_STEPS
-- (ingrediente que no se menciona en ningún paso), QUANTITY_EMPTY / QUANTITY_NOT_NUMERIC / QUANTITY_ABSURD (cantidades vacías, no numéricas o desmesuradas),
-- TIME_TOO_LONG / TIME_TOO_SHORT (tiempos de más de 6 horas o menos de 1 minuto escritos en los pasos), SERVINGS_MISMATCH (raciones de una receta distintas de las del
-- menú). «Plato repetido más de 2 veces» y «comida y cena iguales» NO son avisos: son errores de validación.
-- LÍMITES (heurística, no una revisión humana): solo reconoce texto en español; compara palabras sueltas sin tildes (un ingrediente se da por mencionado si cualquiera de
-- sus palabras de 3 o más letras, en singular, aparece en los pasos: «sal» también casa con «salteado»); los tiempos se leen solo si van en cifras («15 minutos», «2 h»; no
-- «un cuarto de hora»); NO comprueba seguridad alimentaria, alérgenos, valores nutricionales, coherencia entre cantidades y raciones, ni que la receta sea cocinable.
create or replace function private.community_menu_quality(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_err text := private.community_validate_menu(p);
  v_out jsonb := '[]'::jsonb;
  v_stop constant text[] := array['del', 'las', 'los', 'con', 'sin', 'para', 'por', 'una', 'uno', 'unos', 'unas', 'que'];
  v_vocab constant text[] := array['al gusto', 'un poco', 'poco', 'pizca', 'una pizca', 'unas gotas', 'chorrito', 'un chorrito', 'c/s', 'cs', 'medio', 'media', 'un', 'una', 'uno'];
  d jsonb;
  meal jsonb;
  rec jsonb;
  ing jsonb;
  st jsonb;
  i integer;
  m text;
  v_day text;
  v_title text;
  v_steps text;
  v_name text;
  v_tok text;
  v_found boolean;
  v_q text;
  v_u text;
  v_num numeric;
  v_lim numeric;
  v_mins numeric;
  v_first text[];
  x record;
begin
  if v_err is not null then
    return jsonb_build_array(jsonb_build_object('code', 'INVALID', 'severity', 'error', 'message', v_err));
  end if;
  for i in 0..6 loop
    d := p -> 'days' -> i;
    v_day := d ->> 'day';
    v_first := '{}';
    foreach m in array array['comida', 'cena'] loop
      meal := d -> 'meals' -> m;
      v_first := v_first || private.community_menu_text_key(meal -> 'recipes' -> 0 -> 'ingredients' -> 0 ->> 'name');
      for rec in select * from jsonb_array_elements(meal -> 'recipes') loop
        v_title := rec ->> 'title';
        if (rec ->> 'servings')::numeric <> (p ->> 'servings')::numeric then
          v_out := v_out || private.community_menu_warn('SERVINGS_MISMATCH', 'La receta tiene ' || (rec ->> 'servings') || ' raciones y el menú ' || (p ->> 'servings') || '.', v_day, m, v_title);
        end if;
        select private.community_menu_text_key(string_agg(s #>> '{}', ' ')) into v_steps from jsonb_array_elements(rec -> 'steps') as s;
        for ing in select * from jsonb_array_elements(rec -> 'ingredients') loop
          -- Ingrediente que no aparece en ningún paso.
          v_name := private.community_menu_text_key(ing ->> 'name');
          v_found := false;
          for v_tok in select w from regexp_split_to_table(v_name, '[^a-z0-9]+') as w where char_length(w) >= 3 and w <> all (v_stop) loop
            if position((case when char_length(v_tok) > 3 and v_tok like '%s' then left(v_tok, -1) else v_tok end) in v_steps) > 0 then
              v_found := true;
              exit;
            end if;
          end loop;
          if not v_found and exists (select 1 from regexp_split_to_table(v_name, '[^a-z0-9]+') as w where char_length(w) >= 3 and w <> all (v_stop)) then
            v_out := v_out || private.community_menu_warn('INGREDIENT_NOT_IN_STEPS', 'El ingrediente «' || (ing ->> 'name') || '» no se menciona en ningún paso.', v_day, m, v_title);
          end if;
          -- Cantidades.
          v_q := private.community_menu_text_key(ing ->> 'quantity');
          v_u := private.community_menu_text_key(ing ->> 'unit');
          if v_q = '' then
            if v_u not in ('al gusto', 'pizca', 'una pizca', 'poco', 'un poco') then
              v_out := v_out || private.community_menu_warn('QUANTITY_EMPTY', 'El ingrediente «' || (ing ->> 'name') || '» no tiene cantidad.', v_day, m, v_title);
            end if;
          elsif v_q ~ '^[0-9]+([.,][0-9]+)?$' then
            v_num := replace(v_q, ',', '.')::numeric;
            v_lim := case when v_u in ('g', 'gr', 'gramo', 'gramos', 'ml', 'mililitro', 'mililitros') then 5000
                          when v_u in ('kg', 'kilo', 'kilos', 'l', 'litro', 'litros') then 10 else 60 end;
            if v_num = 0 or v_num > v_lim then
              v_out := v_out || private.community_menu_warn('QUANTITY_ABSURD', 'La cantidad de «' || (ing ->> 'name') || '» (' || (ing ->> 'quantity') || ' ' || (ing ->> 'unit') || ') parece desmesurada.', v_day, m, v_title);
            end if;
          elsif v_q ~ '^([0-9]+ )?[0-9]+/[0-9]+$' or v_q ~ '^[0-9]+([.,][0-9]+)? ?(-|a) ?[0-9]+([.,][0-9]+)?$' or v_q = any (v_vocab) then
            null;
          else
            v_out := v_out || private.community_menu_warn('QUANTITY_NOT_NUMERIC', 'La cantidad de «' || (ing ->> 'name') || '» («' || left(ing ->> 'quantity', 30) || '») no es un número.', v_day, m, v_title);
          end if;
        end loop;
        -- Tiempos escritos en los pasos.
        for st in select * from jsonb_array_elements(rec -> 'steps') loop
          for x in select g[1] as n, g[2] as u from regexp_matches(lower(st #>> '{}'), '(\d+(?:[.,]\d+)?)\s*(horas?|hrs?|h|minutos?|mins?|min)\y', 'g') as g loop
            v_mins := replace(x.n, ',', '.')::numeric * case when x.u like 'h%' then 60 else 1 end;
            if v_mins > 360 then
              v_out := v_out || private.community_menu_warn('TIME_TOO_LONG', 'Un paso indica ' || x.n || ' ' || x.u || ' (más de 6 horas).', v_day, m, v_title);
            elsif v_mins < 1 then
              v_out := v_out || private.community_menu_warn('TIME_TOO_SHORT', 'Un paso indica ' || x.n || ' ' || x.u || ' (menos de 1 minuto).', v_day, m, v_title);
            end if;
          end loop;
        end loop;
      end loop;
    end loop;
    if v_first[1] <> '' and v_first[1] = v_first[2] then
      v_out := v_out || private.community_menu_warn('SAME_MAIN_INGREDIENT', 'La comida y la cena empiezan con el mismo ingrediente principal («' || v_first[1] || '»).', v_day);
    end if;
  end loop;
  return v_out;
end;
$$;
revoke execute on function private.community_menu_quality(jsonb) from public, anon, authenticated;

-- Publica un elemento oficial aprobado como publicación (identidad oficial correspondiente). Los artículos exigen fuentes; los menús se vuelven a validar y, si son
-- semanales, llevan week_start y week_end (lunes y domingo de la semana siguiente al sábado de publicación). Idempotente: un elemento ya publicado devuelve null.
create or replace function private.community_publish_item(p_item uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.community_official_items%rowtype;
  v_author uuid;
  v_label text;
  v_kind text;
  v_post uuid := gen_random_uuid();
  v_menu jsonb;
  v_err text;
begin
  select * into i from public.community_official_items x where x.id = p_item for update;
  if not found or i.status <> 'approved' or i.published_post_id is not null then
    return null;
  end if;
  if i.kind = 'menu' then
    v_err := private.community_validate_menu_item(i.payload);
    if v_err is not null then
      raise exception 'MENU_INVALID' using errcode = 'P0001', detail = v_err;
    end if;
    v_menu := i.payload -> 'menu';
    if i.payload ->> 'schedule' = 'saturday' then
      if i.menu_week_start is null then
        raise exception 'MENU_INVALID' using errcode = 'P0001', detail = 'El menú semanal no tiene semana asignada.';
      end if;
      v_menu := v_menu || jsonb_build_object('week_start', to_char(i.menu_week_start, 'YYYY-MM-DD'), 'week_end', to_char(i.menu_week_start + 6, 'YYYY-MM-DD'));
    end if;
  end if;
  v_author := case when i.kind in ('tip', 'menu') then '00000000-0000-4000-8000-0000000000a2'::uuid else '00000000-0000-4000-8000-0000000000a1'::uuid end;
  v_label := case i.kind when 'tip' then 'Consejo de Pepa' when 'menu' then 'Menú semanal de Pepa' when 'poll' then 'Encuesta de Equipo PEPA' else 'Artículo de Equipo PEPA' end;
  v_kind := case i.kind when 'tip' then 'consejo' when 'menu' then 'menu' when 'poll' then 'encuesta' else 'articulo' end;
  insert into public.community_posts (id, author_id, kind, section, topic_id, title, body, is_official, official_label, official_item_id, article_sources, menu)
  values (v_post, v_author, v_kind, i.section, i.topic_id, i.title, i.body, true, v_label, i.id, case when i.kind = 'article' then i.payload end, v_menu);
  update public.community_official_items set status = 'published', published_post_id = v_post, publish_error = null where id = i.id;
  if i.kind = 'poll' then
    update public.community_polls set post_id = v_post, status = case when now() >= opens_at then 'open' else status end where item_id = i.id;
  end if;
  return v_post;
end;
$$;
revoke execute on function private.community_publish_item(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Lote semanal (lo crea la función de servidor con IA; solo service_role).
-- ---------------------------------------------------------------------------------------------
create or replace function public.community_service_create_proposals(p_week date, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  it jsonb;
  v_n integer := 0;
  v_id uuid;
  v_kind text;
  v_payload jsonb;
  v_err text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return 0;
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    v_kind := it ->> 'kind';
    v_payload := coalesce(it -> 'payload', '{}'::jsonb);
    continue when v_kind is null or v_kind not in ('tip', 'poll', 'article', 'menu');
    -- Un artículo sin fuentes externas NO se propone nunca.
    continue when v_kind = 'article' and coalesce(jsonb_array_length(v_payload -> 'sources'), 0) = 0;
    continue when v_kind = 'poll' and (jsonb_typeof(v_payload -> 'options') <> 'array' or jsonb_array_length(v_payload -> 'options') not between 2 and 6);
    -- Un menú inválido (formato, 7 días, recetas, repeticiones, programación o fuente editorial) se RECHAZA con MENU_INVALID: no se guarda ni como borrador.
    if v_kind = 'menu' then
      v_err := private.community_validate_menu_item(v_payload);
      if v_err is not null then
        raise exception 'MENU_INVALID' using errcode = 'P0001', detail = v_err;
      end if;
    end if;
    begin
      insert into public.community_official_items (kind, section, topic_id, title, body, payload, batch_week)
      values (v_kind, it ->> 'section', it ->> 'topic_id', left(btrim(it ->> 'title'), 140), left(coalesce(it ->> 'body', ''), 10000), v_payload, p_week)
      returning id into v_id;
      insert into public.community_official_item_versions (item_id, version, snapshot) values (v_id, 1, it);
      v_n := v_n + 1;
    exception when others then
      raise warning 'community_service_create_proposals: %', sqlerrm;
    end;
  end loop;
  if v_n > 0 then
    perform private.community_notify_admins('Propuestas semanales de Pepa', 'Hay ' || v_n || ' propuestas pendientes de revisar.', '/comunidad/admin', 'proposals:' || p_week);
  end if;
  return v_n;
end;
$$;
revoke all on function public.community_service_create_proposals(date, jsonb) from public, anon, authenticated;
grant execute on function public.community_service_create_proposals(date, jsonb) to service_role;

create or replace function public.community_admin_list_proposals(p_status text default 'proposed')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.community_require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', i.id, 'kind', i.kind, 'section', i.section, 'topic_id', i.topic_id, 'title', i.title, 'body', i.body, 'payload', i.payload,
      'batch_week', i.batch_week, 'status', i.status, 'version', i.version, 'proposed_at', i.proposed_at, 'approved_version', i.approved_version,
      'approved_at', i.approved_at, 'approved_by_name', (select pr.display_name from public.profiles pr where pr.id = i.approved_by),
      'review_note', i.review_note, 'publish_at', i.publish_at, 'published_post_id', i.published_post_id,
      -- Menús: semana, estado de la publicación programada, aviso de texto sin revisar y revisión de calidad (null en el resto de tipos).
      'menu_week_start', i.menu_week_start, 'publish_attempts', i.publish_attempts, 'publish_error', i.publish_error, 'menu_text_stale', i.menu_text_stale,
      'menu_check', case when i.kind = 'menu' then private.community_menu_quality(i.payload -> 'menu') end) order by i.batch_week desc, i.proposed_at)
    from public.community_official_items i where i.status = p_status
  ), '[]'::jsonb);
end;
$$;

create or replace function public.community_admin_edit_proposal(p_id uuid, p_title text, p_body text, p_payload jsonb default null, p_topic text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.community_official_items%rowtype;
  v_version integer;
  v_err text;
  v_title text := left(btrim(p_title), 140);
  v_body text := left(coalesce(p_body, ''), 10000);
begin
  perform private.community_require_admin();
  select * into i from public.community_official_items x where x.id = p_id and x.status in ('proposed', 'approved') for update;
  if not found or i.published_post_id is not null then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  if i.kind = 'menu' then
    -- El contenido del menú (existente o el nuevo) debe ser válido. Si se cambia el TEXTO sin mandar los datos del menú, el servidor conserva los datos y deja
    -- anotado (menu_text_stale) que texto y datos pueden no coincidir: la aprobación lo exigirá confirmar. Mandar los datos (válidos) lo da por revisado.
    v_err := private.community_validate_menu_item(coalesce(p_payload, i.payload));
    if v_err is not null then
      raise exception 'MENU_INVALID' using errcode = 'P0001', detail = v_err;
    end if;
  end if;
  update public.community_official_items
  set title = v_title, body = v_body, payload = coalesce(p_payload, payload),
      topic_id = coalesce(p_topic, topic_id), version = version + 1,
      -- Editar tras aprobar obliga a aprobar de nuevo la versión nueva.
      status = 'proposed', approved_by = null, approved_at = null, approved_version = null, publish_at = null,
      menu_week_start = null, publish_attempts = 0, publish_error = null, last_publish_attempt_at = null,
      menu_text_stale = case when kind <> 'menu' then false when p_payload is not null then false else menu_text_stale or v_title is distinct from i.title or v_body is distinct from i.body end
  where id = p_id returning version into v_version;
  insert into public.community_official_item_versions (item_id, version, snapshot, edited_by)
  select i2.id, i2.version, jsonb_build_object('kind', i2.kind, 'section', i2.section, 'topic_id', i2.topic_id, 'title', i2.title, 'body', i2.body, 'payload', i2.payload), (select auth.uid())
  from public.community_official_items i2 where i2.id = p_id;
  delete from public.community_polls where item_id = p_id and status = 'scheduled';
  perform private.community_log('proposal_edit', 'official_item', p_id, null, jsonb_build_object('version', v_version));
  return v_version;
end;
$$;

-- Aprobar: basta UNA aprobación de cualquiera de los dos administradores. Publica al momento (consejos y artículos) o programa la encuesta.
-- Menús: se vuelven a VALIDAR al aprobar (MENU_INVALID, con el motivo en `detail`); si el texto se editó sin revisar los datos (menu_text_stale) hay que confirmarlo
-- con p_confirm_text = true (MENU_TEXT_STALE); un menú SEMANAL (payload.schedule = 'saturday') no se publica: queda programado para el próximo sábado a las 10:00
-- (Europe/Madrid) con su semana asignada (una sola por semana: MENU_WEEK_TAKEN). Un menú sin programación (p. ej. la publicación inicial 05) se publica al aprobar.
create or replace function public.community_admin_approve_proposal(p_id uuid, p_confirm_text boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.community_official_items%rowtype;
  v_win record;
  v_post uuid;
  v_err text;
begin
  perform private.community_require_admin();
  select * into i from public.community_official_items x where x.id = p_id and x.status = 'proposed' for update;
  if not found then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  if i.kind = 'article' and coalesce(jsonb_array_length(i.payload -> 'sources'), 0) = 0 then
    raise exception 'NO_SOURCES' using errcode = 'P0001';
  end if;
  if i.kind = 'menu' then
    v_err := private.community_validate_menu_item(i.payload);
    if v_err is not null then
      raise exception 'MENU_INVALID' using errcode = 'P0001', detail = v_err;
    end if;
    if i.menu_text_stale and not coalesce(p_confirm_text, false) then
      raise exception 'MENU_TEXT_STALE' using errcode = 'P0001';
    end if;
    if i.payload ->> 'schedule' = 'saturday' then
      select * into v_win from private.community_menu_publish_window(now());
      begin
        update public.community_official_items
        set status = 'approved', approved_by = (select auth.uid()), approved_at = now(), approved_version = version, publish_at = v_win.publish_at,
            menu_week_start = v_win.week_start, publish_attempts = 0, publish_error = null, last_publish_attempt_at = null, menu_text_stale = false
        where id = p_id;
      exception when unique_violation then
        raise exception 'MENU_WEEK_TAKEN' using errcode = 'P0001';
      end;
      perform private.community_log('proposal_approved', 'official_item', p_id, null,
        jsonb_build_object('version', i.version, 'kind', i.kind, 'publish_at', v_win.publish_at, 'week_start', v_win.week_start, 'text_confirmed', i.menu_text_stale));
      return jsonb_build_object('scheduled', true, 'publish_at', v_win.publish_at, 'week_start', v_win.week_start, 'week_end', v_win.week_end, 'post_id', null);
    end if;
  end if;
  update public.community_official_items
  set status = 'approved', approved_by = (select auth.uid()), approved_at = now(), approved_version = version, menu_text_stale = false
  where id = p_id;
  perform private.community_log('proposal_approved', 'official_item', p_id, null, jsonb_build_object('version', i.version, 'kind', i.kind));
  if i.kind = 'poll' then
    select * into v_win from private.community_poll_window(now());
    insert into public.community_polls (item_id, question, options, opens_at, closes_at)
    values (p_id, i.title, i.payload -> 'options', v_win.opens_at, v_win.closes_at)
    on conflict (item_id) do update set question = excluded.question, options = excluded.options, opens_at = excluded.opens_at, closes_at = excluded.closes_at;
    update public.community_official_items set publish_at = v_win.opens_at where id = p_id;
    -- Nunca se publica al aprobar: lo hace el trabajo programado (community_run_polls) a la hora de apertura.
    return jsonb_build_object('scheduled', true, 'opens_at', v_win.opens_at, 'closes_at', v_win.closes_at, 'post_id', v_post);
  end if;
  v_post := private.community_publish_item(p_id);
  return jsonb_build_object('scheduled', false, 'post_id', v_post);
end;
$$;

create or replace function public.community_admin_reject_proposal(p_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.community_require_admin();
  update public.community_official_items set status = 'rejected', rejected_by = (select auth.uid()), rejected_at = now(), review_note = left(p_note, 500)
  where id = p_id and status in ('proposed', 'approved') and published_post_id is null;
  if not found then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  delete from public.community_polls where item_id = p_id and status = 'scheduled';
  perform private.community_log('proposal_rejected', 'official_item', p_id, p_note);
end;
$$;

-- Trabajo programado (cada 5 min): publica las encuestas aprobadas cuya hora ha llegado y cierra las que han vencido.
create or replace function private.community_run_polls()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_n integer := 0;
begin
  for r in select p.item_id from public.community_polls p join public.community_official_items i on i.id = p.item_id
           where p.status = 'scheduled' and p.opens_at <= now() and i.status = 'approved' loop
    perform private.community_publish_item(r.item_id);
    v_n := v_n + 1;
  end loop;
  update public.community_polls set status = 'open' where status = 'scheduled' and opens_at <= now() and post_id is not null;
  update public.community_polls set status = 'closed' where status = 'open' and closes_at <= now();
  return v_n;
end;
$$;
revoke execute on function private.community_run_polls() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Menú semanal: trabajo programado, avisos a la administración y herramientas de intervención.
-- ---------------------------------------------------------------------------------------------
-- Avisa (una vez por semana y tipo de aviso) cuando FALTA un menú aprobado para la semana siguiente: el jueves desde las 10:00 («cerca») y el sábado desde las 10:00
-- («falta»; ese día NO se publica nada). Un menú aprobado a esa hora o más tarde no sale ese sábado sino el siguiente (la aprobación nunca publica al instante).
create or replace function private.community_menu_check_missing(p_now timestamptz default now())
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_local timestamp := p_now at time zone 'Europe/Madrid';
  v_sat date := v_local::date + (6 - extract(isodow from v_local)::integer);
  v_sat_at timestamptz := (v_sat + time '10:00') at time zone 'Europe/Madrid';
  v_thu_at timestamptz := ((v_sat - 2) + time '10:00') at time zone 'Europe/Madrid';
  v_week date := v_sat + 2;
  v_missing boolean;
begin
  -- Solo desde el jueves a las 10:00 (el domingo sigue contando el sábado anterior; el lunes arranca la cuenta de la semana siguiente).
  if p_now < v_thu_at then
    return;
  end if;
  select not exists (
    select 1 from public.community_official_items i where i.kind = 'menu' and i.menu_week_start = v_week and i.status in ('approved', 'published')
  ) into v_missing;
  if not v_missing then
    return;
  end if;
  if p_now >= v_sat_at then
    perform private.community_notify_admins('Falta el menú semanal',
      'No hay ningún menú aprobado para la semana del ' || to_char(v_week, 'DD/MM/YYYY') || ': hoy no se ha publicado ninguno. Aprueba uno en el Centro de Mando (saldrá el próximo sábado a las 10:00).',
      '/comunidad/admin', 'menu-missing:' || v_week);
  else
    perform private.community_notify_admins('Falta el menú del sábado',
      'Todavía no hay ningún menú aprobado para publicar el sábado a las 10:00 (semana del ' || to_char(v_week, 'DD/MM/YYYY') || '). Apruébalo antes de esa hora.',
      '/comunidad/admin', 'menu-soon:' || v_week);
  end if;
end;
$$;
revoke execute on function private.community_menu_check_missing(timestamptz) from public, anon, authenticated;

-- Trabajo programado (lo llama community_run_official cada 5 minutos). INERTE si weekly_menu_autopublish no vale 1.
--  · Publica los menús semanales APROBADOS cuya hora ha llegado (una sola publicación por semana: índices únicos; idempotente: un menú ya publicado se ignora;
--    `for update skip locked` evita que dos ejecuciones simultáneas trabajen sobre el mismo menú).
--  · Si falla, anota el error (código y mensaje de la excepción, sin datos privados), cuenta el intento y reintenta cada ≥ 4 minutos hasta 3 intentos; al tercero avisa
--    a la administración y lo deja en estado de error visible (status approved + publish_error + publish_attempts ≥ 3) hasta que alguien reintente, reprograme o rechace.
--  · Un menú aprobado cuya semana ya terminó NO se publica (SEMANA_PASADA): se deja en error y se avisa.
--  · Si falta un menú aprobado para el sábado, no publica nada y avisa a los administradores (una vez por semana).
-- p_now solo existe para poder probar con una hora concreta; el trabajo programado la llama sin parámetros.
create or replace function private.community_run_menus(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_id uuid;
  v_n integer := 0;
  v_today date := (p_now at time zone 'Europe/Madrid')::date;
  v_attempts integer;
  v_title text;
  v_msg text;
  v_detail text;
begin
  if private.community_setting_int('weekly_menu_autopublish', 0) <> 1 then
    return 0;
  end if;
  -- Semanas ya terminadas: nunca se publican (un menú de otra semana desinformaría).
  for v_id, v_title in
    update public.community_official_items i
    set publish_error = 'SEMANA_PASADA: la semana del menú ya ha terminado; reprograma o rechaza el menú.', publish_attempts = greatest(publish_attempts, 3), last_publish_attempt_at = now()
    where i.kind = 'menu' and i.status = 'approved' and i.published_post_id is null and i.menu_week_start is not null and i.menu_week_start + 6 < v_today
      and (i.publish_error is null or i.publish_error not like 'SEMANA_PASADA%')
    returning i.id, i.title
  loop
    perform private.community_log('menu_publish_failed', 'official_item', v_id, 'SEMANA_PASADA');
    perform private.community_notify_admins('Menú semanal caducado', 'El menú «' || v_title || '» no se publicó a tiempo y su semana ya terminó. Reprográmalo o recházalo.', '/comunidad/admin', 'menu-error:' || v_id);
  end loop;
  -- Candidatos: aprobados, con su hora cumplida, con intentos pendientes y sin intento reciente. skip locked: otra ejecución simultánea no los toca.
  with c as (
    select i.id from public.community_official_items i
    where i.kind = 'menu' and i.status = 'approved' and i.published_post_id is null and i.publish_at is not null and i.publish_at <= p_now
      and i.publish_attempts < 3 and (i.last_publish_attempt_at is null or i.last_publish_attempt_at <= p_now - interval '4 minutes')
    order by i.publish_at, i.id
    limit 3
    for update skip locked
  )
  select array_agg(c.id) into v_ids from c;
  foreach v_id in array coalesce(v_ids, '{}'::uuid[]) loop
    begin
      if private.community_publish_item(v_id) is not null then
        v_n := v_n + 1;
        perform private.community_log('menu_published', 'official_item', v_id, 'automática');
      end if;
    exception when others then
      get stacked diagnostics v_detail = pg_exception_detail;
      -- Solo el detalle de NUESTROS errores (MENU_INVALID…); el de errores de la base de datos puede llevar valores de filas.
      v_msg := left(sqlstate || ': ' || sqlerrm || case when sqlstate = 'P0001' and v_detail is not null then ' — ' || v_detail else '' end, 300);
      update public.community_official_items set publish_attempts = publish_attempts + 1, publish_error = v_msg, last_publish_attempt_at = p_now
      where id = v_id returning publish_attempts, title into v_attempts, v_title;
      perform private.community_log('menu_publish_failed', 'official_item', v_id, v_msg, jsonb_build_object('attempt', v_attempts));
      if v_attempts >= 3 then
        perform private.community_notify_admins('Menú semanal con error', 'El menú «' || v_title || '» no se ha podido publicar tras 3 intentos. Revísalo en el Centro de Mando.', '/comunidad/admin', 'menu-error:' || v_id);
      end if;
    end;
  end loop;
  perform private.community_menu_check_missing(p_now);
  return v_n;
end;
$$;
revoke execute on function private.community_run_menus(timestamptz) from public, anon, authenticated;

-- Punto de entrada ÚNICO del trabajo programado de contenido oficial (encuestas y menús). Cada parte va aislada: si una falla, la otra sigue.
create or replace function private.community_run_official()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_polls integer := 0;
  v_menus integer := 0;
begin
  begin
    v_polls := private.community_run_polls();
  exception when others then
    raise warning 'community_run_official (encuestas): %', sqlerrm;
  end;
  begin
    v_menus := private.community_run_menus();
  exception when others then
    raise warning 'community_run_official (menús): %', sqlerrm;
  end;
  return jsonb_build_object('polls', v_polls, 'menus', v_menus);
end;
$$;
revoke execute on function private.community_run_official() from public, anon, authenticated;

-- Estado de un menú para el panel: borrador / programado / publicado / error / rechazado.
create or replace function private.community_menu_state(i public.community_official_items)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when i.status = 'published' then 'published'
    when i.status = 'rejected' then 'rejected'
    when i.status = 'approved' and i.publish_error is not null and i.publish_attempts >= 3 then 'error'
    when i.status = 'approved' then 'scheduled'
    else 'draft' end
$$;
revoke execute on function private.community_menu_state(public.community_official_items) from public, anon, authenticated;

-- Fila de un menú para el panel (sin los datos del menú: son grandes; se piden con community_admin_get_menu).
create or replace function private.community_menu_row(i public.community_official_items)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return jsonb_build_object(
    'id', i.id, 'title', i.title, 'status', i.status, 'state', private.community_menu_state(i), 'version', i.version, 'seed_key', i.seed_key,
    'scheduled_weekly', i.payload ->> 'schedule' = 'saturday', 'source', i.payload ->> 'source',
    'week_start', i.menu_week_start, 'week_end', i.menu_week_start + 6, 'publish_at', i.publish_at, 'published_post_id', i.published_post_id,
    'publish_attempts', i.publish_attempts, 'publish_error', i.publish_error, 'last_publish_attempt_at', i.last_publish_attempt_at,
    'text_stale', i.menu_text_stale, 'proposed_at', i.proposed_at, 'approved_at', i.approved_at,
    'approved_by_name', (select pr.display_name from public.profiles pr where pr.id = i.approved_by), 'review_note', i.review_note);
end;
$$;
revoke execute on function private.community_menu_row(public.community_official_items) from public, anon, authenticated;

-- Lista de menús para el panel (todos los estados, los más recientes primero). `autopublish` = valor actual de weekly_menu_autopublish (solo lectura).
-- `check_errors`/`check_warnings`: nº de errores y avisos de calidad de los menús pendientes o aprobados (null en publicados y rechazados).
create or replace function public.community_admin_list_menus(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.community_require_admin();
  return jsonb_build_object(
    'autopublish', private.community_setting_int('weekly_menu_autopublish', 0) = 1,
    'menus', coalesce((
      select jsonb_agg(private.community_menu_row(m)
        || case when m.status in ('proposed', 'approved') then
             jsonb_build_object('check_errors', (select count(*) from jsonb_array_elements(private.community_menu_quality(m.payload -> 'menu')) w where w ->> 'severity' = 'error'),
                                'check_warnings', (select count(*) from jsonb_array_elements(private.community_menu_quality(m.payload -> 'menu')) w where w ->> 'severity' = 'warning'))
           else '{}'::jsonb end
        order by m.menu_week_start desc nulls first, m.proposed_at desc)
      from public.community_official_items m
      where m.id in (select x.id from public.community_official_items x where x.kind = 'menu' order by x.menu_week_start desc nulls first, x.proposed_at desc
                     limit least(greatest(coalesce(p_limit, 50), 1), 200))
    ), '[]'::jsonb));
end;
$$;

-- Un menú completo para revisarlo antes de aprobar: fila + texto + datos del menú + revisión de calidad (lista de avisos de private.community_menu_quality).
create or replace function public.community_admin_get_menu(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  i public.community_official_items%rowtype;
begin
  perform private.community_require_admin();
  select * into i from public.community_official_items x where x.id = p_id and x.kind = 'menu';
  if not found then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  return private.community_menu_row(i) || jsonb_build_object(
    'body', i.body, 'section', i.section, 'topic_id', i.topic_id, 'menu', i.payload -> 'menu',
    'check', private.community_menu_quality(i.payload -> 'menu'), 'item_error', private.community_validate_menu_item(i.payload));
end;
$$;

-- Reprograma un menú aprobado a otro sábado a las 10:00 (hora de Madrid, FUTURO) o, con p_publish_at = null, cancela la programación (vuelve a «pendiente de revisar»).
-- Restablece los intentos y el error. Errores: NOT_AVAILABLE, BAD_PUBLISH_AT (no es un sábado a las 10:00 de Madrid futuro), MENU_WEEK_TAKEN (esa semana ya tiene menú).
create or replace function public.community_admin_reschedule_menu(p_id uuid, p_publish_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.community_official_items%rowtype;
  v_local timestamp;
  v_week date;
begin
  perform private.community_require_admin();
  select * into i from public.community_official_items x
  where x.id = p_id and x.kind = 'menu' and x.status = 'approved' and x.published_post_id is null and x.payload ->> 'schedule' = 'saturday' for update;
  if not found then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  if p_publish_at is null then
    update public.community_official_items
    set status = 'proposed', approved_by = null, approved_at = null, approved_version = null, publish_at = null, menu_week_start = null,
        publish_attempts = 0, publish_error = null, last_publish_attempt_at = null
    where id = p_id;
    perform private.community_log('menu_unscheduled', 'official_item', p_id, null, jsonb_build_object('previous_publish_at', i.publish_at));
    return jsonb_build_object('scheduled', false);
  end if;
  v_local := p_publish_at at time zone 'Europe/Madrid';
  if extract(isodow from v_local) <> 6 or v_local::time <> time '10:00' or p_publish_at <= now() then
    raise exception 'BAD_PUBLISH_AT' using errcode = 'P0001';
  end if;
  v_week := v_local::date + 2;
  begin
    update public.community_official_items
    set publish_at = p_publish_at, menu_week_start = v_week, publish_attempts = 0, publish_error = null, last_publish_attempt_at = null
    where id = p_id;
  exception when unique_violation then
    raise exception 'MENU_WEEK_TAKEN' using errcode = 'P0001';
  end;
  perform private.community_log('menu_rescheduled', 'official_item', p_id, null, jsonb_build_object('publish_at', p_publish_at, 'week_start', v_week, 'previous_publish_at', i.publish_at));
  return jsonb_build_object('scheduled', true, 'publish_at', p_publish_at, 'week_start', v_week, 'week_end', v_week + 6);
end;
$$;

-- Reintenta AHORA la publicación de un menú aprobado que quedó con error (acción humana de la administración: funciona aunque la publicación automática esté
-- desactivada). Devuelve {ok: true, post_id} o {ok: false, error, attempts}. Errores: NOT_AVAILABLE (no está en error), MENU_WEEK_PAST (su semana ya terminó).
create or replace function public.community_admin_retry_publish(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.community_official_items%rowtype;
  v_post uuid;
  v_msg text;
  v_detail text;
  v_attempts integer;
begin
  perform private.community_require_admin();
  select * into i from public.community_official_items x
  where x.id = p_id and x.kind = 'menu' and x.status = 'approved' and x.published_post_id is null and x.publish_error is not null for update;
  if not found then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  if i.menu_week_start is not null and i.menu_week_start + 6 < (now() at time zone 'Europe/Madrid')::date then
    raise exception 'MENU_WEEK_PAST' using errcode = 'P0001';
  end if;
  begin
    v_post := private.community_publish_item(p_id);
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    v_msg := left(sqlstate || ': ' || sqlerrm || case when sqlstate = 'P0001' and v_detail is not null then ' — ' || v_detail else '' end, 300);
    update public.community_official_items set publish_attempts = publish_attempts + 1, publish_error = v_msg, last_publish_attempt_at = now() where id = p_id returning publish_attempts into v_attempts;
    perform private.community_log('menu_retry_failed', 'official_item', p_id, v_msg, jsonb_build_object('attempt', v_attempts));
    return jsonb_build_object('ok', false, 'error', v_msg, 'attempts', v_attempts);
  end;
  perform private.community_log('menu_retry_published', 'official_item', p_id, null, jsonb_build_object('post_id', v_post));
  return jsonb_build_object('ok', v_post is not null, 'post_id', v_post);
end;
$$;

-- Votar y ver resultados (reglas de visibilidad del enunciado).
create or replace function private.community_poll_json(p public.community_polls, p_viewer uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_voted integer;
  v_closed boolean := p.status = 'closed' or now() >= p.closes_at;
  v_counts jsonb;
begin
  if p_viewer is not null then
    select v.option_index into v_voted from public.community_poll_votes v where v.poll_id = p.id and v.profile_id = p_viewer;
  end if;
  if v_closed or v_voted is not null then
    select coalesce(jsonb_agg(coalesce(c.n, 0) order by o.i), '[]'::jsonb) into v_counts
    from generate_series(0, jsonb_array_length(p.options) - 1) o(i)
    left join (select option_index, count(*)::integer as n from public.community_poll_votes where poll_id = p.id group by option_index) c on c.option_index = o.i;
  end if;
  return jsonb_build_object(
    'id', p.id, 'post_id', p.post_id, 'question', p.question, 'options', p.options, 'opens_at', p.opens_at, 'closes_at', p.closes_at,
    'status', case when v_closed then 'closed' else p.status end,
    'my_vote', v_voted,
    'results_visible', v_closed or v_voted is not null,
    'final', v_closed,
    'counts', v_counts,
    'total_votes', case when v_closed or v_voted is not null then (select count(*) from public.community_poll_votes where poll_id = p.id) end);
end;
$$;
revoke execute on function private.community_poll_json(public.community_polls, uuid) from public, anon, authenticated;

create or replace function public.community_get_poll(p_post uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.community_polls%rowtype;
begin
  perform private.community_require_reader();
  select pl.* into p from public.community_polls pl join public.community_posts po on po.id = pl.post_id where pl.post_id = p_post and po.status = 'published';
  if not found then
    return null;
  end if;
  return private.community_poll_json(p, private.community_cp());
end;
$$;

create or replace function public.community_vote_poll(p_post uuid, p_option integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cp uuid := private.community_require_participant();
  p public.community_polls%rowtype;
begin
  select pl.* into p from public.community_polls pl join public.community_posts po on po.id = pl.post_id where pl.post_id = p_post and po.status = 'published';
  if not found or now() < p.opens_at or now() >= p.closes_at or p_option is null or p_option < 0 or p_option >= jsonb_array_length(p.options) then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  begin
    insert into public.community_poll_votes (poll_id, profile_id, option_index) values (p.id, v_cp, p_option);
  exception when unique_violation then
    raise exception 'ALREADY_VOTED' using errcode = 'P0001';
  end;
  return private.community_poll_json(p, v_cp);
end;
$$;

-- Encuesta para visitantes sin sesión: SOLO si ya ha cerrado (resultados finales).
create or replace function public.community_public_get_poll(p_post uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.community_polls%rowtype;
begin
  select pl.* into p from public.community_polls pl join public.community_posts po on po.id = pl.post_id where pl.post_id = p_post and po.status = 'published';
  if not found then
    return null;
  end if;
  if not (p.status = 'closed' or now() >= p.closes_at) then
    return jsonb_build_object('id', p.id, 'post_id', p.post_id, 'question', p.question, 'options', p.options, 'opens_at', p.opens_at, 'closes_at', p.closes_at,
                              'status', 'open', 'results_visible', false, 'final', false);
  end if;
  return private.community_poll_json(p, null);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Resumen de comentarios (Pepa). El texto lo genera la función de servidor; aquí solo se guarda y se decide cuándo hace falta.
-- ---------------------------------------------------------------------------------------------
create table public.community_post_summaries (
  post_id uuid primary key references public.community_posts(id) on delete cascade,
  summary text not null,
  comment_count_at integer not null,
  generated_at timestamptz not null default now(),
  refresh_requested_at timestamptz
);
alter table public.community_post_summaries enable row level security;
revoke all on public.community_post_summaries from anon, authenticated;

create or replace function private.community_summary_state(p_post uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_threshold integer := private.community_setting_int('summary_comment_threshold', 15);
  v_every integer := private.community_setting_int('summary_refresh_every', 10);
  v_count integer;
  s public.community_post_summaries%rowtype;
begin
  select p.comment_count into v_count from public.community_posts p where p.id = p_post and p.status = 'published';
  if v_count is null then
    return null;
  end if;
  select * into s from public.community_post_summaries x where x.post_id = p_post;
  return jsonb_build_object(
    'comment_count', v_count,
    'eligible', v_count >= v_threshold,
    'threshold', v_threshold,
    'summary', s.summary,
    'generated_at', s.generated_at,
    'comments_since', case when found then v_count - s.comment_count_at end,
    'stale', v_count >= v_threshold and (not found or v_count - s.comment_count_at >= v_every or s.refresh_requested_at is not null));
end;
$$;
revoke execute on function private.community_summary_state(uuid) from public, anon, authenticated;

create or replace function public.community_get_summary(p_post uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.community_require_reader();
  return private.community_summary_state(p_post);
end;
$$;

-- La función de servidor pide los comentarios a resumir (solo si hace falta o se pide). Sin nombres: solo texto y orden.
create or replace function public.community_service_summary_input(p_post uuid, p_force boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_state jsonb := private.community_summary_state(p_post);
begin
  -- Contenido de personas menores de edad: NO se envía a la IA (las condiciones de Gemini prohíben su uso con menores de 18).
  if v_state is null or not (v_state ->> 'eligible')::boolean or exists (select 1 from public.community_posts x where x.id = p_post and x.ai_excluded) then
    return jsonb_build_object('needed', false, 'reason', 'not_eligible');
  end if;
  if not p_force and not (v_state ->> 'stale')::boolean then
    return jsonb_build_object('needed', false, 'reason', 'fresh');
  end if;
  return jsonb_build_object(
    'needed', true,
    'comment_count', (v_state ->> 'comment_count')::integer,
    'title', (select p.title from public.community_posts p where p.id = p_post),
    'body', (select left(p.body, 2000) from public.community_posts p where p.id = p_post),
    'comments', (select coalesce(jsonb_agg(jsonb_build_object('n', x.rn, 'reply_to', x.reply_n, 'text', left(x.body, 600)) order by x.rn), '[]'::jsonb)
                 from (select row_number() over (order by c.created_at) as rn,
                              (select r.rn2 from (select c2.id, row_number() over (order by c2.created_at) as rn2 from public.community_comments c2
                                                  where c2.post_id = p_post and c2.status = 'published' and not c2.ai_excluded) r where r.id = c.reply_to_id) as reply_n,
                              c.body
                       from public.community_comments c where c.post_id = p_post and c.status = 'published' and not c.ai_excluded and c.body <> '' limit 300) x));
end;
$$;
revoke all on function public.community_service_summary_input(uuid, boolean) from public, anon, authenticated;
grant execute on function public.community_service_summary_input(uuid, boolean) to service_role;

create or replace function public.community_service_save_summary(p_post uuid, p_summary text, p_comment_count integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.community_post_summaries (post_id, summary, comment_count_at, generated_at, refresh_requested_at)
  values (p_post, left(p_summary, 3000), p_comment_count, now(), null)
  on conflict (post_id) do update set summary = excluded.summary, comment_count_at = excluded.comment_count_at, generated_at = now(), refresh_requested_at = null;
end;
$$;
revoke all on function public.community_service_save_summary(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.community_service_save_summary(uuid, text, integer) to service_role;

-- «Actualizar resumen» a petición de una persona con alias (la función de servidor lo genera al instante).
create or replace function public.community_request_summary_refresh(p_post uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.community_require_participant();
  update public.community_post_summaries set refresh_requested_at = now() where post_id = p_post;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Pepa responde: preguntas sin respuesta humana tras 6 horas (máx. 3 por hora móvil; la cuarta avisa a los administradores) y menciones directas.
-- ---------------------------------------------------------------------------------------------
create table public.community_pepa_activity (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('unanswered', 'mention', 'summary', 'proposals')),
  post_id uuid,
  comment_id uuid,
  requester_id uuid,
  created_at timestamptz not null default now()
);
create index idx_community_pepa_activity_recent on public.community_pepa_activity (kind, created_at desc);
alter table public.community_pepa_activity enable row level security;
revoke all on public.community_pepa_activity from anon, authenticated;

create table public.community_pepa_mentions (
  comment_id uuid primary key references public.community_comments(id) on delete cascade,
  requester_id uuid not null references public.community_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  skipped boolean not null default false
);
alter table public.community_pepa_mentions enable row level security;
revoke all on public.community_pepa_mentions from anon, authenticated;

create or replace function private.community_detect_pepa_mention()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'published' and new.body ~* '(^|\s)@pepa\y' and not exists (select 1 from public.community_profiles cp where cp.id = new.author_id and cp.is_official) then
    insert into public.community_pepa_mentions (comment_id, requester_id) values (new.id, new.author_id) on conflict do nothing;
  end if;
  return null;
end;
$$;
revoke execute on function private.community_detect_pepa_mention() from public, anon, authenticated;
create trigger community_comments_pepa_mention after insert on public.community_comments for each row execute function private.community_detect_pepa_mention();

-- Preguntas que Pepa puede responder AHORA (la función de servidor las responde). Aplica el presupuesto por hora móvil.
create or replace function public.community_service_pepa_candidates()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hours integer := private.community_setting_int('pepa_unanswered_hours', 6);
  v_max integer := private.community_setting_int('pepa_max_per_hour', 3);
  v_used integer;
  v_budget integer;
  v_pending integer;
  v_out jsonb;
begin
  select count(*)::integer into v_used from public.community_pepa_activity a where a.kind = 'unanswered' and a.created_at > now() - interval '1 hour';
  v_budget := greatest(v_max - v_used, 0);
  select count(*)::integer, coalesce(jsonb_agg(x.j order by x.rn) filter (where x.rn <= v_budget), '[]'::jsonb) into v_pending, v_out
  from (
    select row_number() over (order by p.created_at) as rn,
           jsonb_build_object('post_id', p.id, 'title', p.title, 'body', left(p.body, 3000), 'topic_id', p.topic_id) as j
    from public.community_posts p
    where p.kind = 'pregunta' and p.status = 'published' and not p.is_official and not p.ai_excluded
      and p.created_at <= now() - make_interval(hours => v_hours)
      and not exists (select 1 from public.community_comments c join public.community_profiles ca on ca.id = c.author_id
                      where c.post_id = p.id and c.status = 'published' and c.author_id <> p.author_id and not ca.is_official)
      and not exists (select 1 from public.community_pepa_activity a where a.kind = 'unanswered' and a.post_id = p.id)
  ) x;
  if v_pending > v_budget and v_used >= v_max then
    -- La cuarta posible intervención no la hace Pepa: avisa a los dos administradores (una vez por hora).
    perform private.community_notify_admins('Preguntas sin responder', 'Pepa ha alcanzado su límite por hora y quedan ' || v_pending || ' preguntas sin respuesta. ¿Respondes tú?',
      '/comunidad/admin', 'pepa-limit:' || to_char(now(), 'YYYYMMDDHH24'));
  end if;
  return v_out;
end;
$$;
revoke all on function public.community_service_pepa_candidates() from public, anon, authenticated;
grant execute on function public.community_service_pepa_candidates() to service_role;

-- Pepa escribe su respuesta (identidad oficial «Pepa»; texto validado como cualquier otro). Anota la actividad para el presupuesto.
create or replace function public.community_service_pepa_comment(p_post uuid, p_body text, p_kind text default 'unanswered', p_reply_to uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pepa uuid := '00000000-0000-4000-8000-0000000000a2';
  v_body text := private.community_clean_text(p_body, 2000);
  v_id uuid;
  v_parent uuid;
  v_target public.community_comments%rowtype;
begin
  if p_kind not in ('unanswered', 'mention') then
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.community_posts p where p.id = p_post and p.status = 'published') then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  if p_reply_to is not null then
    select * into v_target from public.community_comments c where c.id = p_reply_to and c.post_id = p_post;
    v_parent := coalesce(v_target.parent_id, v_target.id);
  end if;
  insert into public.community_comments (post_id, author_id, parent_id, reply_to_id, body) values (p_post, v_pepa, v_parent, p_reply_to, v_body) returning id into v_id;
  insert into public.community_pepa_activity (kind, post_id, comment_id) values (p_kind, p_post, v_id);
  return v_id;
end;
$$;
revoke all on function public.community_service_pepa_comment(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.community_service_pepa_comment(uuid, text, text, uuid) to service_role;

-- Menciones pendientes (antispam: como mucho 3 respuestas a la misma persona por hora y 20 por hora en total; el resto se descarta sin responder).
create or replace function public.community_service_pepa_mentions()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_out jsonb := '[]'::jsonb;
  v_total integer;
  v_mine integer;
begin
  select count(*)::integer into v_total from public.community_pepa_activity a where a.kind = 'mention' and a.created_at > now() - interval '1 hour';
  for r in select m.*, c.post_id, c.body from public.community_pepa_mentions m join public.community_comments c on c.id = m.comment_id
           join public.community_posts po on po.id = c.post_id
           where c.status = 'published' and po.status = 'published' and not c.ai_excluded and not po.ai_excluded and m.handled_at is null and not m.skipped and m.created_at > now() - interval '2 hours' order by m.created_at limit 20 loop
    select count(*)::integer into v_mine from public.community_pepa_activity a where a.kind = 'mention' and a.requester_id = r.requester_id and a.created_at > now() - interval '1 hour';
    if v_total >= 20 or v_mine >= 3 then
      update public.community_pepa_mentions set skipped = true where comment_id = r.comment_id;
      continue;
    end if;
    insert into public.community_pepa_activity (kind, post_id, comment_id, requester_id) values ('mention', r.post_id, r.comment_id, r.requester_id);
    update public.community_pepa_mentions set handled_at = now() where comment_id = r.comment_id;
    v_total := v_total + 1;
    v_out := v_out || jsonb_build_array(jsonb_build_object('comment_id', r.comment_id, 'post_id', r.post_id, 'text', left(r.body, 1000),
      'title', (select p.title from public.community_posts p where p.id = r.post_id), 'post_body', (select left(p.body, 2000) from public.community_posts p where p.id = r.post_id)));
  end loop;
  return v_out;
end;
$$;
revoke all on function public.community_service_pepa_mentions() from public, anon, authenticated;
grant execute on function public.community_service_pepa_mentions() to service_role;

-- ---------------------------------------------------------------------------------------------
-- Permisos y trabajos.
-- ---------------------------------------------------------------------------------------------
revoke all on function public.community_admin_list_proposals(text) from public, anon;
revoke all on function public.community_admin_edit_proposal(uuid, text, text, jsonb, text) from public, anon;
revoke all on function public.community_admin_approve_proposal(uuid, boolean) from public, anon;
revoke all on function public.community_admin_list_menus(integer) from public, anon;
revoke all on function public.community_admin_get_menu(uuid) from public, anon;
revoke all on function public.community_admin_reschedule_menu(uuid, timestamptz) from public, anon;
revoke all on function public.community_admin_retry_publish(uuid) from public, anon;
revoke all on function public.community_admin_reject_proposal(uuid, text) from public, anon;
revoke all on function public.community_get_poll(uuid) from public, anon;
revoke all on function public.community_vote_poll(uuid, integer) from public, anon;
revoke all on function public.community_get_summary(uuid) from public, anon;
revoke all on function public.community_request_summary_refresh(uuid) from public, anon;
revoke all on function public.community_public_get_poll(uuid) from public;
grant execute on function public.community_admin_list_proposals(text) to authenticated;
grant execute on function public.community_admin_edit_proposal(uuid, text, text, jsonb, text) to authenticated;
grant execute on function public.community_admin_approve_proposal(uuid, boolean) to authenticated;
grant execute on function public.community_admin_list_menus(integer) to authenticated;
grant execute on function public.community_admin_get_menu(uuid) to authenticated;
grant execute on function public.community_admin_reschedule_menu(uuid, timestamptz) to authenticated;
grant execute on function public.community_admin_retry_publish(uuid) to authenticated;
grant execute on function public.community_admin_reject_proposal(uuid, text) to authenticated;
grant execute on function public.community_get_poll(uuid) to authenticated;
grant execute on function public.community_vote_poll(uuid, integer) to authenticated;
grant execute on function public.community_get_summary(uuid) to authenticated;
grant execute on function public.community_request_summary_refresh(uuid) to authenticated;
grant execute on function public.community_public_get_poll(uuid) to anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'community-run-polls') then
    perform cron.unschedule('community-run-polls');
  end if;
  -- Cada 5 minutos: encuestas (abrir y cerrar) y menús semanales (publicar los aprobados, solo si weekly_menu_autopublish = 1). Un único trabajo para ambos.
  perform cron.schedule('community-run-polls', '*/5 * * * *', 'select private.community_run_official()');
end $$;
