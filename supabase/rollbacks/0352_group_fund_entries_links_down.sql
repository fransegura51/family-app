-- Deshacer 0352. DESTRUCTIVO para los enlaces y avisos de pago (no para los botes ni los apuntes).
drop function if exists public.add_fund_entry(uuid, text, numeric, date, text, text, text, text, uuid, jsonb);
drop function if exists public.set_entry_allocations(uuid, jsonb);
drop table if exists public.fund_payment_notices;
drop table if exists public.fund_share_links;
drop function if exists private.fund_share_links_guard();
drop function if exists private.fund_notices_guard();
