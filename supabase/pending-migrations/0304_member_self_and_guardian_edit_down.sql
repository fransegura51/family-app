-- Deshace 0304: quita las dos funciones. Las fichas vuelven a poder editarse solo por la administración (política de 0001, que 0304 no toca).
drop function if exists public.update_member_card(uuid, text, text, date, text);
drop function if exists public.set_member_photo(uuid, text);
