-- «Propón un tema»: agradecimiento público OPCIONAL, vínculo editorial con el artículo y aviso privado cuando la idea se publica.
--
-- · `credit_consent` (por propuesta, desmarcado por defecto): la persona acepta que, si su idea se convierte en artículo, se la mencione con su ALIAS PÚBLICO. Se guarda al enviar la propuesta
--   y NO se aplica con efecto retroactivo: repetir una propuesta ya enviada no cambia su consentimiento, y las propuestas anteriores a esta migración quedan sin consentimiento.
-- · Vínculo editorial: `community_admin_topic_proposals_to_draft` ya enlaza el grupo con el borrador que crea (item_id). Ahora también se puede enlazar (y desenlazar, mientras no esté
--   publicado) un grupo con OTRO artículo oficial: community_admin_link_topic_proposals / community_admin_unlink_topic_proposals. Nada se enlaza solo.
-- · Agradecimiento en el artículo: community_admin_add_credit(item) añade al final del BORRADOR la línea «❤️ Este artículo nació de una idea de @Alias…» SOLO con los alias públicos de
--   quienes aceptaron, y solo de propuestas enlazadas a ese artículo. Pasa por la edición editorial normal (versión nueva, vuelve a requerir aprobación): no publica nada.
-- · Aviso: al publicarse un artículo enlazado a propuestas, cada persona que propuso recibe UN aviso privado («🎉 ¡Tu idea ya es un artículo!») con enlace, haya aceptado o no el
--   agradecimiento. `notified_at` y la clave de aviso evitan duplicados. Se envía también si se enlaza a un artículo que ya estaba publicado.
-- Deshacer: supabase/rollbacks/0289_community_topic_proposal_credit_down.sql.

alter table public.community_topic_proposals add column if not exists credit_consent boolean not null default false;
alter table public.community_topic_proposals add column if not exists notified_at timestamptz;

-- Proponer un tema: ahora con el consentimiento opcional de agradecimiento.
drop function if exists public.community_propose_topic(text, text);

