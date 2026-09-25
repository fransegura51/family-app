-- Protección contra tickets duplicados (mercadona-ticket-webhook).
--
-- Incidente real: un ticket de Mercadona (25/09/2026, 153,60€) se procesó dos
-- veces — Pipedream reportó timeout (~32s con límite de 30s) pero la función
-- ya había terminado de escribir; un reenvío manual posterior del mismo
-- correo creó una segunda compra idéntica. El webhook no tenía NINGUNA
-- protección contra reprocesar el mismo ticket.
--
-- Dos capas, ambas opcionales (NULL) para no romper tickets antiguos ni la
-- subida manual ("Subir ticket", analyze-receipt-photo, que no pasa por este
-- webhook y nunca rellena estas columnas):
--
-- CAPA A — source_file_hash: SHA-256 (hex) de los bytes crudos del PDF/imagen
-- recibido, calculado en el webhook ANTES de llamar a la IA. Detecta un
-- reenvío/replay exacto del mismo archivo sin gastar una llamada de IA.
--
-- CAPA B — content_fingerprint: SHA-256 (hex) de una huella lógica del ticket
-- ya interpretado (familia + tienda + fecha + total + líneas normalizadas y
-- ordenadas), calculada solo cuando la IA extrae datos con éxito. Cubre el
-- caso "mismo ticket, PDF regenerado con bytes distintos" que source_file_hash
-- no puede detectar por sí solo. Nunca se deriva solo de
-- familia+tienda+fecha+total (dos compras reales podrían coincidir en esos
-- cuatro campos): las líneas del ticket son las que aportan la discriminación
-- real.
--
-- Ambas se calculan y se fijan en el webhook SOLO al terminar de persistir el
-- ticket completo (gasto + recibo + todas las líneas) con éxito — nunca antes
-- ni en un intento fallido/parcial — para que un ticket a medio procesar
-- (fallo de IA, fallo insertando una línea) no quede marcado como "ya
-- procesado" y bloquee un reintento legítimo posterior del mismo archivo.
--
-- Índices UNIQUE parciales (WHERE ... IS NOT NULL), mismo patrón ya usado en
-- expenses_shared_from_expense_id_unique: con la columna a NULL, Postgres
-- permite cualquier número de filas antiguas/manuales sin huella. Con la
-- columna rellena, es la última línea de defensa atómica a nivel de base de
-- datos contra dos ejecuciones concurrentes del webhook (evita la condición
-- de carrera de "SELECT no existe -> INSERT" hecha desde la propia función).
--
-- Con alcance por family_id: el mismo archivo/hash recibido por dos familias
-- distintas (aunque compartan el mismo PDF por coincidencia) no se bloquean
-- entre sí.

alter table receipts add column source_file_hash text;
alter table receipts add column content_fingerprint text;

create unique index receipts_family_source_hash_uidx
  on receipts (family_id, source_file_hash)
  where source_file_hash is not null;

create unique index receipts_family_content_fingerprint_uidx
  on receipts (family_id, content_fingerprint)
  where content_fingerprint is not null;
