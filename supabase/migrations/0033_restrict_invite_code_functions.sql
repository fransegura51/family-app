-- Ambas funciones ya comprueban auth.uid() por dentro, pero no hay
-- ninguna razón para que una sesión NI SIQUIERA logueada (rol anon)
-- pueda llamarlas — mismo criterio que create_family, que solo es
-- ejecutable por authenticated.
revoke execute on function public.generate_member_invite_code(uuid) from anon, public;
revoke execute on function public.join_family_with_code(text, text) from anon, public;
grant execute on function public.generate_member_invite_code(uuid) to authenticated;
grant execute on function public.join_family_with_code(text, text) to authenticated;
