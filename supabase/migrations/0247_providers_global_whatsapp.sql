-- Punto 1.4 (prompt de correcciones) — distinguir WhatsApp de teléfono en vez de conflacionarlos en un
-- solo campo ("Teléfono / WhatsApp"). Columna nueva, nunca inferida de `phone`: solo se rellena cuando la
-- familia lo escribe a mano o cuando el documento importado lo indica EXPRESAMENTE (nunca se asume que un
-- teléfono tiene WhatsApp solo por existir).
alter table providers_global add column whatsapp text null;
