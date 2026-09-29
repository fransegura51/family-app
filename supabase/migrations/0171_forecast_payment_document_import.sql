-- Previsión de pagos — importar desde foto o documento (financiación, préstamo, plan de cuotas...), mismo
-- espíritu que "Subir ticket" en Compras. Aditiva: no se toca ninguna fila existente, ninguna columna
-- nueva es obligatoria (nullable siempre) — un pago creado a mano, como hasta ahora, no las usa en absoluto.
--
-- source_storage_path — dónde vive el documento/foto original (bucket forecast_documents, privado, mismo
-- patrón de RLS que 'receipts': <family_id>/<archivo>). A diferencia de receipts, aquí NO hay borrado a
-- los 3 meses: un contrato de préstamo puede necesitar consultarse años después.
--
-- source_file_hash / content_fingerprint — misma protección de duplicados de dos capas ya usada por
-- mercadona-ticket-webhook (ver 0168_receipt_dedup_fingerprint.sql), aplicada aquí a un flujo interactivo
-- (con sesión real, revisión humana antes de guardar) en vez de a un webhook sin sesión:
--   CAPA A (source_file_hash) — SHA-256 del archivo tal cual, calculado en el cliente ANTES de llamar a la
--     IA: detecta "ya subí este documento" sin gastar una llamada de IA.
--   CAPA B (content_fingerprint) — SHA-256 de una huella lógica (familia+entidad+total+primera cuota),
--     calculada DESPUÉS de la extracción: cubre el mismo documento con bytes distintos (p. ej. un PDF
--     re-descargado). Se fija solo al guardar la Previsión definitiva, nunca antes — un análisis que el
--     usuario acaba cancelando no deja ninguna marca.
-- Igual que en receipts: ambas columnas nullable, para no afectar a ningún pago ya existente ni a uno
-- creado a mano (que nunca las rellena). Índices UNIQUE parciales por familia, última línea de defensa
-- atómica contra un doble guardado accidental (doble toque, reintento).

alter table forecast_payments add column source_storage_path text;
alter table forecast_payments add column source_file_hash text;
alter table forecast_payments add column content_fingerprint text;

create unique index forecast_payments_family_source_hash_uidx
  on forecast_payments (family_id, source_file_hash)
  where source_file_hash is not null;

create unique index forecast_payments_family_content_fingerprint_uidx
  on forecast_payments (family_id, content_fingerprint)
  where content_fingerprint is not null;

insert into storage.buckets (id, name, public)
values ('forecast_documents', 'forecast_documents', false)
on conflict (id) do nothing;

create policy "forecast_documents storage: family select" on storage.objects for select
  using (bucket_id = 'forecast_documents' and (storage.foldername(name))[1] = private.current_family_id()::text);

create policy "forecast_documents storage: family insert" on storage.objects for insert
  with check (bucket_id = 'forecast_documents' and (storage.foldername(name))[1] = private.current_family_id()::text);

create policy "forecast_documents storage: family delete" on storage.objects for delete
  using (bucket_id = 'forecast_documents' and (storage.foldername(name))[1] = private.current_family_id()::text);
