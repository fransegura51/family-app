-- Deshacer 0291: quita el aviso de valoraciones de 1 o 2 estrellas (las valoraciones guardadas no se tocan).
drop trigger if exists app_reviews_low_star_notify on public.app_reviews;
drop function if exists private.app_reviews_low_star_notify();
