-- Deshacer 0300: quita el vínculo parental (tabla, historial y funciones). Si ya hay vínculos declarados se pierden; copiar antes si hiciera falta:
--   create table pg_temp.copia_vinculos as select * from public.family_member_guardians;
drop function if exists public.revoke_own_guardianship(uuid, text);
drop function if exists public.declare_guardianship(uuid, text, boolean, text);
drop function if exists private.is_active_guardian_of(uuid);
drop function if exists private.member_is_minor(uuid);
drop table if exists public.family_guardian_events;
drop table if exists public.family_member_guardians;
