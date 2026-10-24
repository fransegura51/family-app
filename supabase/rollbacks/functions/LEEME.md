# Copia de la función del banco anterior (versión 18)

`enable-banking-sync-transactions.v18.index.ts.txt` es el código de la función `enable-banking-sync-transactions` que estaba desplegada en producción
(versión **18**, `verify_jwt = false`, actualizada el 25/09/2026 a las 09:30:09 UTC, `ezbr_sha256` `48460154487f7cb49f103b14692ef625600a9e25c648f4fd52d11aea3ff5aa13`).

Es el contenido del archivo en el commit `1e37c37` (25/09/2026 11:27 hora local, 2,5 minutos antes del despliegue de la versión 18) y es idéntico al que había en el
repositorio justo antes de los cambios de efectivo/pagos mixtos (`3e5b1c6`). SHA-256 del archivo: `0da6d98b46e52ea839985b577568bf22aaf04b73894053435ab0acf910d48900`.

## Restaurarla de inmediato

1. Con el MCP de Supabase: `deploy_edge_function` con `name = enable-banking-sync-transactions`, `verify_jwt = false`, un único archivo `index.ts` con el contenido de
   `enable-banking-sync-transactions.v18.index.ts.txt` (la versión pasará a ser la siguiente, p. ej. 20, pero con el código de la 18).
2. O con la CLI: copiar el archivo a `supabase/functions/enable-banking-sync-transactions/index.ts` y
   `supabase functions deploy enable-banking-sync-transactions --no-verify-jwt --project-ref objhgjgrinbhyzscjlbw`.
3. Comprobar que `verify_jwt` sigue en `false` (el cron lo llama solo con `x-cron-secret`).

La restauración no toca datos: la función antigua solo vuelve a unir por importe sin mirar la forma de pago. Los pagos mixtos y las devoluciones ya enlazados por
la nueva se conservan tal cual.
