-- Rollback de 0236_event_payments_ledger_and_bonds.sql.
drop policy if exists "event_payments storage: family delete" on storage.objects;
drop policy if exists "event_payments storage: family insert" on storage.objects;
drop policy if exists "event_payments storage: family select" on storage.objects;
delete from storage.buckets where id = 'event_payments';

drop table if exists event_payment_entries;

alter policy "event_payments: family crud" on event_payments
  using (
    (family_id = (select private.current_family_id()))
    and (select private.has_section_access('eventos'))
  )
  with check (
    (family_id = (select private.current_family_id()))
    and (select private.has_section_access('eventos'))
  );

alter table event_payments drop column if exists attachment_mime_type;
alter table event_payments drop column if exists attachment_original_name;
alter table event_payments drop column if exists attachment_storage_path;
alter table event_payments drop column if exists bond_returned_at;
alter table event_payments drop column if exists bond_amount;
alter table event_payments drop column if exists category;
alter table event_payments drop column if exists budget_item_id;
