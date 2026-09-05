-- Módulo Amazon (email de pedido -> Pepa/Historial): un workflow externo
-- (Outlook reenvía el correo de confirmación a Pipedream, que lo
-- interpreta) llama a un webhook nuestro sin sesión de usuario posible
-- — así que cada familia tiene un token secreto propio para
-- identificarse, en vez de un login. Solo el admin puede verlo/regenerarlo
-- (política ya existente "families: admin update").
alter table families add column amazon_webhook_token uuid not null default gen_random_uuid();
alter table families add constraint families_amazon_webhook_token_key unique (amazon_webhook_token);
