-- Rollback de 0242_pg_f8_f11_and_wishlist_fk_indexes.sql.
drop index if exists idx_wishlist_item_reservations_reserved_by_member;
drop index if exists idx_wishlist_items_family;
drop index if exists idx_wishlists_created_by;
drop index if exists idx_family_tax_fund_expenses_created_by;
drop index if exists idx_kid_wallet_transactions_decided_by;
drop index if exists idx_kid_wallet_transactions_requested_by;
