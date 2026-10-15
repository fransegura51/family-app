-- COMUNIDAD PEPA — medallas (CMN-127 a CMN-131): 12 permanentes legítimamente obtenidas en 3 familias + 4 niveles variables de constancia.
-- Sin rankings, sin tablas competitivas, sin recompensas económicas. No cuentan autointeracciones, spam, contenido invalidado ni repeticiones artificiales.
--
-- Cómo se calcula (función pura del estado ACTUAL, por eso se recalcula sola):
--  · Solo cuenta contenido PUBLICADO (lo oculto por moderación o eliminado no suma). Una expulsión NO retira por sí sola las medallas: solo afecta al contenido que se oculte.
--    Si una aportación que sostenía una medalla queda invalidada, la medalla se retira si ya no se cumplen los requisitos (las demás se mantienen);
--    si se restaura el contenido o se revoca la sanción, la medalla se restituye sola (CMN-145).
--  · Autointeracciones fuera: no se cuentan los me gusta, guardados ni valoraciones de la propia persona; en las importaciones tampoco cuentan las de su propia familia.
--  · Para no hacer cálculos en cada «me gusta», las acciones solo marcan a la persona como «pendiente de recalcular»; un trabajo programado cada 5 minutos
--    recalcula a las pendientes y avisa de las medallas nuevas.

create table public.community_medals (
  profile_id uuid not null references public.community_profiles(id) on delete cascade,
  medal_key text not null check (medal_key in (
    'cocinillas', 'cocinero_habitual', 'chef_destacado', 'receta_estrella',
    'primer_paso', 'conversador', 'participante_activo', 'voz_comunidad',
    'mano_amiga', 'buen_consejero', 'siempre_dispuesto', 'referente_pepa')),
  awarded_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (profile_id, medal_key)
);
alter table public.community_medals enable row level security;
revoke all on public.community_medals from anon, authenticated;

create table public.community_medal_dirty (
  profile_id uuid primary key references public.community_profiles(id) on delete cascade,
  marked_at timestamptz not null default now()
);
alter table public.community_medal_dirty enable row level security;
revoke all on public.community_medal_dirty from anon, authenticated;

-- Catálogo (nombre, descripción y requisito de cada medalla; las constancias se calculan aparte).
create or replace function private.community_medal_catalog()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '[
    {"key":"cocinillas","family":"cocina","name":"Cocinillas PEPA","description":"Publicar la primera receta."},
    {"key":"cocinero_habitual","family":"cocina","name":"Cocinero/a habitual","description":"Publicar 5 recetas diferentes."},
    {"key":"chef_destacado","family":"cocina","name":"Chef destacado","description":"10 familias diferentes importan alguna de tus recetas."},
    {"key":"receta_estrella","family":"cocina","name":"Receta estrella","description":"Una receta con al menos 10 valoraciones y media de 4,5 estrellas o más."},
    {"key":"primer_paso","family":"participacion","name":"Primer paso","description":"Publicar tu primera pregunta, consejo o anécdota."},
    {"key":"conversador","family":"participacion","name":"Conversador","description":"10 comentarios válidos en publicaciones de otras personas."},
    {"key":"participante_activo","family":"participacion","name":"Participante activo","description":"Participar en 20 publicaciones diferentes con comentarios o aportaciones propias."},
    {"key":"voz_comunidad","family":"participacion","name":"Voz de la comunidad","description":"Publicar 25 preguntas, consejos o anécdotas diferentes."},
    {"key":"mano_amiga","family":"ayuda","name":"Mano amiga","description":"5 me gusta de personas distintas en tus respuestas a preguntas."},
    {"key":"buen_consejero","family":"ayuda","name":"Buen consejero","description":"10 personas distintas guardan alguno de tus consejos."},
    {"key":"siempre_dispuesto","family":"ayuda","name":"Siempre dispuesto","description":"Responder a preguntas de 20 personas diferentes."},
    {"key":"referente_pepa","family":"ayuda","name":"Referente PEPA","description":"50 me gusta de personas diferentes en tus respuestas y consejos."}
  ]'::jsonb
$$;
revoke execute on function private.community_medal_catalog() from public, anon, authenticated;

