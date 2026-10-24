-- Peso objetivo: fijarlo fallaba para quien no fuese administrador/a porque family_members solo deja UPDATE al admin (0001).
-- Esta función deja fijar el objetivo a: la administración, la propia persona (su ficha vinculada a su cuenta) y cualquier miembro de la familia
-- cuando la ficha no tiene cuenta propia (niños y bebés, que gestiona la familia). Nada más cambia: no se abre UPDATE general.
create or replace function public.set_member_weight_goal(p_member_id uuid, p_goal_kg numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m family_members%rowtype;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if p_goal_kg is not null and p_goal_kg <= 0 then raise exception 'El peso objetivo debe ser mayor que 0'; end if;
  select * into m from family_members where id = p_member_id and family_id = private.current_family_id();
  if not found then raise exception 'Miembro no encontrado'; end if;
  if not (private.current_role_in_family() = 'admin' or m.linked_profile_id = auth.uid() or m.linked_profile_id is null) then
    raise exception 'No tienes permiso para cambiar el objetivo de otra persona con cuenta propia';
  end if;
  update family_members set weight_goal_kg = p_goal_kg where id = p_member_id;
end;
$$;
revoke execute on function public.set_member_weight_goal(uuid, numeric) from public, anon;
grant execute on function public.set_member_weight_goal(uuid, numeric) to authenticated;
