-- Deshace 0319_mis_listas.sql. ATENCIÓN: borra las listas, carpetas, elementos y vínculos de Mis listas (no toca Compras ni Calendario:
-- los productos ya enviados a la compra y los eventos siguen donde están). Hacer copia antes si ya hay listas reales.
drop trigger if exists trg_shopping_to_lists on public.shopping_items;
drop function if exists private.sync_shopping_to_lists();
drop function if exists public.enviar_a_compras(jsonb);
drop function if exists public.replace_list_items(uuid, jsonb);
drop table if exists public.list_shopping_links;
drop table if exists public.list_calendar_links;
drop table if exists public.list_items;
drop table if exists public.list_columns;
drop table if exists public.user_lists;
drop table if exists public.list_folders;
drop function if exists private.list_item_done_at();
drop function if exists private.list_touch();
drop function if exists private.folder_is_mine(uuid);
drop function if exists private.list_accessible(uuid);
