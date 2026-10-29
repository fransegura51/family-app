-- Deshacer 0351: elimina las copias pendientes y las funciones. NO borra los grupos ya copiados.
drop function if exists public.accept_group_transfer(text);
drop function if exists public.preview_group_transfer(text);
drop function if exists public.cancel_group_transfer(uuid);
drop function if exists public.create_group_transfer(uuid, text, boolean, boolean);
drop function if exists private.group_transfer_lookup(text);
drop table if exists public.group_transfer_attempts;
drop table if exists public.group_transfers;
