-- Deshacer 0355. Borra las invitaciones; los responsables ya incorporados se conservan.
drop function if exists public.group_manager_names(uuid);
drop function if exists public.accept_group_manager_invite(text);
drop function if exists public.preview_group_manager_invite(text);
drop function if exists private.group_manager_invite_lookup(text, boolean);
drop function if exists public.revoke_group_manager_invite(uuid);
drop function if exists public.create_group_manager_invite(uuid);
drop table if exists public.group_manager_invites;
