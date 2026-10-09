revoke all on function register_kid_income(uuid, numeric, text) from authenticated;
drop function if exists register_kid_income(uuid, numeric, text);

drop table if exists kid_income_split_configs;

drop index if exists idx_kid_wallet_transactions_source_income;
alter table kid_wallet_transactions drop column if exists source_income_id;
