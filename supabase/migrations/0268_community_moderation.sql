-- COMUNIDAD PEPA — moderación y administración.
--
-- Reglas aprobadas:
--  · Publicar y comentar es inmediato; la moderación es posterior. Una denuncia por sí sola NO retira nada.
--  · Ocultación provisional automática solo ante contenido claramente dañino: varias personas DISTINTAS lo denuncian con un motivo grave (acoso, violencia,
--    sexual, ilegal, datos privados). El número lo fija el parámetro report_autohide_distinct_reporters (3) y queda pendiente de revisión humana.
--  · Los dos administradores de Comunidad (profiles.is_app_owner) tienen permisos idénticos y sin jerarquía; lo que resuelve uno queda resuelto para el otro;
--    cualquiera puede revertir lo del otro; todo queda en el historial (quién, cuándo, motivo), que no se puede editar ni borrar desde la app.
--  · Tres advertencias → expulsión de COMUNIDAD solamente (no de la cuenta familiar). Primera expulsión de 30 días; después, solicitud de readmisión que
--    resuelve la administración. Las advertencias cuentan desde la última expulsión. Los administradores pueden retirar advertencias y expulsiones erróneas.

create or replace function private.community_require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.community_is_admin() then
    raise exception 'NOT_ADMIN' using errcode = 'P0001';
  end if;
  return (select auth.uid());
end;
$$;
revoke execute on function private.community_require_admin() from public, anon, authenticated;

