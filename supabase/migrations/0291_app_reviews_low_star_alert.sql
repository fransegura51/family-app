-- Aviso a la dueña de la app cuando llega una valoración de 1 o 2 estrellas (Reseñas y opiniones, 0290), para ver dónde se está fallando.
-- Usa el centro de avisos de siempre (0260: private.notify_user): queda en el historial de la campana y se manda el push solo a las cuentas dueñas
-- (profiles.is_app_owner). Se avisa al dejar la valoración, al bajarla a 1-2 estrellas y cuando alguien cambia su comentario de una valoración baja (una
-- clave anti-repeticiones por estrellas+comentario evita avisar dos veces de lo mismo). Nunca falla la valoración por no poder avisar.
-- Solo aditiva: una función y un disparador nuevos; ninguna tabla existente cambia.

create or replace function private.app_reviews_low_star_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner record;
  v_family text;
  v_section text;
  v_text text;
  v_key text;
begin
  -- Una actualización que no cambia ni las estrellas ni el comentario (por ejemplo, solo la fecha) no avisa otra vez.
  if tg_op = 'UPDATE' and (old.stars, old.liked, old.disliked) is not distinct from (new.stars, new.liked, new.disliked) then
    return null;
  end if;
  v_key := 'review-low:' || new.id::text || ':' || new.stars::text || ':' || md5(coalesce(new.liked, '') || '|' || coalesce(new.disliked, ''));
  select coalesce(f.name, 'Una familia') into v_family from public.families f where f.id = new.family_id;
  v_section := case new.section
    when 'general' then 'la app en general'
    when 'inicio' then 'Inicio'
    when 'familia' then 'Familia'
    when 'calendario' then 'Calendario'
    when 'eventos' then 'Eventos'
    when 'puntos' then 'Pequeños Grandes'
    when 'compras' then 'Compras'
    when 'alimentacion' then 'La cocina de Pepa'
    when 'dinero' then 'Economía'
    when 'ubicacion' then 'Ubicación'
    when 'cumpleanos' then 'Cumpleaños'
    when 'contactos' then 'Contactos'
    when 'galeria' then 'Galería'
    when 'documentos' then 'Documentos'
    else new.section
  end;
  v_text := left(trim(both ' ' from coalesce('No me gusta: ' || nullif(trim(new.disliked), ''), '') || case when new.disliked is not null and new.liked is not null then ' · ' else '' end || coalesce('Me gusta: ' || nullif(trim(new.liked), ''), '')), 200);

  for v_owner in select p.id from public.profiles p where p.is_app_owner loop
    begin
      perform private.notify_user(
        v_owner.id,
        'other',
        'resenas',
        '⭐ ' || new.stars::text || ' ' || case when new.stars = 1 then 'estrella' else 'estrellas' end || ' en ' || v_section,
        v_family || case when v_text = '' then '' else ': ' || v_text end,
        '/resenas',
        'resenas-bajas',
        v_key || ':' || v_owner.id::text,
        true
      );
    exception when others then
      raise warning 'app_reviews_low_star_notify: %', sqlerrm;
    end;
  end loop;
  return null;
end;
$$;
revoke execute on function private.app_reviews_low_star_notify() from public, anon, authenticated;

create trigger app_reviews_low_star_notify
  after insert or update of stars, liked, disliked on public.app_reviews
  for each row
  when (new.stars <= 2)
  execute function private.app_reviews_low_star_notify();
