-- 0306 · Ayuda «Pepa te acompaña» (B3/B4): valoraciones «¿Te ha servido?» AGREGADAS y claves de preferencias de la Ayuda y los tutoriales.
--
-- PENDIENTE DE AUTORIZACIÓN: no se aplica en producción hasta que lo autorice la persona responsable. Mientras no esté aplicada, la web NO la usa (interruptores
-- HELP_FEEDBACK_ENABLED y HELP_PREFS_SYNC_ENABLED apagados): la Ayuda funciona entera y las preferencias de Ayuda se guardan solo en cada dispositivo.
--
-- 1) Lista cerrada de claves de preferencias (CONFIG-01): se añaden las cuatro de la Ayuda (modo de voz, bienvenida, sugerencias de primera visita y progreso de tutoriales).
--    DEBE coincidir con SYNCED_KEY_PATTERN_SOURCES + HELP_PREF_PATTERN_SOURCES de src/state/prefs/prefsRegistry.ts (lo comprueba una prueba).
-- 2) Valoraciones: contadores por ficha y día (sí / no). NO se guarda quién respondió, ni la pregunta, ni nada de la conversación. La tabla no tiene políticas: nadie la lee ni la
--    escribe directamente; solo las dos funciones de abajo (una para valorar, otra —solo para las cuentas propietarias de PEPA— para ver el resumen).
begin;

create or replace function private.user_pref_key_allowed(p_key text)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select p_key is not null
     and length(p_key) between 1 and 120
     and p_key ~ any (array[
       '^familyapp:(alimentacion|calendario|compras|economia|ubicacion)-menu-layout$',
       '^familyapp:(alimentacion|calendario|community|compras|economia|ubicacion)-pinned-tabs$',
       '^familyapp:community-menu-order$',
       '^familyapp:(color-theme|chart-color-theme|home-card-order|home-carousel|movement-color-mode|voice-response-mode)$',
       '^familyapp:tab-order:[A-Za-z0-9_-]+$',
       '^pepa:(auto-confirm|show-classic-buttons)$',
       '^familyapp:calendar-onboarding-seen:[A-Za-z0-9_-]+$',
       '^familyapp:kids-(theme|sprite):[A-Za-z0-9_-]+$',
       '^pepa\.eventMenuView$',
       '^pepa\.reviewInvite\.until$',
       '^pepa:help-voice-mode$',
       '^pepa:help-welcome$',
       '^pepa:help-hint:[a-z0-9-]+$',
       '^pepa:help-tour:[a-z0-9-]+$'
     ])
$function$;
revoke all on function private.user_pref_key_allowed(text) from public, anon, authenticated;

create table if not exists public.help_feedback_daily (
  day date not null,
  card_id text not null check (card_id ~ '^[a-z0-9:-]{3,60}$'),
  useful integer not null default 0 check (useful >= 0),
  not_useful integer not null default 0 check (not_useful >= 0),
  primary key (day, card_id)
);
alter table public.help_feedback_daily enable row level security;
revoke all on public.help_feedback_daily from public, anon, authenticated;

-- Valorar una ficha: suma un sí o un no al contador del día. Tope de 300 fichas distintas al día (una cuenta no puede llenar la tabla inventando identificadores).
create or replace function public.record_help_feedback(p_card_id text, p_useful boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_card_id is null or p_card_id !~ '^[a-z0-9:-]{3,60}$' or p_useful is null then
    raise exception 'INVALID_CARD';
  end if;
  if not exists (select 1 from public.help_feedback_daily d where d.day = current_date and d.card_id = p_card_id)
     and (select count(*) from public.help_feedback_daily d where d.day = current_date) >= 300 then
    return; -- tope diario de fichas distintas: se ignora en silencio
  end if;
  insert into public.help_feedback_daily as d (day, card_id, useful, not_useful)
  values (current_date, p_card_id, case when p_useful then 1 else 0 end, case when p_useful then 0 else 1 end)
  on conflict (day, card_id) do update
    set useful = d.useful + excluded.useful,
        not_useful = d.not_useful + excluded.not_useful;
end;
$function$;
revoke execute on function public.record_help_feedback(text, boolean) from public, anon;
grant execute on function public.record_help_feedback(text, boolean) to authenticated;

-- Resumen para el Centro de Administración: solo las cuentas propietarias de PEPA (am_i_app_owner); cualquier otra recibe 0 filas.
create or replace function public.help_feedback_summary(p_days integer default 30)
returns table (card_id text, useful bigint, not_useful bigint)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not coalesce(public.am_i_app_owner(), false) then
    return;
  end if;
  return query
    select d.card_id, sum(d.useful)::bigint, sum(d.not_useful)::bigint
      from public.help_feedback_daily d
     where d.day >= current_date - greatest(1, least(coalesce(p_days, 30), 365))
     group by d.card_id
     order by sum(d.useful + d.not_useful) desc, d.card_id;
end;
$function$;
revoke execute on function public.help_feedback_summary(integer) from public, anon;
grant execute on function public.help_feedback_summary(integer) to authenticated;

commit;