create or replace function private.community_log(p_action text, p_target_type text, p_target_id uuid, p_reason text, p_details jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.community_admin_log (actor_id, action, target_type, target_id, reason, details)
  values (coalesce((select auth.uid()), '00000000-0000-0000-0000-000000000000'::uuid), p_action, p_target_type, p_target_id, left(p_reason, 500), coalesce(p_details, '{}'::jsonb))
$$;
revoke execute on function private.community_log(text, text, uuid, text, jsonb) from public, anon, authenticated;

-- Avisa a los dos administradores (nunca a quien provoca el aviso si es uno de ellos).
create or replace function private.community_notify_admins(p_title text, p_body text, p_url text, p_dedupe text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in select p.id from public.profiles p where p.is_app_owner loop
    perform private.notify_user(r.id, 'other', 'community_admin', p_title, p_body, p_url, null, case when p_dedupe is null then null else p_dedupe || ':' || r.id end, true);
  end loop;
exception when others then
  raise warning 'community_notify_admins: %', sqlerrm;
end;
$$;
revoke execute on function private.community_notify_admins(text, text, text, text) from public, anon, authenticated;

-- Aviso a una persona de Comunidad (por su perfil público): si tiene cuenta, va a su campana como personal.
create or replace function private.community_notify_cp(p_cp uuid, p_category text, p_title text, p_body text, p_url text, p_dedupe text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  select cp.user_id into v_user from public.community_profiles cp where cp.id = p_cp;
  if v_user is not null then
    perform private.notify_user(v_user, 'personal', p_category, p_title, p_body, p_url, null, p_dedupe, true);
  end if;
exception when others then
  raise warning 'community_notify_cp: %', sqlerrm;
end;
$$;
revoke execute on function private.community_notify_cp(uuid, text, text, text, text, text) from public, anon, authenticated;

-- Cambia el estado de un contenido (published / hidden / deleted) y apunta quién lo hizo.
create or replace function private.community_set_content_status(p_type text, p_id uuid, p_status text, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
begin
  if p_type = 'post' then
    update public.community_posts
    set status = p_status, hidden_reason = case when p_status = 'hidden' then p_reason end,
        hidden_at = case when p_status = 'hidden' then now() end, hidden_by = case when p_status = 'hidden' then (select auth.uid()) end
    where id = p_id and status <> 'deleted'
    returning author_id into v_author;
  elsif p_type = 'comment' then
    update public.community_comments
    set status = p_status, hidden_reason = case when p_status = 'hidden' then p_reason end,
        hidden_at = case when p_status = 'hidden' then now() end, hidden_by = case when p_status = 'hidden' then (select auth.uid()) end
    where id = p_id and status <> 'deleted'
    returning author_id into v_author;
  else
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;
  if v_author is null then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  if p_type = 'comment' and p_status <> 'published' then
    delete from public.community_post_summaries where post_id = (select c.post_id from public.community_comments c where c.id = p_id);
  end if;
  return v_author;
end;
$$;
revoke execute on function private.community_set_content_status(text, uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Denunciar (cualquier persona con alias). Una denuncia por persona y contenido.
-- ---------------------------------------------------------------------------------------------
create or replace function public.community_report(p_type text, p_id uuid, p_reason text, p_detail text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cp uuid := private.community_require_participant();
  v_author uuid;
  v_detail text := nullif(btrim(coalesce(p_detail, '')), '');
  v_graves integer;
  v_hidden boolean := false;
  v_threshold integer := private.community_setting_int('report_autohide_distinct_reporters', 3);
begin
  if p_reason not in ('spam', 'acoso', 'violencia', 'sexual', 'ilegal', 'datos_privados', 'enganoso', 'otro') then
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;
  if (select count(*) from public.community_reports r where r.reporter_id = v_cp and r.created_at > now() - interval '1 day')
     >= private.community_setting_int('rate_reports_per_day', 20) then
    raise exception 'RATE_LIMIT' using errcode = 'P0001';
  end if;
  if p_type = 'post' then
    select p.author_id into v_author from public.community_posts p where p.id = p_id and p.status = 'published';
  elsif p_type = 'comment' then
    select c.author_id into v_author from public.community_comments c where c.id = p_id and c.status = 'published';
  elsif p_type = 'user' then
    select cp.id into v_author from public.community_profiles cp where cp.id = p_id and cp.deleted_at is null and not cp.is_official;
  else
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;
  if v_author is null or v_author = v_cp then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  if v_detail is not null then
    v_detail := private.community_clean_text(v_detail, 1000, false);
  end if;
  begin
    insert into public.community_reports (reporter_id, target_type, target_id, reason, detail) values (v_cp, p_type, p_id, p_reason, v_detail);
  exception when unique_violation then
    return jsonb_build_object('already_reported', true);
  end;

  if p_type <> 'user' and p_reason in ('acoso', 'violencia', 'sexual', 'ilegal', 'datos_privados') then
    select count(distinct r.reporter_id)::integer into v_graves from public.community_reports r
    where r.target_type = p_type and r.target_id = p_id and r.status = 'open' and r.reason in ('acoso', 'violencia', 'sexual', 'ilegal', 'datos_privados');
    if v_graves >= v_threshold then
      perform private.community_set_content_status(p_type, p_id, 'hidden', 'auto: varias denuncias por contenido dañino (revisión pendiente)');
      v_hidden := true;
      perform private.community_notify_admins('Contenido ocultado provisionalmente', 'Varias denuncias graves. Revísalo en el Centro de Mando.', '/comunidad/admin', 'autohide:' || p_id);
    end if;
  end if;
  perform private.community_notify_admins('Nueva denuncia en Comunidad', 'Hay una denuncia pendiente de revisar.', '/comunidad/admin', 'report:' || p_type || ':' || p_id);
  return jsonb_build_object('already_reported', false, 'hidden', v_hidden);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Advertencias y expulsiones.
-- ---------------------------------------------------------------------------------------------
create or replace function private.community_ban(p_profile uuid, p_reason text, p_days integer default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer := coalesce(p_days, private.community_setting_int('first_ban_days', 30));
  v_id uuid;
begin
  insert into public.community_bans (profile_id, ends_at, reason, created_by)
  values (p_profile, now() + make_interval(days => v_days), p_reason, coalesce((select auth.uid()), '00000000-0000-0000-0000-000000000000'::uuid))
  returning id into v_id;
  perform private.community_log('ban', 'user', p_profile, p_reason, jsonb_build_object('ban_id', v_id, 'days', v_days));
  perform private.community_notify_cp(p_profile, 'community_moderation', 'Expulsión temporal de Comunidad',
    'No podrás publicar ni comentar durante ' || v_days || ' días. Tu cuenta de PEPA y los datos de tu familia no se ven afectados.', '/comunidad', null);
  return v_id;
end;
$$;
revoke execute on function private.community_ban(uuid, text, integer) from public, anon, authenticated;

create or replace function private.community_issue_warning(p_profile uuid, p_reason text, p_report uuid, p_target_type text, p_target_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_since timestamptz;
  v_active integer;
  v_banned boolean := false;
begin
  insert into public.community_warnings (profile_id, reason, report_id, target_type, target_id, issued_by)
  values (p_profile, p_reason, p_report, p_target_type, p_target_id, (select auth.uid()))
  returning id into v_id;
  perform private.community_log('warning', 'user', p_profile, p_reason, jsonb_build_object('warning_id', v_id));
  select coalesce(max(b.starts_at), '-infinity'::timestamptz) into v_since from public.community_bans b where b.profile_id = p_profile;
  select count(*)::integer into v_active from public.community_warnings w where w.profile_id = p_profile and w.revoked_at is null and w.issued_at > v_since;
  perform private.community_notify_cp(p_profile, 'community_moderation', 'Advertencia de Comunidad',
    'Has recibido una advertencia (' || v_active || ' de 3). Motivo: ' || left(p_reason, 200), '/comunidad', null);
  if v_active >= 3 then
    perform private.community_ban(p_profile, 'Tercera advertencia');
    v_banned := true;
  end if;
  return jsonb_build_object('warning_id', v_id, 'active_warnings', v_active, 'banned', v_banned);
end;
$$;
revoke execute on function private.community_issue_warning(uuid, text, uuid, text, uuid) from public, anon, authenticated;

create or replace function public.community_admin_warn(p_profile uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.community_require_admin();
  if not exists (select 1 from public.community_profiles cp where cp.id = p_profile and not cp.is_official and cp.deleted_at is null) then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  return private.community_issue_warning(p_profile, left(btrim(coalesce(p_reason, '')), 500), null, null, null);
end;
$$;

create or replace function public.community_admin_revoke_warning(p_warning uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid;
begin
  perform private.community_require_admin();
  update public.community_warnings set revoked_at = now(), revoked_by = (select auth.uid()), revoke_reason = left(p_reason, 500)
  where id = p_warning and revoked_at is null returning profile_id into v_profile;
  if v_profile is null then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  perform private.community_log('warning_revoked', 'user', v_profile, p_reason, jsonb_build_object('warning_id', p_warning));
  perform private.community_recompute_medals(v_profile);
end;
$$;

create or replace function public.community_admin_ban(p_profile uuid, p_reason text, p_days integer default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.community_require_admin();
  if not exists (select 1 from public.community_profiles cp where cp.id = p_profile and not cp.is_official and cp.deleted_at is null) then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  return private.community_ban(p_profile, left(btrim(coalesce(p_reason, '')), 500), case when p_days between 1 and 365 then p_days end);
end;
$$;

create or replace function public.community_admin_lift_ban(p_ban uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid;
begin
  perform private.community_require_admin();
  update public.community_bans set lifted_at = now(), lifted_by = (select auth.uid()), lift_reason = left(p_reason, 500)
  where id = p_ban and lifted_at is null returning profile_id into v_profile;
  if v_profile is null then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  perform private.community_log('ban_lifted', 'user', v_profile, p_reason, jsonb_build_object('ban_id', p_ban));
  perform private.community_notify_cp(v_profile, 'community_moderation', 'Expulsión retirada', 'Ya puedes volver a participar en Comunidad.', '/comunidad', null);
  perform private.community_recompute_medals(v_profile);
end;
$$;

-- La persona expulsada, cumplido el plazo, pide la readmisión.
create or replace function public.community_request_readmission()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cp uuid := private.community_cp();
  v_ban public.community_bans%rowtype;
begin
  if v_cp is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  select * into v_ban from public.community_bans b where b.profile_id = v_cp and b.lifted_at is null and b.readmission_status <> 'approved' order by b.starts_at desc limit 1;
  if not found or now() < v_ban.ends_at or v_ban.readmission_status = 'requested' then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  update public.community_bans set readmission_status = 'requested', readmission_requested_at = now() where id = v_ban.id;
  perform private.community_notify_admins('Solicitud de readmisión', 'Una persona expulsada pide volver a Comunidad.', '/comunidad/admin', 'readmit:' || v_ban.id);
end;
$$;

create or replace function public.community_admin_resolve_readmission(p_ban uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid;
begin
  perform private.community_require_admin();
  update public.community_bans
  set readmission_status = case when p_approve then 'approved' else 'rejected' end, readmission_note = left(p_note, 500),
      readmission_resolved_by = (select auth.uid()), readmission_resolved_at = now()
  where id = p_ban and readmission_status = 'requested'
  returning profile_id into v_profile;
  if v_profile is null then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  perform private.community_log(case when p_approve then 'readmission_approved' else 'readmission_rejected' end, 'user', v_profile, p_note, jsonb_build_object('ban_id', p_ban));
  perform private.community_notify_cp(v_profile, 'community_moderation',
    case when p_approve then 'Readmisión aprobada' else 'Readmisión no aprobada' end,
    case when p_approve then 'Ya puedes volver a participar en Comunidad.' else 'Por ahora no puedes volver a participar. Puedes volver a pedirlo más adelante.' end, '/comunidad', null);
  if p_approve then
    perform private.community_recompute_medals(v_profile);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Centro de Mando (solo administradores de Comunidad).
-- ---------------------------------------------------------------------------------------------
create or replace function public.community_admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.community_require_admin();
  return jsonb_build_object(
    'posts', (select count(*) from public.community_posts p where p.status = 'published'),
    'posts_7d', (select count(*) from public.community_posts p where p.status = 'published' and p.created_at > now() - interval '7 days'),
    'comments_7d', (select count(*) from public.community_comments c where c.status = 'published' and c.created_at > now() - interval '7 days'),
    'members', (select count(*) from public.community_profiles cp where not cp.is_official and cp.deleted_at is null),
    'open_reports', (select count(distinct (r.target_type, r.target_id)) from public.community_reports r where r.status = 'open'),
    'hidden_content', (select (select count(*) from public.community_posts p where p.status = 'hidden') + (select count(*) from public.community_comments c where c.status = 'hidden')),
    'active_bans', (select count(*) from public.community_bans b where b.lifted_at is null and b.readmission_status <> 'approved'),
    'readmission_requests', (select count(*) from public.community_bans b where b.readmission_status = 'requested'),
    'removal_requests', (select count(*) from public.community_removal_requests q where q.status = 'open'),
    'featured', (select count(*) from public.community_posts p where p.featured_at is not null and p.featured_removed_at is null and p.status = 'published'));
end;
$$;

-- Denuncias agrupadas por contenido. p_status: open | resolved.
create or replace function public.community_admin_list_reports(p_status text default 'open', p_limit integer default 50, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.community_require_admin();
  return coalesce((
    select jsonb_agg(g.j order by g.last_at desc)
    from (
      select max(r.created_at) as last_at,
        jsonb_build_object(
          'target_type', r.target_type, 'target_id', r.target_id,
          'report_count', count(*), 'reasons', jsonb_agg(distinct r.reason),
          'first_at', min(r.created_at), 'last_at', max(r.created_at),
          'status', case when bool_or(r.status = 'open') then 'open' else 'resolved' end,
          'resolution', (array_agg(r.resolution order by r.resolved_at desc nulls last))[1],
          'content', case r.target_type
            when 'post' then (select jsonb_build_object('title', p.title, 'excerpt', private.community_plain_excerpt(p.body), 'status', p.status, 'author_id', p.author_id,
                              'author_alias', ca.alias) from public.community_posts p join public.community_profiles ca on ca.id = p.author_id where p.id = r.target_id)
            when 'comment' then (select jsonb_build_object('excerpt', left(c.body, 240), 'status', c.status, 'author_id', c.author_id, 'author_alias', ca.alias, 'post_id', c.post_id)
                                 from public.community_comments c join public.community_profiles ca on ca.id = c.author_id where c.id = r.target_id)
            else (select jsonb_build_object('author_id', cp.id, 'author_alias', cp.alias) from public.community_profiles cp where cp.id = r.target_id) end) as j
      from public.community_reports r
      where (p_status = 'open' and r.status = 'open') or (p_status = 'resolved' and r.status = 'resolved')
      group by r.target_type, r.target_id
      having (p_status = 'open') or (p_status = 'resolved' and not bool_or(r.status = 'open'))
      order by max(r.created_at) desc
      limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
    ) g
  ), '[]'::jsonb);
end;
$$;

-- Contenido completo (también oculto) para poder revisarlo.
create or replace function public.community_admin_get_content(p_type text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
begin
  perform private.community_require_admin();
  if p_type = 'post' then
    select jsonb_build_object('type', 'post', 'id', p.id, 'title', p.title, 'body', p.body, 'status', p.status, 'hidden_reason', p.hidden_reason,
      'author_id', p.author_id, 'author_alias', ca.alias, 'kind', p.kind, 'created_at', p.created_at,
      'photos', (select coalesce(jsonb_agg(ph.storage_path order by ph.position), '[]'::jsonb) from public.community_post_photos ph where ph.post_id = p.id))
    into v_row from public.community_posts p join public.community_profiles ca on ca.id = p.author_id where p.id = p_id;
  elsif p_type = 'comment' then
    select jsonb_build_object('type', 'comment', 'id', c.id, 'post_id', c.post_id, 'body', c.body, 'photo_path', c.photo_path, 'status', c.status,
      'hidden_reason', c.hidden_reason, 'author_id', c.author_id, 'author_alias', ca.alias, 'created_at', c.created_at)
    into v_row from public.community_comments c join public.community_profiles ca on ca.id = c.author_id where c.id = p_id;
  end if;
  if v_row is null then
    return null;
  end if;
  return v_row || jsonb_build_object(
    'reports', (select coalesce(jsonb_agg(jsonb_build_object('reason', r.reason, 'detail', r.detail, 'status', r.status, 'created_at', r.created_at) order by r.created_at), '[]'::jsonb)
                from public.community_reports r where r.target_type = p_type and r.target_id = p_id));
end;
$$;

-- Acción sobre un contenido denunciado (resuelve todas sus denuncias abiertas, para los dos administradores a la vez).
-- p_action: sin_accion | ocultar | advertir (oculta y advierte al autor) | expulsar (oculta y expulsa).
create or replace function public.community_admin_resolve_content(p_type text, p_id uuid, p_action text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
  v_result jsonb := '{}'::jsonb;
  v_res text;
begin
  perform private.community_require_admin();
  if p_action not in ('sin_accion', 'ocultar', 'advertir', 'expulsar') or p_type not in ('post', 'comment', 'user') then
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;
  if p_type = 'user' then
    v_author := p_id;
  elsif p_type = 'post' then
    select author_id into v_author from public.community_posts where id = p_id;
  else
    select author_id into v_author from public.community_comments where id = p_id;
  end if;
  if v_author is null then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  if p_action in ('ocultar', 'advertir', 'expulsar') and p_type <> 'user' then
    perform private.community_set_content_status(p_type, p_id, 'hidden', coalesce(nullif(btrim(p_note), ''), 'Retirado por moderación'));
    perform private.community_notify_cp(v_author, 'community_moderation', 'Contenido retirado por moderación',
      'Hemos ocultado una de tus aportaciones por no cumplir las normas de Comunidad.', '/comunidad', null);
  end if;
  if p_action = 'advertir' then
    v_result := private.community_issue_warning(v_author, coalesce(nullif(btrim(p_note), ''), 'Incumplimiento de las normas'), null, p_type, p_id);
  elsif p_action = 'expulsar' then
    perform private.community_ban(v_author, coalesce(nullif(btrim(p_note), ''), 'Incumplimiento grave de las normas'));
    v_result := jsonb_build_object('banned', true);
  end if;
  v_res := case p_action when 'sin_accion' then 'sin_accion' when 'ocultar' then 'oculto' when 'advertir' then 'advertencia' else 'expulsion' end;
  update public.community_reports
  set status = 'resolved', resolution = v_res, resolved_by = (select auth.uid()), resolved_at = now(), resolution_note = left(p_note, 500)
  where target_type = p_type and target_id = p_id and status = 'open';
  perform private.community_log('resolve_' || p_action, p_type, p_id, p_note, v_result);
  perform private.community_recompute_medals(v_author);
  return v_result;
end;
$$;

-- Ocultar o restaurar a mano (cualquiera de los dos puede revertir lo del otro, sin segunda aprobación).
create or replace function public.community_admin_set_visibility(p_type text, p_id uuid, p_visible boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
begin
  perform private.community_require_admin();
  v_author := private.community_set_content_status(p_type, p_id, case when p_visible then 'published' else 'hidden' end, coalesce(nullif(btrim(p_reason), ''), 'Decisión de administración'));
  perform private.community_log(case when p_visible then 'restore' else 'hide' end, p_type, p_id, p_reason);
  perform private.community_recompute_medals(v_author);
end;
$$;

create or replace function public.community_admin_list_hidden(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.community_require_admin();
  return coalesce((
    select jsonb_agg(x.j order by x.at desc) from (
      select p.hidden_at as at, jsonb_build_object('type', 'post', 'id', p.id, 'title', p.title, 'reason', p.hidden_reason, 'hidden_at', p.hidden_at, 'author_alias', ca.alias) as j
      from public.community_posts p join public.community_profiles ca on ca.id = p.author_id where p.status = 'hidden'
      union all
      select c.hidden_at, jsonb_build_object('type', 'comment', 'id', c.id, 'title', left(c.body, 80), 'reason', c.hidden_reason, 'hidden_at', c.hidden_at, 'author_alias', ca.alias)
      from public.community_comments c join public.community_profiles ca on ca.id = c.author_id where c.status = 'hidden'
      order by 1 desc limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) x
  ), '[]'::jsonb);
end;
$$;

-- Usuarios: perfil público + historial de infracciones (acceso restringido a administradores).
create or replace function public.community_admin_list_users(p_query text default null, p_limit integer default 50)
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
      'id', cp.id, 'alias', cp.alias, 'created_at', cp.created_at,
      'posts', (select count(*) from public.community_posts p where p.author_id = cp.id and p.status = 'published'),
      'warnings', (select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'reason', w.reason, 'issued_at', w.issued_at, 'revoked_at', w.revoked_at) order by w.issued_at desc), '[]'::jsonb)
                   from public.community_warnings w where w.profile_id = cp.id),
      'bans', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'reason', b.reason, 'starts_at', b.starts_at, 'ends_at', b.ends_at, 'lifted_at', b.lifted_at,
                                                           'readmission_status', b.readmission_status) order by b.starts_at desc), '[]'::jsonb)
               from public.community_bans b where b.profile_id = cp.id),
      'ban_state', private.community_ban_state(cp.id)) order by cp.created_at desc)
    from (select * from public.community_profiles x
          where not x.is_official and x.deleted_at is null and (p_query is null or btrim(p_query) = '' or x.alias_key like '%' || lower(btrim(p_query)) || '%')
          order by x.created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) cp
  ), '[]'::jsonb);
end;
$$;

create or replace function public.community_admin_list_readmissions()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.community_require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object('ban_id', b.id, 'profile_id', b.profile_id, 'alias', cp.alias, 'reason', b.reason, 'ends_at', b.ends_at,
                                        'requested_at', b.readmission_requested_at) order by b.readmission_requested_at)
    from public.community_bans b join public.community_profiles cp on cp.id = b.profile_id where b.readmission_status = 'requested'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.community_admin_list_log(p_limit integer default 100, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.community_require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', l.id, 'actor', coalesce(pr.display_name, 'sistema'), 'action', l.action, 'target_type', l.target_type, 'target_id', l.target_id,
                                        'reason', l.reason, 'details', l.details, 'created_at', l.created_at) order by l.id desc)
    from (select * from public.community_admin_log order by id desc limit least(greatest(coalesce(p_limit, 100), 1), 500) offset greatest(coalesce(p_offset, 0), 0)) l
    left join public.profiles pr on pr.id = l.actor_id
  ), '[]'::jsonb);
end;
$$;

-- Parámetros ajustables y dominios bloqueados.
create or replace function public.community_admin_get_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.community_require_admin();
  return jsonb_build_object(
    'settings', (select coalesce(jsonb_agg(jsonb_build_object('key', s.key, 'value', s.value, 'description', s.description) order by s.key), '[]'::jsonb) from public.community_settings s),
    'blocked_domains', (select coalesce(jsonb_agg(jsonb_build_object('domain', d.domain, 'reason', d.reason) order by d.domain), '[]'::jsonb) from public.community_blocked_domains d));
end;
$$;

-- Solo se pueden cambiar a mano los parámetros TÉCNICOS de uso y antispam. Las reglas cerradas por la especificación (15 comentarios, 10 para actualizar el
-- resumen, 6 horas, 3 por hora, 30 días de borrador y de expulsión, 5 fotos, 10 búsquedas, años de retención del historial, solo adultos) NO se pueden
-- tocar desde el Centro de Mando: la apertura se cambia con community_admin_set_launch y lo demás solo con una migración.
create or replace function public.community_admin_set_setting(p_key text, p_value integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_min integer;
  v_max integer;
begin
  perform private.community_require_admin();
  select r.lo, r.hi into v_min, v_max from (values
    ('rate_posts_per_hour', 1, 100),
    ('rate_comments_per_10min', 1, 200),
    ('rate_reports_per_day', 1, 200),
    ('report_autohide_distinct_reporters', 1, 10),
    ('max_links_per_post', 1, 50),
    ('ai_daily_cap', 0, 5000)
  ) as r(k, lo, hi) where r.k = p_key;
  if v_min is null then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  if p_value is null or p_value < v_min or p_value > v_max then
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;
  update public.community_settings set value = to_jsonb(p_value), updated_at = now() where key = p_key;
  perform private.community_log('setting', 'setting', null, p_key || '=' || p_value);
end;
$$;

create or replace function public.community_admin_block_domain(p_domain text, p_reason text default null, p_remove boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain text := lower(btrim(coalesce(p_domain, '')));
begin
  perform private.community_require_admin();
  if v_domain !~ '^[a-z0-9.-]+\.[a-z]{2,}$' then
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;
  if p_remove then
    delete from public.community_blocked_domains where domain = v_domain;
  else
    insert into public.community_blocked_domains (domain, reason) values (v_domain, left(p_reason, 200)) on conflict do nothing;
  end if;
  perform private.community_log(case when p_remove then 'domain_unblocked' else 'domain_blocked' end, 'domain', null, v_domain);
end;
$$;

-- Destacados: la selección es automática (cron); los administradores pueden retirar o volver a poner un destacado.
create or replace function public.community_admin_set_featured(p_post uuid, p_featured boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.community_require_admin();
  update public.community_posts
  set featured_at = case when p_featured then coalesce(featured_at, now()) else featured_at end,
      featured_removed_at = case when p_featured then null else now() end
  where id = p_post and status = 'published';
  if not found then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  perform private.community_log(case when p_featured then 'feature' else 'unfeature' end, 'post', p_post, null);
end;
$$;

create or replace function public.community_admin_list_featured()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.community_require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'featured_at', p.featured_at, 'removed', p.featured_removed_at is not null,
                                        'likes', p.like_count, 'comments', p.comment_count, 'saves', p.save_count) order by p.featured_at desc)
    from public.community_posts p where p.featured_at is not null and p.status = 'published'
  ), '[]'::jsonb);
end;
$$;

-- Selección automática de destacados (diaria). Puntuación = interacciones ponderadas (me gusta, comentarios x2, guardados x2, familias que importan x3)
-- dividida entre (1 + ln(1 + publicaciones del autor)) para que las cuentas grandes no tapen a las nuevas; ventana de 14 días; mínimo de puntuación y
-- como mucho 5 destacados a la vez. Lo retirado por un administrador no vuelve a destacarse automáticamente.
create or replace function private.community_update_featured()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  update public.community_posts p set featured_at = null
  where p.featured_at is not null and p.featured_removed_at is null and (p.status <> 'published' or p.featured_at < now() - interval '14 days');
  with scored as (
    select p.id,
      (p.like_count + p.comment_count * 2 + p.save_count * 2
        + coalesce((select count(*) from public.community_recipe_imports i where i.recipe_id = p.recipe_id), 0) * 3)
      / (1 + ln(1 + (select count(*) from public.community_posts x where x.author_id = p.author_id and x.status = 'published'))) as score
    from public.community_posts p
    where p.status = 'published' and not p.is_official and p.featured_at is null and p.featured_removed_at is null and p.created_at > now() - interval '14 days'
  )
  update public.community_posts p set featured_at = now()
  from (select id from scored where score >= 5 order by score desc limit 5) top
  where p.id = top.id
    and (select count(*) from public.community_posts f where f.featured_at is not null and f.featured_removed_at is null and f.status = 'published') < 5;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function private.community_update_featured() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Derecho de supresión: solicitar la eliminación del contenido propio (todo o algo concreto) y borrar todo el contenido propio.
-- ---------------------------------------------------------------------------------------------
create or replace function private.community_erase_profile_content(p_cp uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paths text[];
  v_n integer := 0;
  v_k integer;
begin
  select coalesce(array_agg(ph.storage_path), '{}') into v_paths from public.community_post_photos ph join public.community_posts p on p.id = ph.post_id where p.author_id = p_cp;
  perform private.community_queue_media_deletion(v_paths);
  delete from public.community_post_photos ph using public.community_posts p where ph.post_id = p.id and p.author_id = p_cp;
  update public.community_posts set status = 'deleted', title = 'Publicación eliminada', body = '' where author_id = p_cp and status <> 'deleted';
  get diagnostics v_k = row_count;
  v_n := v_n + v_k;
  perform private.community_queue_media_deletion(array(select c.photo_path from public.community_comments c where c.author_id = p_cp and c.photo_path is not null));
  update public.community_comments set status = 'deleted', body = '', photo_path = null where author_id = p_cp and status <> 'deleted';
  get diagnostics v_k = row_count;
  v_n := v_n + v_k;
  -- Recetas públicas del autor: se vacían (ingredientes, pasos, versiones antiguas y foto), no solo se oculta la publicación.
  perform private.community_blank_recipe(r.id) from public.community_recipes r where r.author_id = p_cp;
  delete from public.community_recipe_ratings where profile_id = p_cp;
  -- Datos privados ligados al perfil seudónimo: borradores (con sus fotos), búsquedas, lectura, avisos pendientes, me gusta, guardados y seguimientos.
  perform private.community_purge_private_data(p_cp);
  delete from public.community_post_likes where profile_id = p_cp;
  delete from public.community_comment_likes where profile_id = p_cp;
  return v_n;
end;
$$;
revoke execute on function private.community_erase_profile_content(uuid) from public, anon, authenticated;

-- «Eliminar mis publicaciones y comentarios de Comunidad» (la app lo ofrece al borrar la cuenta y en Ajustes).
create or replace function public.community_delete_my_content()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cp uuid := private.community_cp();
begin
  if v_cp is null then
    return 0;
  end if;
  return private.community_erase_profile_content(v_cp);
end;
$$;

create or replace function public.community_request_content_removal(p_scope text, p_target_type text default null, p_target_id uuid default null, p_detail text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cp uuid := private.community_cp();
  v_id uuid;
begin
  if v_cp is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if p_scope not in ('all_my_content', 'specific') or (p_scope = 'specific' and (p_target_type not in ('post', 'comment') or p_target_id is null)) then
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;
  if (select count(*) from public.community_removal_requests q where q.profile_id = v_cp and q.created_at > now() - interval '1 day') >= 5 then
    raise exception 'RATE_LIMIT' using errcode = 'P0001';
  end if;
  insert into public.community_removal_requests (profile_id, scope, target_type, target_id, detail)
  values (v_cp, p_scope, p_target_type, p_target_id, left(btrim(coalesce(p_detail, '')), 2000))
  returning id into v_id;
  perform private.community_notify_admins('Solicitud de eliminación de contenido', 'Una persona pide eliminar contenido de Comunidad.', '/comunidad/admin', 'removal:' || v_id);
  return v_id;
end;
$$;

create or replace function public.community_admin_list_removal_requests(p_status text default 'open')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.community_require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', q.id, 'scope', q.scope, 'target_type', q.target_type, 'target_id', q.target_id, 'detail', q.detail, 'status', q.status,
                                        'profile_id', q.profile_id, 'alias', cp.alias, 'requester_contact', q.requester_contact, 'created_at', q.created_at) order by q.created_at)
    from public.community_removal_requests q left join public.community_profiles cp on cp.id = q.profile_id where q.status = p_status
  ), '[]'::jsonb);
