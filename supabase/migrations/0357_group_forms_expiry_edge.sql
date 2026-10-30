-- 0357 · «Solicitar datos»: un dato delicado deja de ser legible el propio día de su fecha de eliminación (la limpieza diaria lo borra de madrugada ese mismo día).
-- Antes seguía legible todo ese día. Solo cambia la comparación de fechas de read_form_sensitive.
-- Deshacer: volver a la definición de 0356 (expires_at >= current_date).
create or replace function public.read_form_sensitive(p_response uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form uuid;
  v_out jsonb;
begin
  select form_id into v_form from group_form_responses where id = p_response;
  if v_form is null or not private.form_is_creator(v_form) then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('fieldId', field_id, 'value', value, 'expiresAt', expires_at) order by created_at), '[]'::jsonb) into v_out
    from group_form_sensitive where response_id = p_response and expires_at > current_date;
  insert into group_form_access_log (form_id, response_id, action) values (v_form, p_response, 'read');
  return v_out;
end;
$$;
revoke all on function public.read_form_sensitive(uuid) from public, anon;
grant execute on function public.read_form_sensitive(uuid) to authenticated;
