-- Advisor de rendimiento (Supabase) tras las migraciones 0239-0241 — foreign keys sin índice que las
-- cubra en las tablas nuevas de esta tanda. Mismo criterio que el resto de la app tras el pase de
-- escalado (scale_rls_initplan): cada columna que participa en RLS o en una consulta habitual lleva su
-- propio índice.
create index if not exists idx_kid_wallet_transactions_requested_by on kid_wallet_transactions(requested_by);
create index if not exists idx_kid_wallet_transactions_decided_by on kid_wallet_transactions(decided_by);
create index if not exists idx_family_tax_fund_expenses_created_by on family_tax_fund_expenses(created_by);
create index if not exists idx_wishlists_created_by on wishlists(created_by);
create index if not exists idx_wishlist_items_family on wishlist_items(family_id);
create index if not exists idx_wishlist_item_reservations_reserved_by_member on wishlist_item_reservations(reserved_by_member_id);
