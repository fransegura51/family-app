-- Las funciones de disparador de Mis listas no se llaman a mano: sin permiso de ejecución para nadie (los disparadores no lo necesitan).
-- Aplicada justo después de 0321 (mismo criterio que 0312b). Deshacer: volver a conceder execute (no hace falta; no cambia datos).
revoke execute on function private.list_touch() from public, anon, authenticated;
revoke execute on function private.list_item_done_at() from public, anon, authenticated;
revoke execute on function private.sync_shopping_to_lists() from public, anon, authenticated;
