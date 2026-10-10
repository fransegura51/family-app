-- Rollback de 0241_kid_goals_photo_and_tax_fund.sql.
drop table if exists family_tax_fund_expenses;

drop policy if exists "kid_goals storage: family delete" on storage.objects;
drop policy if exists "kid_goals storage: family insert" on storage.objects;
drop policy if exists "kid_goals storage: family select" on storage.objects;
delete from storage.buckets where id = 'kid_goals';

alter table kid_goals drop column if exists photo_mime_type;
alter table kid_goals drop column if exists photo_original_name;
alter table kid_goals drop column if exists photo_storage_path;
alter table kid_goals drop column if exists emoji;