end;
$$;

create or replace function public.community_admin_handle_removal(p_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.community_removal_requests%rowtype;
begin
  perform private.community_require_admin();
  select * into q from public.community_removal_requests x where x.id = p_id and x.status = 'open' for update;
  if not found then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  if p_approve then
    if q.scope = 'all_my_content' and q.profile_id is not null then
      perform private.community_erase_profile_content(q.profile_id);
    elsif q.target_type = 'post' then
      perform private.community_queue_media_deletion(array(select ph.storage_path from public.community_post_photos ph where ph.post_id = q.target_id));
      delete from public.community_post_photos where post_id = q.target_id;
      update public.community_posts set status = 'deleted', title = 'Publicación eliminada', body = '' where id = q.target_id;
    elsif q.target_type = 'comment' then
      update public.community_comments set status = 'deleted', body = '', photo_path = null where id = q.target_id;
    end if;
  end if;
  update public.community_removal_requests
  set status = case when p_approve then 'done' else 'rejected' end, handled_by = (select auth.uid()), handled_at = now(), handled_note = left(p_note, 500)
  where id = p_id;
  perform private.community_log(case when p_approve then 'removal_done' else 'removal_rejected' end, 'removal_request', p_id, p_note);
  if q.profile_id is not null then
    perform private.community_notify_cp(q.profile_id, 'community_moderation', 'Solicitud de eliminación de contenido',
      case when p_approve then 'Hemos eliminado el contenido que pediste.' else 'No hemos podido eliminar el contenido pedido. ' || coalesce(left(p_note, 200), '') end, '/comunidad', null);
  end if;
end;
$$;

-- Retención del historial de administración (diaria, no editable desde la app).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'community-purge-admin-log') then
    perform cron.unschedule('community-purge-admin-log');
  end if;
  perform cron.schedule('community-purge-admin-log', '50 3 * * 0', 'select private.purge_community_admin_log()');
  if exists (select 1 from cron.job where jobname = 'community-update-featured') then
    perform cron.unschedule('community-update-featured');
  end if;
  perform cron.schedule('community-update-featured', '20 4 * * *', 'select private.community_update_featured()');