create or replace function public.community_propose_topic(p_topic text, p_text text, p_credit boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cp uuid;
  v_text text;
  v_norm text;
  v_id uuid;
begin
  perform private.community_require_reader();
  perform private.community_require_participation_access();
  v_cp := private.community_require_participant();
  if not exists (select 1 from public.community_topics t where t.id = p_topic) then
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;
  v_text := private.community_clean_text(p_text, 200, true);
  if char_length(v_text) < 8 then
    raise exception 'TEXT_REQUIRED' using errcode = 'P0001';
  end if;
  v_norm := regexp_replace(private.community_menu_norm(v_text), '[^a-z0-9 ]', '', 'g');
  v_norm := btrim(regexp_replace(v_norm, '\s+', ' ', 'g'));
  -- Repetir una propuesta ya enviada no la duplica ni cambia su consentimiento (nada es retroactivo).
  select id into v_id from public.community_topic_proposals x where x.profile_id = v_cp and x.norm_key = v_norm and x.status = 'new';
  if v_id is not null then
    return v_id;
  end if;
  if (select count(*) from public.community_topic_proposals x where x.profile_id = v_cp and x.created_at > now() - interval '1 day') >= 5 then
    raise exception 'RATE_LIMIT' using errcode = 'P0001';
  end if;
  insert into public.community_topic_proposals (profile_id, topic_id, text, norm_key, group_key, credit_consent)
  values (v_cp, p_topic, v_text, v_norm, v_norm, coalesce(p_credit, false))
  returning id into v_id;
  return v_id;
end;
$$;

-- Aviso privado a quienes propusieron una idea que ya es un artículo publicado (una sola vez por persona y artículo).
create or replace function private.community_notify_idea_published(p_item uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.community_official_items%rowtype;
  r record;
  v_n integer := 0;
begin
  select * into i from public.community_official_items x where x.id = p_item;
  if not found or i.published_post_id is null then
    return 0;
  end if;
  for r in select distinct x.profile_id from public.community_topic_proposals x where x.item_id = p_item and x.notified_at is null loop
    perform private.community_notify_cp(
      r.profile_id, 'community_idea_published',
      '🎉 ¡Tu idea ya es un artículo!',
      'Pepa ha publicado «' || left(i.title, 140) || '» a partir de tu propuesta. ¡Gracias por tu aportación!',
      '/comunidad/p/' || i.published_post_id,
      'idea-published:' || p_item || ':' || r.profile_id);
    v_n := v_n + 1;
  end loop;
  update public.community_topic_proposals set notified_at = now() where item_id = p_item and notified_at is null;
  return v_n;
end;
$$;
revoke execute on function private.community_notify_idea_published(uuid) from public, anon, authenticated;

create or replace function private.community_idea_published_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.published_post_id is not null and old.published_post_id is null then
    begin
      perform private.community_notify_idea_published(new.id);
    exception when others then
      -- Un fallo al avisar nunca debe impedir publicar el artículo.
      raise warning 'community_idea_published: %', sqlerrm;
    end;
  end if;
  return null;
end;
$$;
revoke execute on function private.community_idea_published_trigger() from public, anon, authenticated;

drop trigger if exists community_idea_published on public.community_official_items;
create trigger community_idea_published
  after update of published_post_id on public.community_official_items
  for each row execute function private.community_idea_published_trigger();

-- Administración: igual que antes + cuántas personas aceptaron el agradecimiento (sin decir quiénes) y el artículo enlazado.
create or replace function public.community_admin_list_topic_proposals(p_status text default 'new')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.community_require_admin();
  if p_status not in ('new', 'drafted', 'dismissed') then
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(g.item order by g.people desc, g.last_at desc)
    from (
      select count(distinct x.profile_id) as people, max(x.created_at) as last_at,
             jsonb_build_object(
               'group_key', x.group_key,
               'label', coalesce(max(x.group_label), (array_agg(x.text order by x.created_at))[1]),
               'topic_id', (array_agg(x.topic_id order by x.created_at))[1],
               'topic_label', (select t.label from public.community_topics t where t.id = (array_agg(x.topic_id order by x.created_at))[1]),
               'people', count(distinct x.profile_id),
               'proposals', count(*),
               'first_at', min(x.created_at),
               'last_at', max(x.created_at),
               'texts', (select coalesce(jsonb_agg(d.text), '[]'::jsonb) from (select distinct y.text from public.community_topic_proposals y where y.group_key = x.group_key and y.status = p_status limit 6) d),
               'ids', jsonb_agg(x.id),
               'item_id', max(x.item_id::text),
               'credit_people', count(distinct x.profile_id) filter (where x.credit_consent),
               'item_title', (select i.title from public.community_official_items i where i.id::text = max(x.item_id::text)),
               'item_status', (select i.status from public.community_official_items i where i.id::text = max(x.item_id::text)),
               'notified', bool_and(x.notified_at is not null)) as item
      from public.community_topic_proposals x
      where x.status = p_status
      group by x.group_key
      order by count(distinct x.profile_id) desc, max(x.created_at) desc
      limit 200
    ) g
  ), '[]'::jsonb);
end;
$$;

