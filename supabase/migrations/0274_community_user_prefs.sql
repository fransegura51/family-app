-- COMUNIDAD PEPA — preferencias de lectura de cada persona (se sincronizan entre sus dispositivos):
--  · orden de los comentarios: más antiguos primero (por defecto), más recientes o más útiles (se puede cambiar temporalmente dentro de una conversación);
--  · plegar los comentarios ya leídos (preferencia INDEPENDIENTE del orden).
-- Viven aparte de los ajustes de avisos (user_notification_prefs) porque no son avisos.

create table public.community_user_prefs (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  comment_order text not null default 'antiguos' check (comment_order in ('antiguos', 'recientes', 'utiles')),
  fold_read_comments boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.community_user_prefs enable row level security;
revoke all on public.community_user_prefs from anon, authenticated;

create or replace function public.community_get_user_prefs()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object('comment_order', p.comment_order, 'fold_read_comments', p.fold_read_comments) from public.community_user_prefs p where p.profile_id = (select auth.uid())),
    jsonb_build_object('comment_order', 'antiguos', 'fold_read_comments', true))
$$;

create or replace function public.community_set_user_prefs(p_comment_order text default null, p_fold_read boolean default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.community_require_participation_access();
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if p_comment_order is not null and p_comment_order not in ('antiguos', 'recientes', 'utiles') then
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;
  insert into public.community_user_prefs (profile_id, comment_order, fold_read_comments)
  values ((select auth.uid()), coalesce(p_comment_order, 'antiguos'), coalesce(p_fold_read, true))
  on conflict (profile_id) do update
    set comment_order = coalesce(p_comment_order, public.community_user_prefs.comment_order),
        fold_read_comments = coalesce(p_fold_read, public.community_user_prefs.fold_read_comments),
        updated_at = now();
  return public.community_get_user_prefs();
end;
$$;

revoke all on function public.community_get_user_prefs() from public, anon;
revoke all on function public.community_set_user_prefs(text, boolean) from public, anon;
grant execute on function public.community_get_user_prefs() to authenticated;
grant execute on function public.community_set_user_prefs(text, boolean) to authenticated;
