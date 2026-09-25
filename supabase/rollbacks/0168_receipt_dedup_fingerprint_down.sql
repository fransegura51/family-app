-- Rollback de 0168 — quita los índices UNIQUE parciales y las dos
-- columnas de huella. No borra ni modifica ningún recibo/gasto/línea
-- ya persistido: source_file_hash/content_fingerprint son puramente
-- informativas para la deduplicación, nada más depende de ellas.
drop index if exists receipts_family_source_hash_uidx;
drop index if exists receipts_family_content_fingerprint_uidx;

alter table receipts drop column if exists source_file_hash;
alter table receipts drop column if exists content_fingerprint;