-- Enlazar un grupo de propuestas con un artículo oficial concreto (decisión editorial explícita; no se enlaza solo).
create or replace function public.community_admin_link_topic_proposals(p_group_key text, p_item uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.community_official_items%rowtype;
  v_n integer;
begin
  perform private.community_require_admin();
  select * into i from public.community_official_items x where x.id = p_item and x.kind in ('article', 'tip') and x.status <> 'rejected';
  if not found then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  update public.community_topic_proposals
  set item_id = p_item, status = 'drafted', handled_by = (select auth.uid()), handled_at = coalesce(handled_at, now())
  where group_key = p_group_key and status in ('new', 'drafted') and notified_at is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  perform private.community_log('topic_proposals_linked', 'official_item', p_item, i.title);
  -- Si el artículo ya está publicado, se avisa ahora a quienes propusieron la idea.
  if i.published_post_id is not null then
    perform private.community_notify_idea_published(p_item);
  end if;
  return v_n;
end;
$$;

-- Deshacer un vínculo equivocado (solo mientras el artículo no esté publicado y nadie haya sido avisado).
create or replace function public.community_admin_unlink_topic_proposals(p_group_key text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  perform private.community_require_admin();
  update public.community_topic_proposals x
  set item_id = null, status = 'new', handled_by = null, handled_at = null
  where x.group_key = p_group_key and x.status = 'drafted' and x.notified_at is null
    and not exists (select 1 from public.community_official_items i where i.id = x.item_id and i.published_post_id is not null);
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  perform private.community_log('topic_proposals_unlinked', 'topic_proposal', null, p_group_key);
  return v_n;
end;
$$;

-- Añade al final del BORRADOR la línea de agradecimiento con los alias públicos de quienes lo aceptaron. Solo propuestas enlazadas a ese artículo; solo antes de publicar.
create or replace function public.community_admin_add_credit(p_item uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.community_official_items%rowtype;
  v_aliases text[];
  v_line text;
  v_who text;
  v_body text;
begin
  perform private.community_require_admin();
  select * into i from public.community_official_items x where x.id = p_item and x.status in ('proposed', 'approved') and x.published_post_id is null;
  if not found then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  select array_agg(a.alias order by a.alias) into v_aliases from (
    select distinct cp.alias
    from public.community_topic_proposals x
    join public.community_profiles cp on cp.id = x.profile_id
    where x.item_id = p_item and x.credit_consent and cp.deleted_at is null and cp.alias is not null and btrim(cp.alias) <> '' and not cp.is_official
  ) a;
  if v_aliases is null or cardinality(v_aliases) = 0 then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  select string_agg('@' || a, ', ' order by a) into v_who from unnest(v_aliases[1:greatest(cardinality(v_aliases) - 1, 1)]) a;
  if cardinality(v_aliases) = 1 then
    v_line := '❤️ Este artículo nació de una idea de @' || v_aliases[1] || '. ¡Gracias por ayudarnos a hacer crecer Comunidad PEPA!';
  else
    v_line := '❤️ Este artículo nació de ideas de ' || v_who || ' y @' || v_aliases[cardinality(v_aliases)] || '. ¡Gracias por ayudarnos a hacer crecer Comunidad PEPA!';
  end if;
  -- Si ya llevaba una línea de agradecimiento al final, se sustituye (no se duplica).
  v_body := btrim(regexp_replace(i.body, E'\\n*❤️ Este artículo nació de[^\\n]*\\s*$', ''), E' \n');
  v_body := v_body || E'\n\n' || v_line;
  perform public.community_admin_edit_proposal(p_item, i.title, v_body);
  return jsonb_build_object('line', v_line, 'aliases', cardinality(v_aliases));
end;
$$;

revoke all on function public.community_propose_topic(text, text, boolean) from public, anon;
revoke all on function public.community_admin_list_topic_proposals(text) from public, anon;
revoke all on function public.community_admin_link_topic_proposals(text, uuid) from public, anon;
revoke all on function public.community_admin_unlink_topic_proposals(text) from public, anon;
revoke all on function public.community_admin_add_credit(uuid) from public, anon;
grant execute on function public.community_propose_topic(text, text, boolean) to authenticated;
grant execute on function public.community_admin_list_topic_proposals(text) to authenticated;
grant execute on function public.community_admin_link_topic_proposals(text, uuid) to authenticated;
grant execute on function public.community_admin_unlink_topic_proposals(text) to authenticated;
grant execute on function public.community_admin_add_credit(uuid) to authenticated;
