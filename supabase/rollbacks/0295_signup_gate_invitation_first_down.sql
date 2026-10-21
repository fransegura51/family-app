-- Deshacer 0295. ANTES, desactivar el gancho en Supabase (Authentication → Hooks → Before User Created → desactivar): es instantáneo y devuelve el alta a como estaba.
drop function if exists private.purge_orphan_logins(interval);
drop function if exists public.hook_before_user_created(jsonb);
drop function if exists public.check_invitation(text);
drop function if exists private.invitation_throttle(text, int);
drop table if exists private.invitation_attempts;