end $$;

-- ---------------------------------------------------------------------------------------------
-- Permisos.
-- ---------------------------------------------------------------------------------------------
revoke all on function public.community_report(text, uuid, text, text) from public, anon;
revoke all on function public.community_request_readmission() from public, anon;
revoke all on function public.community_delete_my_content() from public, anon;
revoke all on function public.community_request_content_removal(text, text, uuid, text) from public, anon;
grant execute on function public.community_report(text, uuid, text, text) to authenticated;
grant execute on function public.community_request_readmission() to authenticated;
grant execute on function public.community_delete_my_content() to authenticated;
grant execute on function public.community_request_content_removal(text, text, uuid, text) to authenticated;

revoke all on function public.community_admin_warn(uuid, text) from public, anon;
revoke all on function public.community_admin_revoke_warning(uuid, text) from public, anon;
revoke all on function public.community_admin_ban(uuid, text, integer) from public, anon;
revoke all on function public.community_admin_lift_ban(uuid, text) from public, anon;
revoke all on function public.community_admin_resolve_readmission(uuid, boolean, text) from public, anon;
revoke all on function public.community_admin_overview() from public, anon;
revoke all on function public.community_admin_list_reports(text, integer, integer) from public, anon;
revoke all on function public.community_admin_get_content(text, uuid) from public, anon;
revoke all on function public.community_admin_resolve_content(text, uuid, text, text) from public, anon;
revoke all on function public.community_admin_set_visibility(text, uuid, boolean, text) from public, anon;
revoke all on function public.community_admin_list_hidden(integer) from public, anon;
revoke all on function public.community_admin_list_users(text, integer) from public, anon;
revoke all on function public.community_admin_list_readmissions() from public, anon;
revoke all on function public.community_admin_list_log(integer, integer) from public, anon;
revoke all on function public.community_admin_get_settings() from public, anon;
revoke all on function public.community_admin_set_setting(text, integer) from public, anon;
revoke all on function public.community_admin_block_domain(text, text, boolean) from public, anon;
revoke all on function public.community_admin_set_featured(uuid, boolean) from public, anon;
revoke all on function public.community_admin_list_featured() from public, anon;
revoke all on function public.community_admin_list_removal_requests(text) from public, anon;
revoke all on function public.community_admin_handle_removal(uuid, boolean, text) from public, anon;
grant execute on function public.community_admin_warn(uuid, text) to authenticated;
grant execute on function public.community_admin_revoke_warning(uuid, text) to authenticated;
grant execute on function public.community_admin_ban(uuid, text, integer) to authenticated;
grant execute on function public.community_admin_lift_ban(uuid, text) to authenticated;
grant execute on function public.community_admin_resolve_readmission(uuid, boolean, text) to authenticated;
grant execute on function public.community_admin_overview() to authenticated;
grant execute on function public.community_admin_list_reports(text, integer, integer) to authenticated;
grant execute on function public.community_admin_get_content(text, uuid) to authenticated;
grant execute on function public.community_admin_resolve_content(text, uuid, text, text) to authenticated;
grant execute on function public.community_admin_set_visibility(text, uuid, boolean, text) to authenticated;
grant execute on function public.community_admin_list_hidden(integer) to authenticated;
grant execute on function public.community_admin_list_users(text, integer) to authenticated;
grant execute on function public.community_admin_list_readmissions() to authenticated;
grant execute on function public.community_admin_list_log(integer, integer) to authenticated;
grant execute on function public.community_admin_get_settings() to authenticated;
grant execute on function public.community_admin_set_setting(text, integer) to authenticated;
grant execute on function public.community_admin_block_domain(text, text, boolean) to authenticated;
grant execute on function public.community_admin_set_featured(uuid, boolean) to authenticated;
grant execute on function public.community_admin_list_featured() to authenticated;
grant execute on function public.community_admin_list_removal_requests(text) to authenticated;
grant execute on function public.community_admin_handle_removal(uuid, boolean, text) to authenticated;

