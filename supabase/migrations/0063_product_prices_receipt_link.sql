-- Bug real: al borrar un ticket manualmente, el precio guardado en el
-- Historial (product_prices) se quedaba huérfano para siempre, así que
-- una lectura de OCR equivocada seguía apareciendo en el Historial
-- aunque se borrara y se volviera a subir bien el ticket ("en el
-- registro del Historial no lo ha corregido... salen dos veces 3,30 el
-- dos de septiembre"). Se enlaza cada precio con el ticket del que
-- salió, con ON DELETE CASCADE: borrar el ticket a mano borra también
-- su anotación en Historial. El borrado automático a los 3 meses
-- (0056/0057) NUNCA borra la fila de receipts, solo su foto, así que
-- ese cascade no se dispara ahí y el histórico de precios se conserva
-- para siempre como se pidió.
alter table product_prices add column receipt_id uuid references receipts(id) on delete cascade;

create index idx_product_prices_receipt on product_prices(receipt_id);
