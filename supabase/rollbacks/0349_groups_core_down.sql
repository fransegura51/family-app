-- Deshacer 0349. DESTRUCTIVO: borra grupos, participantes y vínculos. Solo antes de que existan datos reales (y después de 0350-0352).
alter table public.event_guests drop column if exists group_participant_id;
alter table public.event_guests drop column if exists group_id;
drop table if exists public.group_audit;
drop table if exists public.group_event_links;
drop table if exists public.group_list_links;
drop table if exists public.group_participants;
drop table if exists public.group_placements;
drop table if exists public.group_managers;
drop table if exists public.groups;
drop table if exists public.group_folders;
drop function if exists private.group_audit_trg();
drop function if exists private.groups_add_creator();
drop function if exists private.group_participants_guard();
drop function if exists private.groups_touch();
drop function if exists private.group_candidate_ok(uuid, uuid);
drop function if exists private.folder_is_mine_g(uuid);
drop function if exists private.group_can(uuid);
drop function if exists private.groups_user_ok();
