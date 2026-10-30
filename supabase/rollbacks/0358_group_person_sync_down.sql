-- Revierte 0358: las fichas dejan de sincronizarse (conservan los datos que tengan).
drop trigger if exists trg_group_participants_person_push on public.group_participants;
drop trigger if exists trg_group_participants_person_sync on public.group_participants;
drop function if exists private.group_participants_person_push();
drop function if exists private.group_participants_person_sync();
drop function if exists private.person_sheet_ok(uuid);
