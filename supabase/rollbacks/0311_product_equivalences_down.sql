-- Retira las equivalencias de productos (0311). Los productos y precios de las familias no se tocan.
drop function if exists public.resolve_shared_equivalences(text[]);
drop trigger if exists product_equivalences_vote on public.product_equivalences;
drop function if exists public.product_equivalences_vote();
drop table if exists public.shared_equivalence_votes;
drop trigger if exists product_equivalences_guard on public.product_equivalences;
drop function if exists public.product_equivalences_guard();
drop table if exists public.product_equivalences;
