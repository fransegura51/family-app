-- Rollback de 0239_wishlists.sql.
drop policy if exists "wishlist_items storage: family delete" on storage.objects;
drop policy if exists "wishlist_items storage: family insert" on storage.objects;
drop policy if exists "wishlist_items storage: family select" on storage.objects;
delete from storage.buckets where id = 'wishlist_items';

drop function if exists public.regenerate_wishlist_guest_token(uuid);
drop function if exists public.generate_wishlist_guest_token(uuid);

drop table if exists wishlist_item_reservations;
drop table if exists wishlist_items;
drop table if exists wishlists;