-- Mis solicitudes de eliminación de contenido (para enseñar su estado) y mis comentarios (para poder pedir la eliminación de uno concreto).
create or replace function public.community_list_my_removal_requests()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'scope', q.scope, 'target_type', q.target_type, 'target_id', q.target_id, 'detail', q.detail,
                                               'status', q.status, 'handled_note', q.handled_note, 'created_at', q.created_at, 'handled_at', q.handled_at) order by q.created_at desc), '[]'::jsonb)
  from public.community_removal_requests q where q.profile_id = private.community_cp()
$$;

create or replace function public.community_list_my_comments(p_limit integer default 30, p_offset integer default 0)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'post_id', c.post_id, 'excerpt', left(c.body, 120), 'created_at', c.created_at,
                                               'post_title', (select p.title from public.community_posts p where p.id = c.post_id)) order by c.created_at desc), '[]'::jsonb)
  from (select * from public.community_comments x where x.author_id = private.community_cp() and x.status = 'published'
        order by x.created_at desc limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0)) c
$$;

revoke all on function public.community_list_my_removal_requests() from public, anon;
revoke all on function public.community_list_my_comments(integer, integer) from public, anon;
grant execute on function public.community_list_my_removal_requests() to authenticated;
grant execute on function public.community_list_my_comments(integer, integer) to authenticated;
