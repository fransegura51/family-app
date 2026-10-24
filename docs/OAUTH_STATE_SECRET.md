# Secreto del `state` OAuth (banco y Google Calendar)

Las funciones `enable-banking-auth-start`, `enable-banking-auth-callback`, `google-calendar-oauth-start` y `google-calendar-oauth-callback` firman y verifican el `state` con HMAC-SHA256 (`supabase/functions/_shared/oauthState.ts`). Necesitan el secreto de función `OAUTH_STATE_SECRET`: una cadena aleatoria de al menos 32 caracteres, que solo conoce el servidor.

Cómo configurarlo (lo hace la persona responsable; el valor NO se escribe en el repo, ni en chats, ni en documentos):
1. Generar un valor aleatorio largo en local (por ejemplo, 48 bytes aleatorios en base64 con el gestor de contraseñas o con `openssl rand -base64 48`).
2. Guardarlo como secreto de las Edge Functions: panel de Supabase, Edge Functions, Secrets, nombre `OAUTH_STATE_SECRET` (o `supabase secrets set OAUTH_STATE_SECRET=...` desde la CLI).
3. Desplegar las 4 funciones. Sin el secreto, los `-start` devuelven `not_configured` y los `-callback` rechazan todo (falla cerrado).
Rotarlo: cambiar el valor y volver a desplegar no hace falta (las funciones leen la variable al arrancar); los flujos en curso (10 min como máximo) fallarán una vez.