-- Qué medallas cumple AHORA una persona (jsonb {clave: boolean}) y los números que las sostienen.
create or replace function private.community_medal_status(p_cp uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_family uuid;
  v_recipes integer;
  v_recipes_distinct integer;
  v_import_families integer;
  v_star boolean;
  v_other_posts integer;
  v_valid_comments integer;
  v_active_posts integer;
  v_voice integer;
  v_answer_likes integer;
  v_advice_savers integer;
  v_answered_authors integer;
  v_referent_likers integer;
begin
  select pr.family_id into v_family from public.community_profiles cp join public.profiles pr on pr.id = cp.user_id where cp.id = p_cp;

  select count(*), count(distinct lower(btrim(p.title))) into v_recipes, v_recipes_distinct
  from public.community_posts p where p.author_id = p_cp and p.kind = 'receta' and p.status = 'published';

  select count(distinct i.family_id) into v_import_families
  from public.community_recipe_imports i join public.community_posts p on p.recipe_id = i.recipe_id
  where p.author_id = p_cp and p.status = 'published' and i.family_id is distinct from v_family;

  select exists (
    select 1 from public.community_posts p
    where p.author_id = p_cp and p.kind = 'receta' and p.status = 'published'
      and (select count(*) from public.community_recipe_ratings r where r.recipe_id = p.recipe_id and r.profile_id <> p_cp) >= 10
      and (select avg(r.stars) from public.community_recipe_ratings r where r.recipe_id = p.recipe_id and r.profile_id <> p_cp) >= 4.5
  ) into v_star;

  select count(*) into v_other_posts from public.community_posts p where p.author_id = p_cp and p.kind <> 'receta' and p.status = 'published';

  select count(*) into v_valid_comments
  from public.community_comments c join public.community_posts p on p.id = c.post_id
  where c.author_id = p_cp and c.status = 'published' and p.status = 'published' and p.author_id <> p_cp
    and (char_length(btrim(c.body)) >= 5 or c.photo_path is not null);

  select count(*) into v_active_posts from (
    select p.id from public.community_posts p where p.author_id = p_cp and p.status = 'published'
    union
    select c.post_id from public.community_comments c join public.community_posts p on p.id = c.post_id
    where c.author_id = p_cp and c.status = 'published' and p.status = 'published'
  ) s;

  select count(distinct lower(btrim(p.title))) into v_voice from public.community_posts p where p.author_id = p_cp and p.kind <> 'receta' and p.status = 'published';

  select count(distinct l.profile_id) into v_answer_likes
  from public.community_comment_likes l join public.community_comments c on c.id = l.comment_id join public.community_posts p on p.id = c.post_id
  where c.author_id = p_cp and c.status = 'published' and p.status = 'published' and p.kind = 'pregunta' and p.author_id <> p_cp and l.profile_id <> p_cp;

  select count(distinct s.profile_id) into v_advice_savers
  from public.community_saves s join public.community_posts p on p.id = s.post_id
  where p.author_id = p_cp and p.kind = 'consejo' and p.status = 'published' and s.profile_id <> p_cp;

  select count(distinct p.author_id) into v_answered_authors
  from public.community_comments c join public.community_posts p on p.id = c.post_id join public.community_profiles pa on pa.id = p.author_id
  where c.author_id = p_cp and c.status = 'published' and p.status = 'published' and p.kind = 'pregunta' and p.author_id <> p_cp and not pa.is_official;

  select count(*) into v_referent_likers from (
    select l.profile_id from public.community_comment_likes l join public.community_comments c on c.id = l.comment_id join public.community_posts p on p.id = c.post_id
    where c.author_id = p_cp and c.status = 'published' and p.status = 'published' and p.kind = 'pregunta' and l.profile_id <> p_cp
    union
    select l.profile_id from public.community_post_likes l join public.community_posts p on p.id = l.post_id
    where p.author_id = p_cp and p.kind = 'consejo' and p.status = 'published' and l.profile_id <> p_cp
  ) s;

  return jsonb_build_object(
    'suspended', false,
    'meets', jsonb_build_object(
      'cocinillas', v_recipes >= 1,
      'cocinero_habitual', v_recipes_distinct >= 5,
      'chef_destacado', v_import_families >= 10,
      'receta_estrella', v_star,
      'primer_paso', v_other_posts >= 1,
      'conversador', v_valid_comments >= 10,
      'participante_activo', v_active_posts >= 20,
      'voz_comunidad', v_voice >= 25,
      'mano_amiga', v_answer_likes >= 5,
      'buen_consejero', v_advice_savers >= 10,
      'siempre_dispuesto', v_answered_authors >= 20,
      'referente_pepa', v_referent_likers >= 50),
    'progress', jsonb_build_object(
      'cocinillas', jsonb_build_array(least(v_recipes, 1), 1),
      'cocinero_habitual', jsonb_build_array(least(v_recipes_distinct, 5), 5),
      'chef_destacado', jsonb_build_array(least(v_import_families, 10), 10),
      'receta_estrella', jsonb_build_array(case when v_star then 1 else 0 end, 1),
      'primer_paso', jsonb_build_array(least(v_other_posts, 1), 1),
      'conversador', jsonb_build_array(least(v_valid_comments, 10), 10),
      'participante_activo', jsonb_build_array(least(v_active_posts, 20), 20),
      'voz_comunidad', jsonb_build_array(least(v_voice, 25), 25),
      'mano_amiga', jsonb_build_array(least(v_answer_likes, 5), 5),
      'buen_consejero', jsonb_build_array(least(v_advice_savers, 10), 10),
      'siempre_dispuesto', jsonb_build_array(least(v_answered_authors, 20), 20),
      'referente_pepa', jsonb_build_array(least(v_referent_likers, 50), 50)));
end;
$$;
revoke execute on function private.community_medal_status(uuid) from public, anon, authenticated;

-- Aplica el estado a la tabla: concede, retira (si ya no se cumple) o restituye. Avisa de las concesiones/restituciones.
create or replace function private.community_recompute_medals(p_cp uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status jsonb := private.community_medal_status(p_cp);
  v_item jsonb;
  v_key text;
  v_meets boolean;
  v_row public.community_medals%rowtype;
  v_name text;
begin
  for v_item in select * from jsonb_array_elements(private.community_medal_catalog()) loop
    v_key := v_item ->> 'key';
    v_name := v_item ->> 'name';
    v_meets := coalesce((v_status #>> array['meets', v_key])::boolean, false);
    select * into v_row from public.community_medals m where m.profile_id = p_cp and m.medal_key = v_key;
    if v_meets then
      if not found then
        insert into public.community_medals (profile_id, medal_key) values (p_cp, v_key);
        perform private.community_notify_cp(p_cp, 'community_medal', 'Nueva medalla: ' || v_name, v_item ->> 'description', '/comunidad/medallas', 'medal:' || v_key);
      elsif v_row.revoked_at is not null then
        update public.community_medals set revoked_at = null where profile_id = p_cp and medal_key = v_key;
        perform private.community_notify_cp(p_cp, 'community_medal', 'Medalla recuperada: ' || v_name, v_item ->> 'description', '/comunidad/medallas', 'medal-back:' || v_key || ':' || extract(epoch from now())::bigint);
      end if;
    elsif found and v_row.revoked_at is null then
      update public.community_medals set revoked_at = now() where profile_id = p_cp and medal_key = v_key;
    end if;
  end loop;
end;
$$;
revoke execute on function private.community_recompute_medals(uuid) from public, anon, authenticated;

-- Constancia: ventana móvil de 4 semanas (4 tramos de 7 días hasta ahora); una semana cuenta si hay al menos una participación válida
-- (publicación, comentario o valoración de receta). Abrir la app no cuenta; no hacen falta días seguidos. Nivel = semanas activas (0 = sin nivel).
create or replace function private.community_constancy_level(p_cp uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from generate_series(0, 3) w
  where exists (
          select 1 from public.community_posts p
          where p.author_id = p_cp and p.status = 'published'
            and p.created_at >= now() - make_interval(days => 7 * (w + 1)) and p.created_at < now() - make_interval(days => 7 * w))
     or exists (
          select 1 from public.community_comments c
          where c.author_id = p_cp and c.status = 'published'
            and c.created_at >= now() - make_interval(days => 7 * (w + 1)) and c.created_at < now() - make_interval(days => 7 * w))
     or exists (
          select 1 from public.community_recipe_ratings r
          where r.profile_id = p_cp and r.status = 'published'
            and r.created_at >= now() - make_interval(days => 7 * (w + 1)) and r.created_at < now() - make_interval(days => 7 * w))
$$;
revoke execute on function private.community_constancy_level(uuid) from public, anon, authenticated;

-- Medallas de una persona (para su página y para el perfil público). Solo se enseña el nivel de constancia ACTUAL.
create or replace function public.community_get_medals(p_cp uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cp uuid := coalesce(p_cp, private.community_cp());
  v_status jsonb;
  v_level integer;
  v_names text[] := array['De vuelta por PEPA', 'Visitante habitual', 'Siempre por aquí', 'Colaborador habitual'];
begin
  perform private.community_require_reader();
  if v_cp is null or not exists (select 1 from public.community_profiles x where x.id = v_cp and x.deleted_at is null) then
    return null;
  end if;
  v_status := private.community_medal_status(v_cp);
  v_level := private.community_constancy_level(v_cp);
  return jsonb_build_object(
    'medals', (select coalesce(jsonb_agg(c.item || jsonb_build_object(
                  'earned', m.medal_key is not null and m.revoked_at is null,
                  'awarded_at', case when m.revoked_at is null then m.awarded_at end,
                  'progress', v_status -> 'progress' -> (c.item ->> 'key'))
               order by ord), '[]'::jsonb)
               from jsonb_array_elements(private.community_medal_catalog()) with ordinality as c(item, ord)
               left join public.community_medals m on m.profile_id = v_cp and m.medal_key = c.item ->> 'key'),
    'constancy', case when v_level between 1 and 4 then jsonb_build_object('level', v_level, 'name', v_names[v_level], 'weeks_active', v_level) else null end,
    'suspended', (private.community_ban_state(v_cp) <> 'ok' and (v_cp = private.community_cp() or private.community_is_admin())));
end;
$$;

-- Trabajo programado: recalcula a las personas marcadas.
create or replace function private.community_process_medals()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_n integer := 0;
begin
  for r in select d.profile_id from public.community_medal_dirty d order by d.marked_at limit 200 loop
    begin
      perform private.community_recompute_medals(r.profile_id);
      delete from public.community_medal_dirty where profile_id = r.profile_id;
      v_n := v_n + 1;
    exception when others then
      raise warning 'community_process_medals (%): %', r.profile_id, sqlerrm;
      delete from public.community_medal_dirty where profile_id = r.profile_id;
    end;
  end loop;
  return v_n;
end;
$$;
revoke execute on function private.community_process_medals() from public, anon, authenticated;

create or replace function private.community_mark_dirty(p_cp uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.community_medal_dirty (profile_id) select p_cp where p_cp is not null and exists (select 1 from public.community_profiles x where x.id = p_cp and not x.is_official)
  on conflict (profile_id) do update set marked_at = now()
$$;
revoke execute on function private.community_mark_dirty(uuid) from public, anon, authenticated;

create or replace function private.community_dirty_posts()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.community_mark_dirty(coalesce(new.author_id, old.author_id));
  return null;
end; $$;
create or replace function private.community_dirty_comments()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.community_mark_dirty(coalesce(new.author_id, old.author_id));
  return null;
end; $$;
create or replace function private.community_dirty_post_target()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_post uuid := coalesce(new.post_id, old.post_id);
begin
  perform private.community_mark_dirty((select p.author_id from public.community_posts p where p.id = v_post));
  return null;
end; $$;
create or replace function private.community_dirty_comment_likes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.community_mark_dirty((select c.author_id from public.community_comments c where c.id = coalesce(new.comment_id, old.comment_id)));
  return null;
end; $$;
create or replace function private.community_dirty_recipe_target()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.community_mark_dirty((select p.author_id from public.community_posts p where p.recipe_id = coalesce(new.recipe_id, old.recipe_id) limit 1));
  return null;
end; $$;
revoke execute on function private.community_dirty_posts(), private.community_dirty_comments(), private.community_dirty_post_target(),
  private.community_dirty_comment_likes(), private.community_dirty_recipe_target() from public, anon, authenticated;

create trigger community_posts_dirty after insert or update of status on public.community_posts for each row execute function private.community_dirty_posts();
create trigger community_comments_dirty after insert or update of status on public.community_comments for each row execute function private.community_dirty_comments();
create trigger community_post_likes_dirty after insert or delete on public.community_post_likes for each row execute function private.community_dirty_post_target();
create trigger community_saves_dirty after insert or delete on public.community_saves for each row execute function private.community_dirty_post_target();
create trigger community_comment_likes_dirty after insert or delete on public.community_comment_likes for each row execute function private.community_dirty_comment_likes();
create trigger community_ratings_dirty after insert or update or delete on public.community_recipe_ratings for each row execute function private.community_dirty_recipe_target();
create trigger community_imports_dirty after insert or update or delete on public.community_recipe_imports for each row execute function private.community_dirty_recipe_target();

revoke all on function public.community_get_medals(uuid) from public, anon;
grant execute on function public.community_get_medals(uuid) to authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'community-process-medals') then
    perform cron.unschedule('community-process-medals');
  end if;
  perform cron.schedule('community-process-medals', '*/5 * * * *', 'select private.community_process_medals()');
end $$;
