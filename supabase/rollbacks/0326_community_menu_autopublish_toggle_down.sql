-- Deshace 0326: quita la función; el ajuste weekly_menu_autopublish se queda como esté (para apagarlo: update public.community_settings set value = '0' where key = 'weekly_menu_autopublish').
drop function if exists public.community_admin_set_menu_autopublish(boolean);
