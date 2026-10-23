-- Vuelve a la resolución de 0143 (solo cadenas aprendibles) y retira lo creado en 0308.
drop trigger if exists products_shared_vote on public.products;
drop function if exists public.products_shared_vote_trigger();
drop function if exists public.shared_refresh_vote(uuid, text);
drop function if exists public.shared_general_level(text);
drop function if exists public.shared_family_hash(uuid);
drop function if exists public.shared_text_key_ok(text);
drop table if exists public.shared_product_general_review;
drop table if exists public.shared_product_confirmations;
-- Restaurar resolve_shared_product_class: volver a ejecutar su definición de 0143_shared_product_learning.sql.
