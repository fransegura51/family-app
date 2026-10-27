-- Rollback de 0333: quita las propuestas pendientes de PEPA (los grupos y artículos confirmados por la familia se conservan).
delete from public.common_product_members m using public.common_products c where c.id = m.common_id and c.status = 'pending';
delete from public.common_products where status = 'pending';
drop table if exists public.common_product_auto_rejects;
drop function if exists public.common_product_auto_rejects_guard();
alter table public.common_product_members drop constraint if exists common_product_members_source_check;
alter table public.common_product_members add constraint common_product_members_source_check check (source in ('sugerido', 'manual', 'auto'));
alter table public.common_products drop constraint if exists common_products_status_valid;
alter table public.common_products drop column if exists status;
