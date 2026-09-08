-- El buzón de sugerencias (0078) deja ver la fila entera de otras
-- familias a la familia dueña, pero "families" tiene su propia RLS
-- (solo la propia fila) — sin esto, el nombre de la familia que dejó
-- cada sugerencia no se podría mostrar en la bandeja de la dueña.
-- Mismo patrón que get_app_secret: SECURITY DEFINER muy acotado, solo
-- devuelve el nombre (nunca amazon_webhook_token ni nada más de esa
-- fila) y solo si quien llama es la familia dueña.
create or replace function public.get_family_name_for_suggestion(p_family_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select name from families
  where id = p_family_id
    and private.current_family_id() = '011429a4-4fd8-4341-9c04-ec6b2f585196'
$$;

revoke all on function public.get_family_name_for_suggestion(uuid) from public, anon;
grant execute on function public.get_family_name_for_suggestion(uuid) to authenticated;
