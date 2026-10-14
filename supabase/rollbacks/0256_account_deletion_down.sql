-- Deshace 0256: la app deja de poder borrar cuentas (la función de servidor «delete-account» dejaría de funcionar).
drop function if exists public.family_storage_paths(uuid);
drop function if exists public.delete_account_prepare(uuid);
